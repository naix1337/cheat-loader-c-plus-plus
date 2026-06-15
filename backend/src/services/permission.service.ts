import { pool } from "../db/pool";

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

export interface ForumUserGroup {
  id: string;
  name: string;
  display_order: number;
  is_banned: boolean;
  created_at: Date;
}

export interface ForumPermission {
  id: string;
  name: string;
  default_value: string;
}

export interface GroupPermission {
  group_id: string;
  permission_id: string;
  value: string;
}

export interface CategoryPermission {
  category_id: string;
  group_id: string;
  permission_id: string;
  value: string;
}

/* ------------------------------------------------------------------ */
/*  Raw row types (internal – what comes back from pg)                 */
/* ------------------------------------------------------------------ */

interface GroupPermissionRow {
  permission_id: string;
  value: string;
}

interface GroupRow {
  id: string;
  name: string;
  display_order: number;
  is_banned: boolean;
  created_at: Date;
}

interface PermissionRow {
  id: string;
  name: string;
  default_value: string;
}

interface CategoryPermissionRow {
  category_id: string;
  group_id: string;
  permission_id: string;
  value: string;
}

/* ------------------------------------------------------------------ */
/*  1. getGroupPermissions                                             */
/* ------------------------------------------------------------------ */

export async function getGroupPermissions(
  groupId: string
): Promise<{ permission_id: string; value: string }[]> {
  const result = await pool.query<GroupPermissionRow>(
    `SELECT permission_id, value
     FROM forum_group_permissions
     WHERE group_id = $1`,
    [groupId]
  );
  return result.rows;
}

/* ------------------------------------------------------------------ */
/*  2. getUserPermissions                                              */
/* ------------------------------------------------------------------ */

export async function getUserPermissions(
  userId: string,
  categoryId?: string
): Promise<Record<string, string>> {
  // Fetch all permission definitions (id -> default_value)
  const permResult = await pool.query<PermissionRow>(
    `SELECT id, default_value FROM forum_permissions`
  );

  const perms: Record<string, string> = {};
  for (const row of permResult.rows) {
    perms[row.id] = row.default_value; // 'allow' or 'deny'
  }

  // Fetch all groups the user belongs to
  const groupResult = await pool.query<{ group_id: string }>(
    `SELECT group_id FROM forum_user_group_members WHERE user_id = $1`,
    [userId]
  );
  const groupIds = groupResult.rows.map((r) => r.group_id);

  if (groupIds.length === 0) {
    // No groups – only defaults apply
    return perms;
  }

  // Fetch group-level permissions for the user's groups
  const gpResult = await pool.query<GroupPermissionRow>(
    `SELECT permission_id, value
     FROM forum_group_permissions
     WHERE group_id = ANY($1::uuid[])`,
    [groupIds]
  );

  // Resolve group-level: never > allow > deny
  for (const row of gpResult.rows) {
    const current = perms[row.permission_id];
    if (row.value === "never") {
      perms[row.permission_id] = "never";
    } else if (row.value === "allow" && current !== "never") {
      perms[row.permission_id] = "allow";
    } else if (row.value === "deny" && current !== "never" && current !== "allow") {
      perms[row.permission_id] = "deny";
    }
  }

  // If a category was specified, overlay category-level overrides
  if (categoryId) {
    const cpResult = await pool.query<CategoryPermissionRow>(
      `SELECT category_id, group_id, permission_id, value
       FROM forum_category_permissions
       WHERE category_id = $1 AND group_id = ANY($2::uuid[])`,
      [categoryId, groupIds]
    );

    for (const row of cpResult.rows) {
      const current = perms[row.permission_id];
      if (row.value === "never") {
        perms[row.permission_id] = "never";
      } else if (row.value === "allow" && current !== "never") {
        perms[row.permission_id] = "allow";
      } else if (row.value === "deny" && current !== "never" && current !== "allow") {
        perms[row.permission_id] = "deny";
      }
    }
  }

  return perms;
}

/* ------------------------------------------------------------------ */
/*  3. checkPermission                                                */
/* ------------------------------------------------------------------ */

export async function checkPermission(
  userId: string,
  permissionId: string,
  categoryId?: string
): Promise<boolean> {
  const perms = await getUserPermissions(userId, categoryId);
  return perms[permissionId] === "allow";
}

/* ------------------------------------------------------------------ */
/*  4. getUserGroups                                                   */
/* ------------------------------------------------------------------ */

export async function getUserGroups(userId: string): Promise<ForumUserGroup[]> {
  const result = await pool.query<GroupRow>(
    `SELECT g.id, g.name, g.display_order, g.is_banned, g.created_at
     FROM forum_user_groups g
     JOIN forum_user_group_members m ON m.group_id = g.id
     WHERE m.user_id = $1
     ORDER BY g.display_order ASC`,
    [userId]
  );
  return result.rows;
}

/* ------------------------------------------------------------------ */
/*  5. isAdmin                                                         */
/* ------------------------------------------------------------------ */

export async function isAdmin(userId: string): Promise<boolean> {
  // Check if user is in Administrator group OR has role = 'admin'
  const result = await pool.query<{ found: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM forum_user_group_members m
       JOIN forum_user_groups g ON g.id = m.group_id
       WHERE m.user_id = $1 AND g.name = 'Administrator'
     ) OR EXISTS (
       SELECT 1 FROM users WHERE id = $2 AND role = 'admin'
     ) AS found`,
    [userId, userId]
  );
  return result.rows[0]?.found ?? false;
}

/* ------------------------------------------------------------------ */
/*  6. isModerator                                                     */
/* ------------------------------------------------------------------ */

export async function isModerator(userId: string): Promise<boolean> {
  // Check if user is in Moderator group OR has role = 'admin'
  const result = await pool.query<{ found: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM forum_user_group_members m
       JOIN forum_user_groups g ON g.id = m.group_id
       WHERE m.user_id = $1 AND g.name IN ('Moderator', 'Administrator')
     ) OR EXISTS (
       SELECT 1 FROM users WHERE id = $2 AND role = 'admin'
     ) AS found`,
    [userId, userId]
  );
  return result.rows[0]?.found ?? false;
}

/* ------------------------------------------------------------------ */
/*  7. createGroup                                                     */
/* ------------------------------------------------------------------ */

export async function createGroup(
  name: string,
  displayOrder?: number
): Promise<ForumUserGroup> {
  const result = await pool.query<GroupRow>(
    `INSERT INTO forum_user_groups (name, display_order)
     VALUES ($1, $2)
     RETURNING *`,
    [name, displayOrder ?? 0]
  );
  return result.rows[0];
}

/* ------------------------------------------------------------------ */
/*  8. updateGroup                                                     */
/* ------------------------------------------------------------------ */

export async function updateGroup(
  groupId: string,
  data: { name?: string; display_order?: number; is_banned?: boolean }
): Promise<ForumUserGroup> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    sets.push(`name = $${idx++}`);
    params.push(data.name);
  }
  if (data.display_order !== undefined) {
    sets.push(`display_order = $${idx++}`);
    params.push(data.display_order);
  }
  if (data.is_banned !== undefined) {
    sets.push(`is_banned = $${idx++}`);
    params.push(data.is_banned);
  }

  if (sets.length === 0) {
    throw new Error("No fields provided to update");
  }

  params.push(groupId);
  const sql = `UPDATE forum_user_groups
               SET ${sets.join(", ")}
               WHERE id = $${idx}
               RETURNING *`;

  const result = await pool.query<GroupRow>(sql, params);
  return result.rows[0];
}

/* ------------------------------------------------------------------ */
/*  9. deleteGroup                                                     */
/* ------------------------------------------------------------------ */

export async function deleteGroup(groupId: string): Promise<void> {
  await pool.query(`DELETE FROM forum_user_groups WHERE id = $1`, [groupId]);
}

/* ------------------------------------------------------------------ */
/* 10. addUserToGroup                                                  */
/* ------------------------------------------------------------------ */

export async function addUserToGroup(
  userId: string,
  groupId: string,
  isPrimary?: boolean
): Promise<void> {
  await pool.query(
    `INSERT INTO forum_user_group_members (user_id, group_id, is_primary)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, group_id) DO UPDATE SET is_primary = $3`,
    [userId, groupId, isPrimary ?? false]
  );
}

/* ------------------------------------------------------------------ */
/* 11. removeUserFromGroup                                             */
/* ------------------------------------------------------------------ */

export async function removeUserFromGroup(
  userId: string,
  groupId: string
): Promise<void> {
  await pool.query(
    `DELETE FROM forum_user_group_members WHERE user_id = $1 AND group_id = $2`,
    [userId, groupId]
  );
}

/* ------------------------------------------------------------------ */
/* 12. setGroupPermission                                              */
/* ------------------------------------------------------------------ */

export async function setGroupPermission(
  groupId: string,
  permissionId: string,
  value: string
): Promise<void> {
  await pool.query(
    `INSERT INTO forum_group_permissions (group_id, permission_id, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (group_id, permission_id) DO UPDATE SET value = $3`,
    [groupId, permissionId, value]
  );
}

/* ------------------------------------------------------------------ */
/* 13. setCategoryPermission                                           */
/* ------------------------------------------------------------------ */

export async function setCategoryPermission(
  categoryId: string,
  groupId: string,
  permissionId: string,
  value: string
): Promise<void> {
  await pool.query(
    `INSERT INTO forum_category_permissions (category_id, group_id, permission_id, value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (category_id, group_id, permission_id) DO UPDATE SET value = $4`,
    [categoryId, groupId, permissionId, value]
  );
}

/* ------------------------------------------------------------------ */
/* 14. getCategoryPermissions                                          */
/* ------------------------------------------------------------------ */

export async function getCategoryPermissions(
  categoryId: string
): Promise<CategoryPermission[]> {
  const result = await pool.query<CategoryPermissionRow>(
    `SELECT category_id, group_id, permission_id, value
     FROM forum_category_permissions
     WHERE category_id = $1`,
    [categoryId]
  );
  return result.rows;
}
