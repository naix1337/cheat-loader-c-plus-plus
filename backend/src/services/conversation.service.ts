import { pool } from "../db/pool";

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

export interface Conversation {
  id: string;
  title: string;
  author_id: string;
  author_username: string;
  open_invite: boolean;
  last_message_at: string;
  created_at: string;
  recipient_count: number;
  message_count: number;
  last_read_at: string | null;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  author_id: string;
  author_username: string;
  content: string;
  created_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[];
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
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

/* ------------------------------------------------------------------ */
/*  Raw row types (internal -- what comes back from pg)                */
/* ------------------------------------------------------------------ */

interface ConversationRow {
  id: string;
  title: string;
  author_id: string;
  author_username: string;
  open_invite: boolean;
  last_message_at: Date;
  created_at: Date;
  recipient_count: string;  // pg count() returns string
  message_count: string;    // pg count() returns string
  last_read_at: Date | null;
}

interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  author_id: string;
  author_username: string;
  content: string;
  created_at: Date;
}

interface ConversationWithMetaRow extends ConversationRow {
  last_message_id: string | null;
  last_message_author_id: string | null;
  last_message_author_username: string | null;
  last_message_content: string | null;
  last_message_created_at: Date | null;
  unread_count: string;
}

/* ------------------------------------------------------------------ */
/*  Mapping helpers                                                    */
/* ------------------------------------------------------------------ */

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    author_id: row.author_id,
    author_username: row.author_username,
    open_invite: row.open_invite,
    last_message_at: toISO(row.last_message_at),
    created_at: toISO(row.created_at),
    recipient_count: Number(row.recipient_count),
    message_count: Number(row.message_count),
    last_read_at: row.last_read_at ? toISO(row.last_read_at) : null,
  };
}

function toConversationMessage(row: ConversationMessageRow): ConversationMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    author_id: row.author_id,
    author_username: row.author_username,
    content: row.content,
    created_at: toISO(row.created_at),
  };
}

/* ------------------------------------------------------------------ */
/*  1. createConversation                                              */
/* ------------------------------------------------------------------ */

export async function createConversation(
  authorId: string,
  title: string,
  recipientIds: string[],
  content: string
): Promise<Conversation> {
  if (recipientIds.length === 0) {
    throw new Error("At least one recipient is required");
  }

  const allParticipantIds = [authorId, ...recipientIds.filter((id) => id !== authorId)];
  const uniqueIds = [...new Set(allParticipantIds)];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Insert the conversation
    const convResult = await client.query<{
      id: string;
      title: string;
      author_id: string;
      open_invite: boolean;
      last_message_at: Date;
      created_at: Date;
    }>(
      `INSERT INTO forum_conversations (title, author_id)
       VALUES ($1, $2)
       RETURNING id, title, author_id, open_invite, last_message_at, created_at`,
      [title, authorId]
    );
    const conv = convResult.rows[0];

    // 2. Insert the first message
    await client.query(
      `INSERT INTO forum_conversation_messages (conversation_id, author_id, content)
       VALUES ($1, $2, $3)`,
      [conv.id, authorId, content]
    );

    // 3. Insert all recipients (including the author)
    const recipientInsertSql = `
      INSERT INTO forum_conversation_recipients (conversation_id, user_id, last_read_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET left_at = NULL, last_read_at = NOW()
    `;
    for (const uid of uniqueIds) {
      await client.query(recipientInsertSql, [conv.id, uid]);
    }

    await client.query("COMMIT");

    // Build full Conversation object with aggregates
    const fullResult = await pool.query<ConversationRow>(
      `SELECT
         fc.id,
         fc.title,
         fc.author_id,
         u.username AS author_username,
         fc.open_invite,
         fc.last_message_at,
         fc.created_at,
         (SELECT COUNT(*)::INT FROM forum_conversation_recipients WHERE conversation_id = fc.id) AS recipient_count,
         (SELECT COUNT(*)::INT FROM forum_conversation_messages WHERE conversation_id = fc.id) AS message_count,
         fcr.last_read_at
       FROM forum_conversations fc
       JOIN users u ON u.id = fc.author_id
       JOIN forum_conversation_recipients fcr ON fcr.conversation_id = fc.id AND fcr.user_id = $1
       WHERE fc.id = $2
       LIMIT 1`,
      [authorId, conv.id]
    );

    return toConversation(fullResult.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/*  2. replyToConversation                                             */
/* ------------------------------------------------------------------ */

export async function replyToConversation(
  conversationId: string,
  userId: string,
  content: string
): Promise<ConversationMessage> {
  // Verify user is an active recipient
  const membership = await pool.query<{ left_at: Date | null }>(
    `SELECT left_at FROM forum_conversation_recipients
     WHERE conversation_id = $1 AND user_id = $2
     LIMIT 1`,
    [conversationId, userId]
  );

  if (membership.rows.length === 0) {
    throw new Error("User is not a participant in this conversation");
  }
  if (membership.rows[0].left_at !== null) {
    throw new Error("User has left the conversation");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insert message
    const msgResult = await client.query<ConversationMessageRow>(
      `INSERT INTO forum_conversation_messages (conversation_id, author_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, conversation_id, author_id, content, created_at`,
      [conversationId, userId, content]
    );

    // Update conversation timestamp
    await client.query(
      `UPDATE forum_conversations SET last_message_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    // Create notifications for all other active recipients
    const otherRecipients = await client.query<{ user_id: string }>(
      `SELECT user_id FROM forum_conversation_recipients
       WHERE conversation_id = $1
         AND user_id != $2
         AND left_at IS NULL`,
      [conversationId, userId]
    );

    for (const recipient of otherRecipients.rows) {
      await client.query(
        `INSERT INTO forum_notifications (user_id, actor_id, content_type, content_id, action)
         VALUES ($1, $2, 'conversation_message', $3, 'reply')`,
        [recipient.user_id, userId, conversationId]
      );
    }

    await client.query("COMMIT");

    // Attach author username
    const userResult = await pool.query<{ username: string }>(
      `SELECT username FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    const message = msgResult.rows[0];
    message.author_username = userResult.rows[0]?.username ?? "";

    return toConversationMessage(message);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/*  3. getConversations                                                */
/* ------------------------------------------------------------------ */

export async function getConversations(
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<{
  conversations: (Conversation & {
    last_message: ConversationMessage | null;
    unread_count: number;
  })[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  // Total count
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM forum_conversation_recipients fcr
     JOIN forum_conversations fc ON fc.id = fcr.conversation_id
     WHERE fcr.user_id = $1 AND fcr.left_at IS NULL`,
    [userId]
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  const sql = `
    SELECT
      fc.id,
      fc.title,
      fc.author_id,
      u.username             AS author_username,
      fc.open_invite,
      fc.last_message_at,
      fc.created_at,
      (SELECT COUNT(*)::INT FROM forum_conversation_recipients WHERE conversation_id = fc.id)
        AS recipient_count,
      (SELECT COUNT(*)::INT FROM forum_conversation_messages WHERE conversation_id = fc.id)
        AS message_count,
      fcr.last_read_at,
      lm.id                  AS last_message_id,
      lm.author_id           AS last_message_author_id,
      lm_user.username       AS last_message_author_username,
      lm.content             AS last_message_content,
      lm.created_at          AS last_message_created_at,
      (SELECT COUNT(*)::INT FROM forum_conversation_messages
       WHERE conversation_id = fc.id
         AND created_at > COALESCE(fcr.last_read_at, '1970-01-01'::timestamptz))
        AS unread_count
    FROM forum_conversations fc
    JOIN users u                     ON u.id = fc.author_id
    JOIN forum_conversation_recipients fcr
         ON fcr.conversation_id = fc.id AND fcr.user_id = $1
    LEFT JOIN LATERAL (
      SELECT id, conversation_id, author_id, content, created_at
      FROM forum_conversation_messages
      WHERE conversation_id = fc.id
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON TRUE
    LEFT JOIN users lm_user ON lm_user.id = lm.author_id
    WHERE fcr.left_at IS NULL
    ORDER BY fc.last_message_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query<ConversationWithMetaRow>(sql, [userId, safeLimit, offset]);

  const conversations = result.rows.map((row) => {
    const last_message: ConversationMessage | null = row.last_message_id
      ? {
          id: row.last_message_id,
          conversation_id: row.id,
          author_id: row.last_message_author_id ?? "",
          author_username: row.last_message_author_username ?? "",
          content: row.last_message_content ?? "",
          created_at: toISO(row.last_message_created_at),
        }
      : null;

    return {
      ...toConversation(row),
      last_message,
      unread_count: Number(row.unread_count),
    };
  });

  return { conversations, total, page: safePage, totalPages };
}

/* ------------------------------------------------------------------ */
/*  4. getConversationMessages                                         */
/* ------------------------------------------------------------------ */

export async function getConversationMessages(
  conversationId: string,
  userId: string,
  page: number = 1,
  limit: number = 50
): Promise<{
  messages: ConversationMessage[];
  total: number;
  page: number;
  totalPages: number;
}> {
  // Verify user is an active recipient
  const membership = await pool.query<{ left_at: Date | null }>(
    `SELECT left_at FROM forum_conversation_recipients
     WHERE conversation_id = $1 AND user_id = $2
     LIMIT 1`,
    [conversationId, userId]
  );

  if (membership.rows.length === 0) {
    throw new Error("User is not a participant in this conversation");
  }

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  // Total count
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::INT AS count
     FROM forum_conversation_messages
     WHERE conversation_id = $1`,
    [conversationId]
  );
  const total = Number(countResult.rows[0].count);
  const totalPages = Math.ceil(total / safeLimit);

  const sql = `
    SELECT
      m.id,
      m.conversation_id,
      m.author_id,
      u.username AS author_username,
      m.content,
      m.created_at
    FROM forum_conversation_messages m
    JOIN users u ON u.id = m.author_id
    WHERE m.conversation_id = $1
    ORDER BY m.created_at ASC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query<ConversationMessageRow>(sql, [
    conversationId,
    safeLimit,
    offset,
  ]);

  // Update last_read_at for the requesting user (only if they haven't left)
  if (membership.rows[0]?.left_at === null || membership.rows[0]?.left_at === undefined) {
    await pool.query(
      `UPDATE forum_conversation_recipients
       SET last_read_at = NOW()
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
  }

  return {
    messages: result.rows.map(toConversationMessage),
    total,
    page: safePage,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/*  5. leaveConversation                                               */
/* ------------------------------------------------------------------ */

export async function leaveConversation(
  conversationId: string,
  userId: string
): Promise<void> {
  const result = await pool.query(
    `UPDATE forum_conversation_recipients
     SET left_at = NOW()
     WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [conversationId, userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    // Check if the record exists at all
    const exists = await pool.query(
      `SELECT 1 FROM forum_conversation_recipients
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    if (exists.rows.length === 0) {
      throw new Error("User is not a participant in this conversation");
    }
    // If it exists but left_at is already set, it's a no-op
  }
}

/* ------------------------------------------------------------------ */
/*  6. addRecipients                                                   */
/* ------------------------------------------------------------------ */

export async function addRecipients(
  conversationId: string,
  userId: string,
  newRecipientIds: string[],
  isAdmin: boolean = false
): Promise<void> {
  if (newRecipientIds.length === 0) return;

  // Verify requesting user is an active participant OR an admin
  if (!isAdmin) {
    const membership = await pool.query<{ left_at: Date | null }>(
      `SELECT left_at FROM forum_conversation_recipients
       WHERE conversation_id = $1 AND user_id = $2
       LIMIT 1`,
      [conversationId, userId]
    );
    if (membership.rows.length === 0) {
      throw new Error("User is not a participant in this conversation");
    }
    if (membership.rows[0].left_at !== null) {
      throw new Error("User has left the conversation");
    }
  }

  // Verify conversation.open_invite is TRUE (or user is admin)
  if (!isAdmin) {
    const convResult = await pool.query<{ open_invite: boolean }>(
      `SELECT open_invite FROM forum_conversations WHERE id = $1 LIMIT 1`,
      [conversationId]
    );
    if (convResult.rows.length === 0) {
      throw new Error("Conversation not found");
    }
    if (!convResult.rows[0].open_invite) {
      throw new Error("Conversation does not allow open invites");
    }
  }

  // Filter out IDs that are already recipients (to avoid unnecessary conflicts)
  const existingResult = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM forum_conversation_recipients
     WHERE conversation_id = $1 AND user_id = ANY($2::uuid[])`,
    [conversationId, newRecipientIds]
  );
  const existingIds = new Set(existingResult.rows.map((r) => r.user_id));
  const trulyNew = newRecipientIds.filter((id) => !existingIds.has(id));

  if (trulyNew.length === 0) return;

  // Insert new recipients (re-activate any that had previously left)
  const insertSql = `
    INSERT INTO forum_conversation_recipients (conversation_id, user_id, last_read_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET left_at = NULL, last_read_at = NOW()
  `;

  for (const rid of trulyNew) {
    await pool.query(insertSql, [conversationId, rid]);
  }
}
