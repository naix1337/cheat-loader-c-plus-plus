import { pool } from "../db/pool";

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

export interface ReactionType {
  id: string;
  display_order: number;
  icon: string;
}

export interface PostReaction {
  id: string;
  post_id: string;
  user_id: string;
  reaction_type: string;
  created_at: string;
  username: string;
}

export interface ReactionCount {
  type: string;
  count: number;
}

/* ------------------------------------------------------------------ */
/*  1. getReactionTypes                                                */
/* ------------------------------------------------------------------ */

export async function getReactionTypes(): Promise<ReactionType[]> {
  const result = await pool.query<ReactionType>(
    `SELECT * FROM forum_reaction_types ORDER BY display_order`
  );
  return result.rows;
}

/* ------------------------------------------------------------------ */
/*  2. toggleReaction                                                  */
/* ------------------------------------------------------------------ */

export async function toggleReaction(
  postId: string,
  userId: string,
  reactionType: string
): Promise<{ action: "added" | "removed" | "changed"; reaction: string }> {
  // Check whether the user already has a reaction on this post
  const existing = await pool.query<{ id: string; reaction_type: string }>(
    `SELECT id, reaction_type FROM forum_reactions WHERE post_id = $1 AND user_id = $2 LIMIT 1`,
    [postId, userId]
  );

  if (existing.rows.length === 0) {
    // No existing reaction — insert a new one and increment the score
    const result = await pool.query<{ reaction_type: string }>(
      `WITH ins AS (
         INSERT INTO forum_reactions (post_id, user_id, reaction_type)
         VALUES ($1, $2, $3)
         RETURNING reaction_type
       ), upd AS (
         UPDATE forum_posts SET reaction_score = reaction_score + 1
         WHERE id = $1
       )
       SELECT reaction_type FROM ins`,
      [postId, userId, reactionType]
    );
    return { action: "added", reaction: result.rows[0].reaction_type };
  }

  const { id: reactionId, reaction_type: existingType } = existing.rows[0];

  if (existingType === reactionType) {
    // Same reaction — remove it and decrement the score
    const result = await pool.query<{ reaction_type: string }>(
      `WITH del AS (
         DELETE FROM forum_reactions WHERE id = $1
         RETURNING reaction_type
       ), upd AS (
         UPDATE forum_posts SET reaction_score = GREATEST(reaction_score - 1, 0)
         WHERE id = $2
       )
       SELECT reaction_type FROM del`,
      [reactionId, postId]
    );
    return { action: "removed", reaction: result.rows[0].reaction_type };
  }

  // Different reaction — update the reaction type (score stays the same)
  const result = await pool.query<{ reaction_type: string }>(
    `UPDATE forum_reactions
     SET reaction_type = $1, created_at = NOW()
     WHERE id = $2
     RETURNING reaction_type`,
    [reactionType, reactionId]
  );
  return { action: "changed", reaction: result.rows[0].reaction_type };
}

/* ------------------------------------------------------------------ */
/*  3. getPostReactions                                                */
/* ------------------------------------------------------------------ */

export async function getPostReactions(
  postId: string,
  userId?: string
): Promise<{ types: ReactionCount[]; total: number; user_reaction: string | null }> {
  const result = await pool.query<{ reaction_type: string; count: number }>(
    `SELECT reaction_type, COUNT(*)::INT AS count
     FROM forum_reactions
     WHERE post_id = $1
     GROUP BY reaction_type
     ORDER BY reaction_type`,
    [postId]
  );

  const types: ReactionCount[] = result.rows.map((row) => ({
    type: row.reaction_type,
    count: row.count,
  }));

  const total = types.reduce((sum, t) => sum + t.count, 0);

  let userReaction: string | null = null;
  if (userId) {
    userReaction = await getUserReaction(postId, userId);
  }

  return { types, total, user_reaction: userReaction };
}

/* ------------------------------------------------------------------ */
/*  4. getUserReactions                                                */
/* ------------------------------------------------------------------ */

export async function getUserReactions(
  postId: string,
  userId: string
): Promise<string | null> {
  const result = await pool.query<{ reaction_type: string }>(
    `SELECT reaction_type FROM forum_reactions WHERE post_id = $1 AND user_id = $2 LIMIT 1`,
    [postId, userId]
  );
  return result.rows[0]?.reaction_type ?? null;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Internal helper used by getPostReactions to look up the current user's
 * reaction on a post. Exposed publicly via getUserReactions.
 */
async function getUserReaction(postId: string, userId: string): Promise<string | null> {
  return getUserReactions(postId, userId);
}
