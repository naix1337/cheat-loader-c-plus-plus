import { pool } from "../db/pool";

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

export interface LastPostInfo {
  thread_id: string;
  thread_title: string;
  thread_slug: string;
  post_id: string;
  author_id: string;
  author_username: string;
  created_at: string;
}

export interface ForumCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  thread_count: number;
  last_post: LastPostInfo | null;
  created_at: string;
}

export interface ThreadListItem {
  id: string;
  title: string;
  slug: string;
  pinned: boolean;
  locked: boolean;
  views: number;
  author_id: string;
  author_username: string;
  post_count: number;
  last_post: LastPostInfo | null;
  created_at: string;
  updated_at: string;
}

export interface ThreadDetail {
  id: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  title: string;
  slug: string;
  pinned: boolean;
  locked: boolean;
  views: number;
  author_id: string;
  author_username: string;
  created_at: string;
  updated_at: string;
}

export interface PostDetail {
  id: string;
  thread_id: string;
  author_id: string;
  author_username: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
}

/**
 * Coerces a raw database timestamp value into an ISO-8601 string.
 * pg returns Date objects for timestamptz columns, but we defensively
 * handle strings too so callers always get a consistent format.
 */
function toISO(value: Date | string | null | undefined): string {
  if (value == null) return new Date(0).toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return value.toISOString();
}

/* ------------------------------------------------------------------ */
/*  Raw row types (internal – what comes back from pg)                 */
/* ------------------------------------------------------------------ */

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  created_at: Date;
}

interface CategoryAggRow extends CategoryRow {
  thread_count: string; // pg count() returns string
  last_thread_id: string | null;
  last_thread_title: string | null;
  last_thread_slug: string | null;
  last_post_id: string | null;
  last_author_id: string | null;
  last_author_username: string | null;
  last_post_created_at: Date | null;
}

interface ThreadRow {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  pinned: boolean;
  locked: boolean;
  views: number;
  author_id: string;
  author_username: string;
  created_at: Date;
  updated_at: Date;
}

interface ThreadAggRow extends ThreadRow {
  post_count: string;
  last_thread_id: string | null;
  last_thread_title: string | null;
  last_thread_slug: string | null;
  last_post_id: string | null;
  last_author_id: string | null;
  last_author_username: string | null;
  last_post_created_at: Date | null;
}

interface PostRow {
  id: string;
  thread_id: string;
  author_id: string;
  author_username: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

/* ------------------------------------------------------------------ */
/*  Mapping helpers                                                    */
/* ------------------------------------------------------------------ */

function toLastPostInfo(row: {
  last_thread_id: string | null;
  last_thread_title: string | null;
  last_thread_slug: string | null;
  last_post_id: string | null;
  last_author_id: string | null;
  last_author_username: string | null;
  last_post_created_at: Date | null;
}): LastPostInfo | null {
  if (!row.last_post_id || !row.last_thread_id) return null;
  return {
    thread_id: row.last_thread_id,
    thread_title: row.last_thread_title ?? "",
    thread_slug: row.last_thread_slug ?? "",
    post_id: row.last_post_id,
    author_id: row.last_author_id ?? "",
    author_username: row.last_author_username ?? "",
    created_at: toISO(row.last_post_created_at),
  };
}

function toForumCategory(row: CategoryAggRow): ForumCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sort_order: row.sort_order,
    thread_count: Number(row.thread_count),
    last_post: toLastPostInfo(row),
    created_at: toISO(row.created_at),
  };
}

function toThreadListItem(row: ThreadAggRow): ThreadListItem {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    pinned: row.pinned,
    locked: row.locked,
    views: row.views,
    author_id: row.author_id,
    author_username: row.author_username,
    post_count: Number(row.post_count),
    last_post: toLastPostInfo(row),
    created_at: toISO(row.created_at),
    updated_at: toISO(row.updated_at),
  };
}

function toThreadDetail(
  row: ThreadRow & { category_name: string; category_slug: string }
): ThreadDetail {
  return {
    id: row.id,
    category_id: row.category_id,
    category_name: row.category_name,
    category_slug: row.category_slug,
    title: row.title,
    slug: row.slug,
    pinned: row.pinned,
    locked: row.locked,
    views: row.views,
    author_id: row.author_id,
    author_username: row.author_username,
    created_at: toISO(row.created_at),
    updated_at: toISO(row.updated_at),
  };
}

function toPostDetail(row: PostRow): PostDetail {
  return {
    id: row.id,
    thread_id: row.thread_id,
    author_id: row.author_id,
    author_username: row.author_username,
    content: row.content,
    created_at: toISO(row.created_at),
    updated_at: toISO(row.updated_at),
  };
}

/* ------------------------------------------------------------------ */
/*  1. listCategories                                                  */
/* ------------------------------------------------------------------ */

export async function listCategories(): Promise<ForumCategory[]> {
  const sql = `
    SELECT
      c.id,
      c.name,
      c.slug,
      c.description,
      c.sort_order,
      c.created_at,
      COUNT(t.id)::INT                            AS thread_count,
      lp.last_thread_id,
      lp.last_thread_title,
      lp.last_thread_slug,
      lp.last_post_id,
      lp.last_author_id,
      lp.last_author_username,
      lp.last_post_created_at
    FROM forum_categories c
    LEFT JOIN forum_threads t ON t.category_id = c.id
    LEFT JOIN LATERAL (
      SELECT
        t2.id          AS last_thread_id,
        t2.title       AS last_thread_title,
        t2.slug        AS last_thread_slug,
        p.id           AS last_post_id,
        p.author_id    AS last_author_id,
        u.username     AS last_author_username,
        p.created_at   AS last_post_created_at
      FROM forum_threads t2
      JOIN forum_posts p   ON p.thread_id = t2.id
      JOIN users u         ON u.id = p.author_id
      WHERE t2.category_id = c.id
      ORDER BY p.created_at DESC
      LIMIT 1
    ) lp ON TRUE
    GROUP BY c.id, c.name, c.slug, c.description, c.sort_order, c.created_at,
             lp.last_thread_id, lp.last_thread_title, lp.last_thread_slug,
             lp.last_post_id, lp.last_author_id, lp.last_author_username,
             lp.last_post_created_at
    ORDER BY c.sort_order ASC
  `;

  const result = await pool.query<CategoryAggRow>(sql);
  return result.rows.map(toForumCategory);
}

/* ------------------------------------------------------------------ */
/*  2. listThreads                                                     */
/* ------------------------------------------------------------------ */

export async function listThreads(
  categorySlug: string,
  page: number,
  limit: number
): Promise<{ threads: ThreadListItem[]; total: number; page: number; totalPages: number }> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  // Get total count
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM forum_threads t
     JOIN forum_categories c ON c.id = t.category_id
     WHERE c.slug = $1`,
    [categorySlug]
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  const sql = `
    SELECT
      t.id,
      t.category_id,
      t.title,
      t.slug,
      t.pinned,
      t.locked,
      t.views,
      t.author_id,
      u.username           AS author_username,
      t.created_at,
      t.updated_at,
      COUNT(p.id)::INT     AS post_count,
      lp.last_thread_id,
      lp.last_thread_title,
      lp.last_thread_slug,
      lp.last_post_id,
      lp.last_author_id,
      lp.last_author_username,
      lp.last_post_created_at
    FROM forum_threads t
    JOIN forum_categories c ON c.id = t.category_id
    JOIN users u            ON u.id = t.author_id
    LEFT JOIN forum_posts p ON p.thread_id = t.id
    LEFT JOIN LATERAL (
      SELECT
        t.id           AS last_thread_id,
        t.title        AS last_thread_title,
        t.slug         AS last_thread_slug,
        pp.id          AS last_post_id,
        pp.author_id   AS last_author_id,
        uu.username    AS last_author_username,
        pp.created_at  AS last_post_created_at
      FROM forum_posts pp
      JOIN users uu ON uu.id = pp.author_id
      WHERE pp.thread_id = t.id
      ORDER BY pp.created_at DESC
      LIMIT 1
    ) lp ON TRUE
    WHERE c.slug = $1
    GROUP BY t.id, t.category_id, t.title, t.slug, t.pinned, t.locked,
             t.views, t.author_id, u.username, t.created_at, t.updated_at,
             lp.last_thread_id, lp.last_thread_title, lp.last_thread_slug,
             lp.last_post_id, lp.last_author_id, lp.last_author_username,
             lp.last_post_created_at
    ORDER BY t.pinned DESC, t.updated_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query<ThreadAggRow>(sql, [categorySlug, safeLimit, offset]);

  return {
    threads: result.rows.map(toThreadListItem),
    total,
    page: safePage,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/*  3. getThreadBySlug                                                 */
/* ------------------------------------------------------------------ */

export async function getThreadBySlug(slug: string): Promise<ThreadDetail | null> {
  const sql = `
    SELECT
      t.id,
      t.category_id,
      c.name          AS category_name,
      c.slug          AS category_slug,
      t.title,
      t.slug,
      t.pinned,
      t.locked,
      t.views,
      t.author_id,
      u.username      AS author_username,
      t.created_at,
      t.updated_at
    FROM forum_threads t
    JOIN forum_categories c ON c.id = t.category_id
    JOIN users u            ON u.id = t.author_id
    WHERE t.slug = $1
    LIMIT 1
  `;

  const result = await pool.query<
    ThreadRow & { category_name: string; category_slug: string }
  >(sql, [slug]);

  return result.rows[0] ? toThreadDetail(result.rows[0]) : null;
}

/* ------------------------------------------------------------------ */
/*  4. getPostsByThread                                                */
/* ------------------------------------------------------------------ */

export async function getPostsByThread(
  threadSlug: string,
  page: number,
  limit: number
): Promise<{ posts: PostDetail[]; total: number; page: number; totalPages: number }> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM forum_posts p
     JOIN forum_threads t ON t.id = p.thread_id
     WHERE t.slug = $1`,
    [threadSlug]
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  const sql = `
    SELECT
      p.id,
      p.thread_id,
      p.author_id,
      u.username   AS author_username,
      p.content,
      p.created_at,
      p.updated_at
    FROM forum_posts p
    JOIN forum_threads t ON t.id = p.thread_id
    JOIN users u         ON u.id = p.author_id
    WHERE t.slug = $1
    ORDER BY p.created_at ASC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query<PostRow>(sql, [threadSlug, safeLimit, offset]);

  return {
    posts: result.rows.map(toPostDetail),
    total,
    page: safePage,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/*  5. createThread                                                    */
/* ------------------------------------------------------------------ */

export async function createThread(
  categorySlug: string,
  authorId: string,
  title: string,
  content: string
): Promise<ThreadDetail> {
  const threadSlug = slugify(title);

  const sql = `
    WITH cat AS (
      SELECT id FROM forum_categories WHERE slug = $1 LIMIT 1
    ), thr AS (
      INSERT INTO forum_threads (category_id, author_id, title, slug)
      VALUES ((SELECT id FROM cat), $2, $3, $4)
      RETURNING *
    ), post AS (
      INSERT INTO forum_posts (thread_id, author_id, content)
      VALUES ((SELECT id FROM thr), $2, $5)
    )
    SELECT
      thr.id,
      thr.category_id,
      cat2.name      AS category_name,
      cat2.slug      AS category_slug,
      thr.title,
      thr.slug,
      thr.pinned,
      thr.locked,
      thr.views,
      thr.author_id,
      u.username     AS author_username,
      thr.created_at,
      thr.updated_at
    FROM thr
    JOIN forum_categories cat2 ON cat2.id = thr.category_id
    JOIN users u               ON u.id = thr.author_id
  `;

  const result = await pool.query<
    ThreadRow & { category_name: string; category_slug: string }
  >(sql, [categorySlug, authorId, title, threadSlug, content]);

  return toThreadDetail(result.rows[0]);
}

/* ------------------------------------------------------------------ */
/*  6. createPost                                                      */
/* ------------------------------------------------------------------ */

export async function createPost(
  threadSlug: string,
  authorId: string,
  content: string
): Promise<PostDetail> {
  const sql = `
    WITH thr AS (
      SELECT id, locked FROM forum_threads WHERE slug = $1 LIMIT 1
    ), ins AS (
      INSERT INTO forum_posts (thread_id, author_id, content)
      SELECT id, $2, $3 FROM thr WHERE locked = FALSE
      RETURNING *
    ), upd AS (
      UPDATE forum_threads SET updated_at = NOW()
      WHERE id = (SELECT id FROM thr WHERE locked = FALSE)
    )
    SELECT
      ins.id,
      ins.thread_id,
      ins.author_id,
      u.username   AS author_username,
      ins.content,
      ins.created_at,
      ins.updated_at
    FROM ins
    JOIN users u ON u.id = ins.author_id
  `;

  const result = await pool.query<PostRow>(sql, [threadSlug, authorId, content]);

  if (result.rows.length === 0) {
    // Check if thread exists at all to give a better error
    const exists = await pool.query(
      `SELECT locked FROM forum_threads WHERE slug = $1`,
      [threadSlug]
    );
    if (exists.rows.length === 0) {
      throw new Error("Thread not found");
    }
    throw new Error("Cannot post to a locked thread");
  }

  return toPostDetail(result.rows[0]);
}

/* ------------------------------------------------------------------ */
/*  7. updatePost                                                      */
/* ------------------------------------------------------------------ */

export async function updatePost(
  postId: string,
  userId: string,
  content: string
): Promise<PostDetail | null> {
  const sql = `
    UPDATE forum_posts
    SET content = $1, updated_at = NOW()
    WHERE id = $2 AND author_id = $3
    RETURNING *
  `;

  const result = await pool.query<PostRow>(sql, [content, postId, userId]);

  if (result.rows.length === 0) return null;

  // Attach author username
  const post = result.rows[0];
  const userResult = await pool.query<{ username: string }>(
    `SELECT username FROM users WHERE id = $1`,
    [post.author_id]
  );
  post.author_username = userResult.rows[0]?.username ?? "";

  return toPostDetail(post);
}

/* ------------------------------------------------------------------ */
/*  8. deletePost                                                      */
/* ------------------------------------------------------------------ */

export async function deletePost(
  postId: string,
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  let sql: string;
  let params: string[];

  if (isAdmin) {
    sql = `DELETE FROM forum_posts WHERE id = $1`;
    params = [postId];
  } else {
    sql = `DELETE FROM forum_posts WHERE id = $1 AND author_id = $2`;
    params = [postId, userId];
  }

  const result = await pool.query(sql, params);
  return (result.rowCount ?? 0) > 0;
}

/* ------------------------------------------------------------------ */
/*  9. pinThread                                                       */
/* ------------------------------------------------------------------ */

export async function pinThread(
  threadId: string,
  _userId: string,
  isAdmin: boolean
): Promise<boolean> {
  if (!isAdmin) return false;

  const result = await pool.query<{ pinned: boolean }>(
    `UPDATE forum_threads
     SET pinned = NOT pinned, updated_at = NOW()
     WHERE id = $1
     RETURNING pinned`,
    [threadId]
  );

  return result.rows[0]?.pinned ?? false;
}

/* ------------------------------------------------------------------ */
/*  10. lockThread                                                     */
/* ------------------------------------------------------------------ */

export async function lockThread(
  threadId: string,
  _userId: string,
  isAdmin: boolean
): Promise<boolean> {
  if (!isAdmin) return false;

  const result = await pool.query<{ locked: boolean }>(
    `UPDATE forum_threads
     SET locked = NOT locked, updated_at = NOW()
     WHERE id = $1
     RETURNING locked`,
    [threadId]
  );

  return result.rows[0]?.locked ?? false;
}

/* ------------------------------------------------------------------ */
/*  11. incrementViews                                                 */
/* ------------------------------------------------------------------ */

export async function incrementViews(threadSlug: string): Promise<void> {
  await pool.query(
    `UPDATE forum_threads SET views = views + 1 WHERE slug = $1`,
    [threadSlug]
  );
}

/* ------------------------------------------------------------------ */
/*  12. getCategoryBySlug                                              */
/* ------------------------------------------------------------------ */

export async function getCategoryBySlug(slug: string): Promise<ForumCategory | null> {
  const sql = `
    SELECT
      c.id,
      c.name,
      c.slug,
      c.description,
      c.sort_order,
      c.created_at,
      COUNT(t.id)::INT                            AS thread_count,
      lp.last_thread_id,
      lp.last_thread_title,
      lp.last_thread_slug,
      lp.last_post_id,
      lp.last_author_id,
      lp.last_author_username,
      lp.last_post_created_at
    FROM forum_categories c
    LEFT JOIN forum_threads t ON t.category_id = c.id
    LEFT JOIN LATERAL (
      SELECT
        t2.id          AS last_thread_id,
        t2.title       AS last_thread_title,
        t2.slug        AS last_thread_slug,
        p.id           AS last_post_id,
        p.author_id    AS last_author_id,
        u.username     AS last_author_username,
        p.created_at   AS last_post_created_at
      FROM forum_threads t2
      JOIN forum_posts p   ON p.thread_id = t2.id
      JOIN users u         ON u.id = p.author_id
      WHERE t2.category_id = c.id
      ORDER BY p.created_at DESC
      LIMIT 1
    ) lp ON TRUE
    WHERE c.slug = $1
    GROUP BY c.id, c.name, c.slug, c.description, c.sort_order, c.created_at,
             lp.last_thread_id, lp.last_thread_title, lp.last_thread_slug,
             lp.last_post_id, lp.last_author_id, lp.last_author_username,
             lp.last_post_created_at
    LIMIT 1
  `;

  const result = await pool.query<CategoryAggRow>(sql, [slug]);
  return result.rows[0] ? toForumCategory(result.rows[0]) : null;
}
