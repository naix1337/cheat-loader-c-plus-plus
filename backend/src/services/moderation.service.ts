import { pool } from "../db/pool";

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

export interface Report {
  id: string;
  post_id: string;
  thread_title: string;
  thread_slug: string;
  reporter_id: string;
  reporter_username: string;
  reason: string;
  status: string;
  handled_by: string | null;
  handler_username: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface Ban {
  id: string;
  user_id: string;
  username: string;
  banned_by: string;
  banner_username: string;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
  lifted_at: string | null;
}

export interface Warning {
  id: string;
  user_id: string;
  username: string;
  warned_by: string;
  warner_username: string;
  points: number;
  reason: string | null;
  created_at: string;
}

export interface ModLogEntry {
  id: string;
  moderator_id: string;
  moderator_username: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  description: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Coerces a raw database timestamp value into an ISO-8601 string.
 * pg returns Date objects for timestamptz columns, but we defensively
 * handle strings too so callers always get a consistent format.
 */
function toISO(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return new Date(value).toISOString();
  return value.toISOString();
}

/* ------------------------------------------------------------------ */
/*  Raw row types (internal - what comes back from pg)                  */
/* ------------------------------------------------------------------ */

interface ReportRow {
  id: string;
  post_id: string;
  reporter_id: string;
  reporter_username: string;
  reason: string;
  status: string;
  handled_by: string | null;
  handler_username: string | null;
  thread_title: string;
  thread_slug: string;
  created_at: Date;
  resolved_at: Date | null;
}

interface BanRow {
  id: string;
  user_id: string;
  username: string;
  banned_by: string;
  banner_username: string;
  reason: string | null;
  expires_at: Date | null;
  created_at: Date;
  lifted_at: Date | null;
}

interface ModLogRow {
  id: string;
  moderator_id: string;
  moderator_username: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  description: string | null;
  created_at: Date;
}

/* ------------------------------------------------------------------ */
/*  Mapping helpers                                                    */
/* ------------------------------------------------------------------ */

function toReport(row: ReportRow): Report {
  return {
    id: row.id,
    post_id: row.post_id,
    thread_title: row.thread_title,
    thread_slug: row.thread_slug,
    reporter_id: row.reporter_id,
    reporter_username: row.reporter_username,
    reason: row.reason,
    status: row.status,
    handled_by: row.handled_by,
    handler_username: row.handler_username,
    created_at: row.created_at.toISOString(),
    resolved_at: toISO(row.resolved_at),
  };
}

function toBan(row: BanRow): Ban {
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username,
    banned_by: row.banned_by,
    banner_username: row.banner_username,
    reason: row.reason,
    expires_at: toISO(row.expires_at),
    created_at: row.created_at.toISOString(),
    lifted_at: toISO(row.lifted_at),
  };
}

function toModLogEntry(row: ModLogRow): ModLogEntry {
  return {
    id: row.id,
    moderator_id: row.moderator_id,
    moderator_username: row.moderator_username,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    description: row.description,
    created_at: row.created_at.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  1. reportPost                                                      */
/* ------------------------------------------------------------------ */

export async function reportPost(
  postId: string,
  reporterId: string,
  reason: string
): Promise<void> {
  await pool.query(
    `INSERT INTO forum_reports (post_id, reporter_id, reason)
     VALUES ($1, $2, $3)`,
    [postId, reporterId, reason]
  );
}

/* ------------------------------------------------------------------ */
/*  2. getReports                                                      */
/* ------------------------------------------------------------------ */

export async function getReports(
  status: string | undefined,
  page: number,
  limit: number
): Promise<{
  reports: Report[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  let countSql: string;
  let dataSql: string;
  const params: (string | number)[] = [];
  const countParams: (string | number)[] = [];

  if (status) {
    countParams.push(status);
    params.push(status, safeLimit, offset);

    countSql = `
      SELECT COUNT(*)::INT AS count
      FROM forum_reports r
      WHERE r.status = $1
    `;

    dataSql = `
      SELECT
        r.id,
        r.post_id,
        t.title            AS thread_title,
        t.slug             AS thread_slug,
        r.reporter_id,
        ru.username        AS reporter_username,
        r.reason,
        r.status,
        r.handled_by,
        hu.username        AS handler_username,
        r.created_at,
        r.resolved_at
      FROM forum_reports r
      JOIN forum_posts p     ON p.id = r.post_id
      JOIN forum_threads t   ON t.id = p.thread_id
      JOIN users ru          ON ru.id = r.reporter_id
      LEFT JOIN users hu     ON hu.id = r.handled_by
      WHERE r.status = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;
  } else {
    params.push(safeLimit, offset);

    countSql = `SELECT COUNT(*)::INT AS count FROM forum_reports r`;

    dataSql = `
      SELECT
        r.id,
        r.post_id,
        t.title            AS thread_title,
        t.slug             AS thread_slug,
        r.reporter_id,
        ru.username        AS reporter_username,
        r.reason,
        r.status,
        r.handled_by,
        hu.username        AS handler_username,
        r.created_at,
        r.resolved_at
      FROM forum_reports r
      JOIN forum_posts p     ON p.id = r.post_id
      JOIN forum_threads t   ON t.id = p.thread_id
      JOIN users ru          ON ru.id = r.reporter_id
      LEFT JOIN users hu     ON hu.id = r.handled_by
      ORDER BY r.created_at DESC
      LIMIT $1 OFFSET $2
    `;
  }

  const countResult = await pool.query<{ count: number }>(countSql, countParams);
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  const result = await pool.query<ReportRow>(dataSql, params);

  return {
    reports: result.rows.map(toReport),
    total,
    page: safePage,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/*  3. getReportDetail                                                 */
/* ------------------------------------------------------------------ */

export async function getReportDetail(
  reportId: string
): Promise<Report & { post_content: string } | null> {
  const sql = `
    SELECT
      r.id,
      r.post_id,
      t.title              AS thread_title,
      t.slug               AS thread_slug,
      r.reporter_id,
      ru.username          AS reporter_username,
      r.reason,
      r.status,
      r.handled_by,
      hu.username          AS handler_username,
      r.created_at,
      r.resolved_at,
      p.content            AS post_content
    FROM forum_reports r
    JOIN forum_posts p     ON p.id = r.post_id
    JOIN forum_threads t   ON t.id = p.thread_id
    JOIN users ru          ON ru.id = r.reporter_id
    LEFT JOIN users hu     ON hu.id = r.handled_by
    WHERE r.id = $1
    LIMIT 1
  `;

  const result = await pool.query<
    ReportRow & { post_content: string }
  >(sql, [reportId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    ...toReport(row),
    post_content: row.post_content,
  };
}

/* ------------------------------------------------------------------ */
/*  4. resolveReport                                                   */
/* ------------------------------------------------------------------ */

export async function resolveReport(
  reportId: string,
  moderatorId: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get report info for the mod log entry
    const reportResult = await client.query<{
      post_id: string;
      reporter_id: string;
    }>(
      `SELECT post_id, reporter_id FROM forum_reports WHERE id = $1 LIMIT 1`,
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      throw new Error("Report not found");
    }

    const report = reportResult.rows[0];

    await client.query(
      `UPDATE forum_reports
       SET status = 'resolved', handled_by = $1, resolved_at = NOW()
       WHERE id = $2`,
      [moderatorId, reportId]
    );

    await client.query(
      `INSERT INTO forum_mod_log (moderator_id, action, target_type, target_id, description)
       VALUES ($1, 'resolve_report', 'forum_report', $2, $3)`,
      [
        moderatorId,
        reportId,
        `Resolved report for post ${report.post_id}`,
      ]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/*  5. rejectReport                                                    */
/* ------------------------------------------------------------------ */

export async function rejectReport(
  reportId: string,
  moderatorId: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get report info for the mod log entry
    const reportResult = await client.query<{
      post_id: string;
      reporter_id: string;
    }>(
      `SELECT post_id, reporter_id FROM forum_reports WHERE id = $1 LIMIT 1`,
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      throw new Error("Report not found");
    }

    const report = reportResult.rows[0];

    await client.query(
      `UPDATE forum_reports
       SET status = 'rejected', handled_by = $1, resolved_at = NOW()
       WHERE id = $2`,
      [moderatorId, reportId]
    );

    await client.query(
      `INSERT INTO forum_mod_log (moderator_id, action, target_type, target_id, description)
       VALUES ($1, 'reject_report', 'forum_report', $2, $3)`,
      [
        moderatorId,
        reportId,
        `Rejected report for post ${report.post_id}`,
      ]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/*  6. banUser                                                         */
/* ------------------------------------------------------------------ */

export async function banUser(
  userId: string,
  moderatorId: string,
  reason: string,
  durationHours?: number
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Calculate expires_at if duration provided
    const expiresAt = durationHours
      ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
      : null;

    // Insert ban record
    await client.query(
      `INSERT INTO forum_bans (user_id, banned_by, reason, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, moderatorId, reason, expiresAt]
    );

    // Get the Banned group id
    const bannedGroup = await client.query<{ id: string }>(
      `SELECT id FROM forum_user_groups WHERE name = 'Banned' LIMIT 1`
    );

    if (bannedGroup.rows.length > 0) {
      const bannedGroupId = bannedGroup.rows[0].id;

      // Remove user from other primary groups (Administrator, Moderator, Registered)
      await client.query(
        `DELETE FROM forum_user_group_members
         WHERE user_id = $1
           AND group_id != $2
           AND is_primary = TRUE`,
        [userId, bannedGroupId]
      );

      // Add user to Banned group as primary
      await client.query(
        `INSERT INTO forum_user_group_members (user_id, group_id, is_primary)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (user_id, group_id) DO UPDATE SET is_primary = TRUE`,
        [userId, bannedGroupId]
      );
    }

    // Log the action
    await client.query(
      `INSERT INTO forum_mod_log (moderator_id, action, target_type, target_id, description)
       VALUES ($1, 'ban_user', 'user', $2, $3)`,
      [
        moderatorId,
        userId,
        durationHours
          ? `Banned user for ${durationHours} hour(s). Reason: ${reason}`
          : `Banned user permanently. Reason: ${reason}`,
      ]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/*  7. unbanUser                                                       */
/* ------------------------------------------------------------------ */

export async function unbanUser(
  userId: string,
  moderatorId: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lift active bans
    await client.query(
      `UPDATE forum_bans
       SET lifted_at = NOW()
       WHERE user_id = $1 AND lifted_at IS NULL`,
      [userId]
    );

    // Get group ids
    const groups = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM forum_user_groups
       WHERE name IN ('Banned', 'Registered')`
    );

    let bannedGroupId: string | null = null;
    let registeredGroupId: string | null = null;

    for (const row of groups.rows) {
      if (row.name === "Banned") bannedGroupId = row.id;
      if (row.name === "Registered") registeredGroupId = row.id;
    }

    if (bannedGroupId) {
      // Remove user from Banned group
      await client.query(
        `DELETE FROM forum_user_group_members
         WHERE user_id = $1 AND group_id = $2`,
        [userId, bannedGroupId]
      );
    }

    if (registeredGroupId) {
      // Add user back to Registered group as primary
      await client.query(
        `INSERT INTO forum_user_group_members (user_id, group_id, is_primary)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (user_id, group_id) DO UPDATE SET is_primary = TRUE`,
        [userId, registeredGroupId]
      );
    }

    // Log the action
    await client.query(
      `INSERT INTO forum_mod_log (moderator_id, action, target_type, target_id, description)
       VALUES ($1, 'unban_user', 'user', $2, $3)`,
      [moderatorId, userId, `Unbanned user`]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/*  8. warnUser                                                        */
/* ------------------------------------------------------------------ */

export async function warnUser(
  userId: string,
  moderatorId: string,
  points: number,
  reason: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO forum_warnings (user_id, warned_by, points, reason)
       VALUES ($1, $2, $3, $4)`,
      [userId, moderatorId, points, reason]
    );

    await client.query(
      `INSERT INTO forum_mod_log (moderator_id, action, target_type, target_id, description)
       VALUES ($1, 'warn_user', 'user', $2, $3)`,
      [
        moderatorId,
        userId,
        `Issued warning (${points} point(s)). Reason: ${reason}`,
      ]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/*  9. isBanned                                                        */
/* ------------------------------------------------------------------ */

export async function isBanned(userId: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1
       FROM forum_bans
       WHERE user_id = $1
         AND lifted_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
     ) AS exists`,
    [userId]
  );

  return result.rows[0]?.exists ?? false;
}

/* ------------------------------------------------------------------ */
/*  10. getModLog                                                      */
/* ------------------------------------------------------------------ */

export async function getModLog(
  page: number,
  limit: number
): Promise<{
  entries: ModLogEntry[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  const countResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::INT AS count FROM forum_mod_log`
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  const sql = `
    SELECT
      ml.id,
      ml.moderator_id,
      u.username       AS moderator_username,
      ml.action,
      ml.target_type,
      ml.target_id,
      ml.description,
      ml.created_at
    FROM forum_mod_log ml
    JOIN users u ON u.id = ml.moderator_id
    ORDER BY ml.created_at DESC
    LIMIT $1 OFFSET $2
  `;

  const result = await pool.query<ModLogRow>(sql, [safeLimit, offset]);

  return {
    entries: result.rows.map(toModLogEntry),
    total,
    page: safePage,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/*  11. getActiveBans                                                  */
/* ------------------------------------------------------------------ */

export async function getActiveBans(
  page: number,
  limit: number
): Promise<{
  bans: Ban[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  const countResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::INT AS count
     FROM forum_bans
     WHERE lifted_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())`
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  const sql = `
    SELECT
      b.id,
      b.user_id,
      u.username          AS username,
      b.banned_by,
      bu.username         AS banner_username,
      b.reason,
      b.expires_at,
      b.created_at,
      b.lifted_at
    FROM forum_bans b
    JOIN users u  ON u.id = b.user_id
    JOIN users bu ON bu.id = b.banned_by
    WHERE b.lifted_at IS NULL
      AND (b.expires_at IS NULL OR b.expires_at > NOW())
    ORDER BY b.created_at DESC
    LIMIT $1 OFFSET $2
  `;

  const result = await pool.query<BanRow>(sql, [safeLimit, offset]);

  return {
    bans: result.rows.map(toBan),
    total,
    page: safePage,
    totalPages,
  };
}
