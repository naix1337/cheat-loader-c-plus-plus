import { pool } from "../db/pool";

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string;
  actor_username: string;
  content_type: string;
  content_id: string;
  action: string;
  read: boolean;
  created_at: string;
}

export interface PaginatedNotifications {
  notifications: Notification[];
  total: number;
  unread_count: number;
  page: number;
  totalPages: number;
}

/* ------------------------------------------------------------------ */
/*  Raw row types (internal – what comes back from pg)                 */
/* ------------------------------------------------------------------ */

interface NotificationRow {
  id: string;
  user_id: string;
  actor_id: string;
  actor_username: string;
  content_type: string;
  content_id: string;
  action: string;
  read: boolean;
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

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    user_id: row.user_id,
    actor_id: row.actor_id,
    actor_username: row.actor_username,
    content_type: row.content_type,
    content_id: row.content_id,
    action: row.action,
    read: row.read,
    created_at: toISO(row.created_at),
  };
}

/* ------------------------------------------------------------------ */
/*  1. createNotification                                              */
/* ------------------------------------------------------------------ */

export async function createNotification(
  userId: string,
  actorId: string,
  contentType: string,
  contentId: string,
  action: string
): Promise<void> {
  // Don't notify yourself
  if (userId === actorId) return;

  await pool.query(
    `INSERT INTO forum_notifications (user_id, actor_id, content_type, content_id, action)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, actorId, contentType, contentId, action]
  );
}

/* ------------------------------------------------------------------ */
/*  2. getNotifications                                                */
/* ------------------------------------------------------------------ */

export async function getNotifications(
  userId: string,
  page: number,
  limit: number
): Promise<PaginatedNotifications> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  // Total count for pagination
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM forum_notifications WHERE user_id = $1`,
    [userId]
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  // Unread count
  const unreadResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM forum_notifications WHERE user_id = $1 AND read = FALSE`,
    [userId]
  );
  const unreadCount = Number(unreadResult.rows[0].count);

  // Paginated results with actor username
  const sql = `
    SELECT
      n.id,
      n.user_id,
      n.actor_id,
      u.username   AS actor_username,
      n.content_type,
      n.content_id,
      n.action,
      n.read,
      n.created_at
    FROM forum_notifications n
    JOIN users u ON u.id = n.actor_id
    WHERE n.user_id = $1
    ORDER BY n.created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query<NotificationRow>(sql, [userId, safeLimit, offset]);

  return {
    notifications: result.rows.map(toNotification),
    total,
    unread_count: unreadCount,
    page: safePage,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/*  3. getUnreadCount                                                  */
/* ------------------------------------------------------------------ */

export async function getUnreadCount(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM forum_notifications WHERE user_id = $1 AND read = FALSE`,
    [userId]
  );
  return Number(result.rows[0].count);
}

/* ------------------------------------------------------------------ */
/*  4. markRead                                                        */
/* ------------------------------------------------------------------ */

export async function markRead(
  notificationId: string,
  userId: string
): Promise<void> {
  await pool.query(
    `UPDATE forum_notifications SET read = TRUE WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
}

/* ------------------------------------------------------------------ */
/*  5. markAllRead                                                     */
/* ------------------------------------------------------------------ */

export async function markAllRead(userId: string): Promise<void> {
  await pool.query(
    `UPDATE forum_notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`,
    [userId]
  );
}

/* ------------------------------------------------------------------ */
/*  6. deleteNotificationsForContent                                   */
/* ------------------------------------------------------------------ */

export async function deleteNotificationsForContent(
  contentType: string,
  contentId: string
): Promise<void> {
  await pool.query(
    `DELETE FROM forum_notifications WHERE content_type = $1 AND content_id = $2`,
    [contentType, contentId]
  );
}
