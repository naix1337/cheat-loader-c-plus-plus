import { pool } from "../db/pool";
import { createNotification } from "./notification.service";

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

export interface WatchedThread {
  thread_id: string;
  title: string;
  slug: string;
  author_id: string;
  author_username: string;
  last_post_id: string | null;
  last_post_author_id: string | null;
  last_post_author_username: string | null;
  last_post_created_at: string | null;
  updated_at: string;
}

export interface WatchedThreadsResponse {
  threads: WatchedThread[];
  total: number;
  page: number;
  totalPages: number;
}

/* ------------------------------------------------------------------ */
/*  Raw row types (internal – what comes back from pg)                 */
/* ------------------------------------------------------------------ */

interface WatchedThreadRow {
  thread_id: string;
  title: string;
  slug: string;
  author_id: string;
  author_username: string;
  last_post_id: string | null;
  last_post_author_id: string | null;
  last_post_author_username: string | null;
  last_post_created_at: Date | null;
  updated_at: Date;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toISO(value: Date | string | null | undefined): string {
  if (value == null) return new Date(0).toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return value.toISOString();
}

function toWatchedThread(row: WatchedThreadRow): WatchedThread {
  return {
    thread_id: row.thread_id,
    title: row.title,
    slug: row.slug,
    author_id: row.author_id,
    author_username: row.author_username,
    last_post_id: row.last_post_id,
    last_post_author_id: row.last_post_author_id,
    last_post_author_username: row.last_post_author_username,
    last_post_created_at: row.last_post_created_at
      ? toISO(row.last_post_created_at)
      : null,
    updated_at: toISO(row.updated_at),
  };
}

/* ------------------------------------------------------------------ */
/*  1. toggleThreadWatch                                              */
/* ------------------------------------------------------------------ */

export async function toggleThreadWatch(
  userId: string,
  threadId: string
): Promise<{ watching: boolean }> {
  // Check if a watch already exists
  const existing = await pool.query(
    `SELECT id FROM forum_thread_watches WHERE user_id = $1 AND thread_id = $2`,
    [userId, threadId]
  );

  if (existing.rows.length > 0) {
    // Unwatch
    await pool.query(
      `DELETE FROM forum_thread_watches WHERE user_id = $1 AND thread_id = $2`,
      [userId, threadId]
    );
    return { watching: false };
  }

  // Watch
  await pool.query(
    `INSERT INTO forum_thread_watches (user_id, thread_id) VALUES ($1, $2)`,
    [userId, threadId]
  );
  return { watching: true };
}

/* ------------------------------------------------------------------ */
/*  2. getWatchedThreads                                              */
/* ------------------------------------------------------------------ */

export async function getWatchedThreads(
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<WatchedThreadsResponse> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  // Total count
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM forum_thread_watches w
     WHERE w.user_id = $1`,
    [userId]
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  // Paginated results with thread info and last post info
  const sql = `
    SELECT
      t.id                     AS thread_id,
      t.title,
      t.slug,
      t.author_id,
      u.username               AS author_username,
      lp.id                    AS last_post_id,
      lp.author_id             AS last_post_author_id,
      lp_u.username            AS last_post_author_username,
      lp.created_at            AS last_post_created_at,
      t.updated_at
    FROM forum_thread_watches w
    JOIN forum_threads t       ON t.id = w.thread_id
    JOIN users u               ON u.id = t.author_id
    LEFT JOIN LATERAL (
      SELECT p.id, p.author_id, p.created_at
      FROM forum_posts p
      WHERE p.thread_id = t.id
      ORDER BY p.created_at DESC
      LIMIT 1
    ) lp ON TRUE
    LEFT JOIN users lp_u       ON lp_u.id = lp.author_id
    WHERE w.user_id = $1
    ORDER BY t.updated_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query<WatchedThreadRow>(sql, [userId, safeLimit, offset]);

  return {
    threads: result.rows.map(toWatchedThread),
    total,
    page: safePage,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/*  3. isWatching                                                     */
/* ------------------------------------------------------------------ */

export async function isWatching(
  userId: string,
  threadId: string
): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::INT AS count
     FROM forum_thread_watches
     WHERE user_id = $1 AND thread_id = $2`,
    [userId, threadId]
  );

  return Number(result.rows[0].count) > 0;
}

/* ------------------------------------------------------------------ */
/*  4. notifyWatchers                                                 */
/* ------------------------------------------------------------------ */

export async function notifyWatchers(
  threadId: string,
  postId: string,
  actorId: string
): Promise<number> {
  // Get all watchers of the thread (excluding the actor)
  const watchers = await pool.query<{ user_id: string }>(
    `SELECT user_id
     FROM forum_thread_watches
     WHERE thread_id = $1 AND user_id != $2`,
    [threadId, actorId]
  );

  let count = 0;

  for (const row of watchers.rows) {
    await createNotification(
      row.user_id,
      actorId,
      "post",
      postId,
      "new_post"
    );
    count++;
  }

  return count;
}
