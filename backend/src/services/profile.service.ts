import { pool } from "../db/pool";

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  signature: string | null;
  about: string | null;
  website: string | null;
  location: string | null;
  post_count: number;
  role: string;
  created_at: string;
  last_login: string | null;
}

export interface PublicProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  signature: string | null;
  about: string | null;
  website: string | null;
  location: string | null;
  post_count: number;
  role: string;
  created_at: string;
}

export interface UserPost {
  id: string;
  thread_id: string;
  thread_title: string;
  thread_slug: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface UserThread {
  id: string;
  title: string;
  slug: string;
  pinned: boolean;
  locked: boolean;
  views: number;
  post_count: number;
  created_at: string;
  updated_at: string;
}

export interface EditHistoryEntry {
  old_content: string;
  edited_at: string;
}

/* ------------------------------------------------------------------ */
/*  Raw row types (internal – what comes back from pg)                 */
/* ------------------------------------------------------------------ */

interface PublicProfileRow {
  id: string;
  username: string;
  avatar_url: string | null;
  signature: string | null;
  about: string | null;
  website: string | null;
  location: string | null;
  post_count: number;
  role: string;
  created_at: Date;
}

interface UserPostRow {
  id: string;
  thread_id: string;
  thread_title: string;
  thread_slug: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

interface UserThreadRow {
  id: string;
  title: string;
  slug: string;
  pinned: boolean;
  locked: boolean;
  views: number;
  post_count: string; // pg count() returns string
  created_at: Date;
  updated_at: Date;
}

interface EditHistoryRow {
  old_content: string;
  edited_at: Date;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

function toPublicProfile(row: PublicProfileRow): PublicProfile {
  return {
    id: row.id,
    username: row.username,
    avatar_url: row.avatar_url,
    signature: row.signature,
    about: row.about,
    website: row.website,
    location: row.location,
    post_count: row.post_count,
    role: row.role,
    created_at: toISO(row.created_at),
  };
}

function toUserPost(row: UserPostRow): UserPost {
  return {
    id: row.id,
    thread_id: row.thread_id,
    thread_title: row.thread_title,
    thread_slug: row.thread_slug,
    content: row.content,
    created_at: toISO(row.created_at),
    updated_at: toISO(row.updated_at),
  };
}

function toUserThread(row: UserThreadRow): UserThread {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    pinned: row.pinned,
    locked: row.locked,
    views: row.views,
    post_count: Number(row.post_count),
    created_at: toISO(row.created_at),
    updated_at: toISO(row.updated_at),
  };
}

/* ------------------------------------------------------------------ */
/*  1. getProfile                                                     */
/* ------------------------------------------------------------------ */

export async function getProfile(userId: string): Promise<PublicProfile | null> {
  const sql = `
    SELECT id, username, avatar_url, signature, about, website, location,
           post_count, role, created_at
    FROM users
    WHERE id = $1
    LIMIT 1
  `;

  const result = await pool.query<PublicProfileRow>(sql, [userId]);
  return result.rows[0] ? toPublicProfile(result.rows[0]) : null;
}

/* ------------------------------------------------------------------ */
/*  2. updateProfile                                                  */
/* ------------------------------------------------------------------ */

export async function updateProfile(
  userId: string,
  data: { signature?: string; about?: string; website?: string; location?: string }
): Promise<PublicProfile> {
  const fields: string[] = [];
  const values: (string | null)[] = [];
  let idx = 1;

  if (data.signature !== undefined) {
    fields.push(`signature = $${idx++}`);
    values.push(data.signature ?? null);
  }
  if (data.about !== undefined) {
    fields.push(`about = $${idx++}`);
    values.push(data.about ?? null);
  }
  if (data.website !== undefined) {
    fields.push(`website = $${idx++}`);
    values.push(data.website ?? null);
  }
  if (data.location !== undefined) {
    fields.push(`location = $${idx++}`);
    values.push(data.location ?? null);
  }

  if (fields.length === 0) {
    // Nothing to update – return current profile
    const current = await getProfile(userId);
    if (!current) throw new Error("User not found");
    return current;
  }

  const sql = `
    UPDATE users
    SET ${fields.join(", ")}
    WHERE id = $${idx}
    RETURNING id, username, avatar_url, signature, about, website, location,
              post_count, role, created_at
  `;
  values.push(userId);

  const result = await pool.query<PublicProfileRow>(sql, values);
  return toPublicProfile(result.rows[0]);
}

/* ------------------------------------------------------------------ */
/*  3. updateAvatar                                                   */
/* ------------------------------------------------------------------ */

export async function updateAvatar(userId: string, avatarUrl: string): Promise<void> {
  await pool.query(`UPDATE users SET avatar_url = $1 WHERE id = $2`, [avatarUrl, userId]);
}

/* ------------------------------------------------------------------ */
/*  4. getUserPosts                                                   */
/* ------------------------------------------------------------------ */

export async function getUserPosts(
  userId: string,
  page: number,
  limit: number
): Promise<{ posts: UserPost[]; total: number; page: number; totalPages: number }> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM forum_posts WHERE author_id = $1`,
    [userId]
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  const sql = `
    SELECT
      p.id,
      p.thread_id,
      t.title      AS thread_title,
      t.slug       AS thread_slug,
      p.content,
      p.created_at,
      p.updated_at
    FROM forum_posts p
    JOIN forum_threads t ON t.id = p.thread_id
    WHERE p.author_id = $1
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query<UserPostRow>(sql, [userId, safeLimit, offset]);

  return {
    posts: result.rows.map(toUserPost),
    total,
    page: safePage,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/*  5. getUserThreads                                                 */
/* ------------------------------------------------------------------ */

export async function getUserThreads(
  userId: string,
  page: number,
  limit: number
): Promise<{ threads: UserThread[]; total: number; page: number; totalPages: number }> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM forum_threads WHERE author_id = $1`,
    [userId]
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  const sql = `
    SELECT
      t.id,
      t.title,
      t.slug,
      t.pinned,
      t.locked,
      t.views,
      t.created_at,
      t.updated_at,
      COUNT(p.id)::INT    AS post_count
    FROM forum_threads t
    LEFT JOIN forum_posts p ON p.thread_id = t.id
    WHERE t.author_id = $1
    GROUP BY t.id, t.title, t.slug, t.pinned, t.locked, t.views,
             t.created_at, t.updated_at
    ORDER BY t.created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query<UserThreadRow>(sql, [userId, safeLimit, offset]);

  return {
    threads: result.rows.map(toUserThread),
    total,
    page: safePage,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/*  6. incrementPostCount                                             */
/* ------------------------------------------------------------------ */

export async function incrementPostCount(userId: string): Promise<void> {
  await pool.query(`UPDATE users SET post_count = post_count + 1 WHERE id = $1`, [userId]);
}

/* ------------------------------------------------------------------ */
/*  7. decrementPostCount                                             */
/* ------------------------------------------------------------------ */

export async function decrementPostCount(userId: string): Promise<void> {
  await pool.query(`UPDATE users SET post_count = post_count - 1 WHERE id = $1`, [userId]);
}

/* ------------------------------------------------------------------ */
/*  8. getEditHistory                                                 */
/* ------------------------------------------------------------------ */

export async function getEditHistory(postId: string): Promise<EditHistoryEntry[]> {
  const sql = `
    SELECT old_content, edited_at
    FROM forum_edit_history
    WHERE post_id = $1
    ORDER BY edited_at DESC
  `;

  const result = await pool.query<EditHistoryRow>(sql, [postId]);

  return result.rows.map((row) => ({
    old_content: row.old_content,
    edited_at: toISO(row.edited_at),
  }));
}

/* ------------------------------------------------------------------ */
/*  9. recordEditHistory                                              */
/* ------------------------------------------------------------------ */

export async function recordEditHistory(
  postId: string,
  userId: string,
  oldContent: string
): Promise<void> {
  await pool.query(
    `INSERT INTO forum_edit_history (post_id, user_id, old_content) VALUES ($1, $2, $3)`,
    [postId, userId, oldContent]
  );
}
