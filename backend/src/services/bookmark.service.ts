import { pool } from "../db/pool";

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

export interface Bookmark {
  id: string;
  post_id: string;
  thread_id: string;
  thread_title: string;
  thread_slug: string;
  content_preview: string;
  author_id: string;
  author_username: string;
  created_at: string;
}

export interface BookmarksResponse {
  bookmarks: Bookmark[];
  total: number;
  page: number;
  totalPages: number;
}

/* ------------------------------------------------------------------ */
/*  Raw row types (internal – what comes back from pg)                 */
/* ------------------------------------------------------------------ */

interface BookmarkRow {
  id: string;
  post_id: string;
  thread_id: string;
  thread_title: string;
  thread_slug: string;
  content: string;
  author_id: string;
  author_username: string;
  created_at: Date;
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
 * Truncates text to a given length and appends ellipsis if needed.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

function toBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    post_id: row.post_id,
    thread_id: row.thread_id,
    thread_title: row.thread_title,
    thread_slug: row.thread_slug,
    content_preview: truncate(row.content, 200),
    author_id: row.author_id,
    author_username: row.author_username,
    created_at: toISO(row.created_at),
  };
}

/* ------------------------------------------------------------------ */
/*  1. toggleBookmark                                                 */
/* ------------------------------------------------------------------ */

export async function toggleBookmark(
  userId: string,
  postId: string
): Promise<{ bookmarked: boolean }> {
  // Check if a bookmark already exists
  const existing = await pool.query(
    `SELECT id FROM forum_bookmarks WHERE user_id = $1 AND post_id = $2`,
    [userId, postId]
  );

  if (existing.rows.length > 0) {
    // Remove bookmark
    await pool.query(
      `DELETE FROM forum_bookmarks WHERE user_id = $1 AND post_id = $2`,
      [userId, postId]
    );
    return { bookmarked: false };
  }

  // Add bookmark
  await pool.query(
    `INSERT INTO forum_bookmarks (user_id, post_id) VALUES ($1, $2)`,
    [userId, postId]
  );
  return { bookmarked: true };
}

/* ------------------------------------------------------------------ */
/*  2. getBookmarks                                                   */
/* ------------------------------------------------------------------ */

export async function getBookmarks(
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<BookmarksResponse> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  // Total count
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM forum_bookmarks b
     WHERE b.user_id = $1`,
    [userId]
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  // Paginated results with post content preview and thread info
  const sql = `
    SELECT
      b.id,
      b.post_id,
      t.id               AS thread_id,
      t.title            AS thread_title,
      t.slug             AS thread_slug,
      p.content,
      p.author_id,
      u.username         AS author_username,
      b.created_at
    FROM forum_bookmarks b
    JOIN forum_posts p   ON p.id = b.post_id
    JOIN forum_threads t ON t.id = p.thread_id
    JOIN users u         ON u.id = p.author_id
    WHERE b.user_id = $1
    ORDER BY b.created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query<BookmarkRow>(sql, [userId, safeLimit, offset]);

  return {
    bookmarks: result.rows.map(toBookmark),
    total,
    page: safePage,
    totalPages,
  };
}
