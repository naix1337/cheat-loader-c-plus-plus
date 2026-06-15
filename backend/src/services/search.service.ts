import { pool } from "../db/pool";

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

export interface SearchResult {
  id: string;
  title: string;
  slug: string;
  content_preview: string;
  author_id: string;
  author_username: string;
  thread_id?: string;
  category_name?: string;
  category_slug?: string;
  post_count?: number;
  created_at: string;
  rank: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  totalPages: number;
}

/* ------------------------------------------------------------------ */
/*  Raw row types (internal – what comes back from pg)                 */
/* ------------------------------------------------------------------ */

interface PostSearchRow {
  id: string;
  thread_id: string;
  title: string;
  slug: string;
  content: string;
  author_id: string;
  author_username: string;
  created_at: Date;
  rank: number;
}

interface ThreadSearchRow {
  id: string;
  title: string;
  slug: string;
  author_id: string;
  author_username: string;
  category_name: string;
  category_slug: string;
  post_count: string;
  created_at: Date;
  rank: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toISO(value: Date | string | null | undefined): string {
  if (value == null) return new Date(0).toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return value.toISOString();
}

/**
 * Transforms user query into a PostgreSQL tsquery-compatible string.
 * Splits on whitespace and joins with '&' so all terms must match.
 * Strips characters that could break tsquery syntax.
 */
function buildTsQuery(query: string): string {
  const sanitized = query.replace(/[^\w\säöüÄÖÜß-]/g, " ").trim();
  if (!sanitized) return "";
  const words = sanitized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return words.map((w) => `${w}:*`).join(" & ");
}

/**
 * Truncates text to a given length and appends ellipsis if needed.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

/* ------------------------------------------------------------------ */
/*  1. search                                                         */
/* ------------------------------------------------------------------ */

export async function search(
  query: string,
  type: "threads" | "posts",
  page: number = 1,
  limit: number = 20
): Promise<SearchResponse> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  const tsquery = buildTsQuery(query);

  if (type === "posts") {
    return searchPosts(query, tsquery, safePage, safeLimit, offset);
  }

  return searchThreads(query, tsquery, safePage, safeLimit, offset);
}

/**
 * Search forum_posts using full-text search with ILIKE fallback.
 */
async function searchPosts(
  query: string,
  tsquery: string,
  safePage: number,
  safeLimit: number,
  offset: number
): Promise<SearchResponse> {
  let total: number;
  let rows: PostSearchRow[];

  if (tsquery) {
    try {
      // Count
      const countResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM forum_posts p
         JOIN forum_threads t ON t.id = p.thread_id
         WHERE p.search_vector @@ to_tsquery('german', $1)`,
        [tsquery]
      );
      total = Number(countResult.rows[0].count);

      // Paginated results
      const sql = `
        SELECT
          p.id,
          t.id              AS thread_id,
          t.title,
          t.slug,
          p.content,
          p.author_id,
          u.username        AS author_username,
          p.created_at,
          ts_rank(p.search_vector, to_tsquery('german', $1)) AS rank
        FROM forum_posts p
        JOIN forum_threads t ON t.id = p.thread_id
        JOIN users u         ON u.id = p.author_id
        WHERE p.search_vector @@ to_tsquery('german', $1)
        ORDER BY rank DESC, p.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await pool.query<PostSearchRow>(sql, [tsquery, safeLimit, offset]);
      rows = result.rows;
    } catch {
      // tsquery failed (invalid syntax) – fall through to ILIKE
      return searchPostsFallback(query, safePage, safeLimit, offset);
    }
  } else {
    return searchPostsFallback(query, safePage, safeLimit, offset);
  }

  const totalPages = Math.ceil(total / safeLimit);

  return {
    results: rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      content_preview: truncate(r.content, 200),
      author_id: r.author_id,
      author_username: r.author_username,
      thread_id: r.thread_id,
      created_at: toISO(r.created_at),
      rank: r.rank,
    })),
    total,
    page: safePage,
    totalPages,
  };
}

/**
 * Fallback ILIKE search for posts when tsquery is empty or fails.
 */
async function searchPostsFallback(
  query: string,
  safePage: number,
  safeLimit: number,
  offset: number
): Promise<SearchResponse> {
  const likePattern = `%${query}%`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM forum_posts p
     JOIN forum_threads t ON t.id = p.thread_id
     WHERE p.content ILIKE $1`,
    [likePattern]
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  const sql = `
    SELECT
      p.id,
      t.id              AS thread_id,
      t.title,
      t.slug,
      p.content,
      p.author_id,
      u.username        AS author_username,
      p.created_at,
      0::REAL           AS rank
    FROM forum_posts p
    JOIN forum_threads t ON t.id = p.thread_id
    JOIN users u         ON u.id = p.author_id
    WHERE p.content ILIKE $1
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query<PostSearchRow>(sql, [likePattern, safeLimit, offset]);

  return {
    results: result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      content_preview: truncate(r.content, 200),
      author_id: r.author_id,
      author_username: r.author_username,
      thread_id: r.thread_id,
      created_at: toISO(r.created_at),
      rank: r.rank,
    })),
    total,
    page: safePage,
    totalPages,
  };
}

/**
 * Search forum_threads using full-text search with ILIKE fallback.
 */
async function searchThreads(
  query: string,
  tsquery: string,
  safePage: number,
  safeLimit: number,
  offset: number
): Promise<SearchResponse> {
  let total: number;
  let rows: ThreadSearchRow[];

  if (tsquery) {
    try {
      // Count
      const countResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM forum_threads t
         WHERE t.search_vector @@ to_tsquery('german', $1)`,
        [tsquery]
      );
      total = Number(countResult.rows[0].count);

      // Paginated results
      const sql = `
        SELECT
          t.id,
          t.title,
          t.slug,
          t.author_id,
          u.username             AS author_username,
          c.name                 AS category_name,
          c.slug                 AS category_slug,
          COUNT(p.id)::INT       AS post_count,
          t.created_at,
          ts_rank(t.search_vector, to_tsquery('german', $1)) AS rank
        FROM forum_threads t
        JOIN users u              ON u.id = t.author_id
        JOIN forum_categories c   ON c.id = t.category_id
        LEFT JOIN forum_posts p   ON p.thread_id = t.id
        WHERE t.search_vector @@ to_tsquery('german', $1)
        GROUP BY t.id, t.title, t.slug, t.author_id, u.username,
                 c.name, c.slug, t.created_at
        ORDER BY rank DESC, t.updated_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await pool.query<ThreadSearchRow>(sql, [tsquery, safeLimit, offset]);
      rows = result.rows;
    } catch {
      // tsquery failed – fall through to ILIKE
      return searchThreadsFallback(query, safePage, safeLimit, offset);
    }
  } else {
    return searchThreadsFallback(query, safePage, safeLimit, offset);
  }

  const totalPages = Math.ceil(total / safeLimit);

  return {
    results: rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      content_preview: r.title,
      author_id: r.author_id,
      author_username: r.author_username,
      category_name: r.category_name,
      category_slug: r.category_slug,
      post_count: Number(r.post_count),
      created_at: toISO(r.created_at),
      rank: r.rank,
    })),
    total,
    page: safePage,
    totalPages,
  };
}

/**
 * Fallback ILIKE search for threads when tsquery is empty or fails.
 */
async function searchThreadsFallback(
  query: string,
  safePage: number,
  safeLimit: number,
  offset: number
): Promise<SearchResponse> {
  const likePattern = `%${query}%`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM forum_threads t
     WHERE t.title ILIKE $1`,
    [likePattern]
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  const sql = `
    SELECT
      t.id,
      t.title,
      t.slug,
      t.author_id,
      u.username             AS author_username,
      c.name                 AS category_name,
      c.slug                 AS category_slug,
      COUNT(p.id)::INT       AS post_count,
      t.created_at,
      0::REAL                AS rank
    FROM forum_threads t
    JOIN users u              ON u.id = t.author_id
    JOIN forum_categories c   ON c.id = t.category_id
    LEFT JOIN forum_posts p   ON p.thread_id = t.id
    WHERE t.title ILIKE $1
    GROUP BY t.id, t.title, t.slug, t.author_id, u.username,
             c.name, c.slug, t.created_at
    ORDER BY t.updated_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query<ThreadSearchRow>(sql, [likePattern, safeLimit, offset]);

  return {
    results: result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      content_preview: r.title,
      author_id: r.author_id,
      author_username: r.author_username,
      category_name: r.category_name,
      category_slug: r.category_slug,
      post_count: Number(r.post_count),
      created_at: toISO(r.created_at),
      rank: r.rank,
    })),
    total,
    page: safePage,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/*  2. getSearchSuggestions                                           */
/* ------------------------------------------------------------------ */

export async function getSearchSuggestions(
  query: string,
  limit: number = 10
): Promise<string[]> {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const likePattern = `%${query}%`;

  const result = await pool.query<{ title: string }>(
    `SELECT DISTINCT title
     FROM forum_threads
     WHERE title ILIKE $1
     LIMIT $2`,
    [likePattern, safeLimit]
  );

  return result.rows.map((r) => r.title);
}
