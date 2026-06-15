import { Router, type Request, type Response } from "express";
import * as permService from "../services/permission.service";
import * as modService from "../services/moderation.service";
import { verifyAccessToken } from "../services/token.service";
import { pool } from "../db/pool";

// ── Types ──────────────────────────────────────────────────

interface AuthRequest extends Request {
  userId?: string;
  username?: string;
}

// ── Constants ──────────────────────────────────────────────

const DEFAULT_PAGE_LIMIT = 20;

// ── Helpers ────────────────────────────────────────────────

/**
 * Extract Bearer token from the Authorization header.
 */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7);
  }
  return null;
}

// ── Middleware ─────────────────────────────────────────────

/**
 * Require authentication. Verifies the Bearer JWT and sets req.userId / req.username.
 * Returns 401 if the token is missing or invalid.
 */
function requireAuth(req: AuthRequest, res: Response, next: () => void): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "Token expired or invalid" });
    return;
  }

  req.userId = payload.sub;
  req.username = payload.username;
  next();
}

/**
 * Require admin role (must come after requireAuth).
 * Checks that the user has role = 'admin' in the users table.
 * Returns 403 if the user is not an admin.
 */
async function requireAdmin(req: AuthRequest, res: Response, next: () => void): Promise<void> {
  try {
    const result = await pool.query<{ role: string }>(
      `SELECT role FROM users WHERE id = $1`,
      [req.userId]
    );
    const isAdmin = result.rows[0]?.role === "admin";
    if (!isAdmin) {
      res.status(403).json({ error: "Forbidden - admin access required" });
      return;
    }
    next();
  } catch (err) {
    console.error("requireAdmin error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── Router ─────────────────────────────────────────────────

const router = Router();

// All admin routes require authentication and admin privileges
router.use(requireAuth, requireAdmin);

// ════════════════════════════════════════════════════════════
//  GROUP MANAGEMENT
// ════════════════════════════════════════════════════════════

/**
 * GET /api/admin/groups
 * List all user groups.
 */
router.get("/api/admin/groups", async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query<{
      id: string;
      name: string;
      display_order: number;
      is_banned: boolean;
      created_at: Date;
    }>(
      `SELECT id, name, display_order, is_banned, created_at
       FROM forum_user_groups
       ORDER BY display_order ASC`
    );
    res.json({ groups: result.rows });
  } catch (err) {
    console.error("Error listing groups:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/admin/groups
 * Create a new user group.
 * Body: { name: string, display_order?: number }
 */
router.post("/api/admin/groups", async (req: AuthRequest, res: Response) => {
  try {
    const { name, display_order } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: "Group name is required" });
      return;
    }

    const group = await permService.createGroup(name.trim(), display_order);
    res.status(201).json({ group });
  } catch (err) {
    console.error("Error creating group:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/admin/groups/:id
 * Update a user group.
 * Body: { name?: string, display_order?: number, is_banned?: boolean }
 */
router.put("/api/admin/groups/:id", async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    const { name, display_order, is_banned } = req.body;

    if (!name && display_order === undefined && is_banned === undefined) {
      res.status(400).json({ error: "At least one field (name, display_order, is_banned) must be provided" });
      return;
    }

    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      res.status(400).json({ error: "Group name cannot be empty" });
      return;
    }

    const group = await permService.updateGroup(groupId, {
      name: name?.trim(),
      display_order,
      is_banned,
    });
    res.json({ group });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "No fields provided to update") {
      res.status(400).json({ error: msg });
      return;
    }
    console.error("Error updating group:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/admin/groups/:id
 * Delete a user group.
 */
router.delete("/api/admin/groups/:id", async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    await permService.deleteGroup(groupId);
    res.json({ message: "Group deleted successfully" });
  } catch (err) {
    console.error("Error deleting group:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/groups/:id/members
 * List members of a group with their usernames.
 */
router.get("/api/admin/groups/:id/members", async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;

    const result = await pool.query<{
      user_id: string;
      username: string;
      is_primary: boolean;
      joined_at: Date;
    }>(
      `SELECT m.user_id, u.username, m.is_primary, m.created_at AS joined_at
       FROM forum_user_group_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.group_id = $1
       ORDER BY u.username ASC`,
      [groupId]
    );

    res.json({ members: result.rows });
  } catch (err) {
    console.error("Error listing group members:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/admin/groups/:id/members
 * Add a user to a group.
 * Body: { user_id: string }
 */
router.post("/api/admin/groups/:id/members", async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    const { user_id } = req.body;

    if (!user_id || typeof user_id !== "string") {
      res.status(400).json({ error: "user_id is required" });
      return;
    }

    await permService.addUserToGroup(user_id, groupId);
    res.status(201).json({ message: "User added to group successfully" });
  } catch (err) {
    console.error("Error adding user to group:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/admin/groups/:id/members/:userId
 * Remove a user from a group.
 */
router.delete("/api/admin/groups/:id/members/:userId", async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    const userId = req.params.userId as string;

    await permService.removeUserFromGroup(userId, groupId);
    res.json({ message: "User removed from group successfully" });
  } catch (err) {
    console.error("Error removing user from group:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════════════
//  PERMISSION MANAGEMENT
// ════════════════════════════════════════════════════════════

/**
 * GET /api/admin/permissions
 * List all available permission definitions.
 */
router.get("/api/admin/permissions", async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query<{
      id: string;
      name: string;
      default_value: string;
    }>(
      `SELECT id, name, default_value FROM forum_permissions ORDER BY name ASC`
    );
    res.json({ permissions: result.rows });
  } catch (err) {
    console.error("Error listing permissions:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/groups/:id/permissions
 * List permissions for a group with their current value.
 */
router.get("/api/admin/groups/:id/permissions", async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;

    // Get all permission definitions plus the current value for this group (if set)
    const result = await pool.query<{
      permission_id: string;
      permission_name: string;
      default_value: string;
      value: string | null;
    }>(
      `SELECT
         p.id        AS permission_id,
         p.name      AS permission_name,
         p.default_value,
         gp.value
       FROM forum_permissions p
       LEFT JOIN forum_group_permissions gp
         ON gp.permission_id = p.id AND gp.group_id = $1
       ORDER BY p.name ASC`,
      [groupId]
    );

    res.json({ permissions: result.rows });
  } catch (err) {
    console.error("Error listing group permissions:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/admin/groups/:id/permissions
 * Update permissions for a group.
 * Body: { permissions: [{ permission_id, value }] }
 */
router.put("/api/admin/groups/:id/permissions", async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    const { permissions } = req.body;

    if (!Array.isArray(permissions) || permissions.length === 0) {
      res.status(400).json({ error: "permissions array is required and must not be empty" });
      return;
    }

    for (const perm of permissions) {
      if (!perm.permission_id || typeof perm.permission_id !== "string") {
        res.status(400).json({ error: "Each permission must have a valid permission_id" });
        return;
      }
      if (!perm.value || typeof perm.value !== "string") {
        res.status(400).json({ error: "Each permission must have a valid value" });
        return;
      }
      await permService.setGroupPermission(groupId, perm.permission_id, perm.value);
    }

    res.json({ message: "Group permissions updated successfully" });
  } catch (err) {
    console.error("Error updating group permissions:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/categories/:id/permissions
 * List category-specific permissions.
 */
router.get("/api/admin/categories/:id/permissions", async (req: AuthRequest, res: Response) => {
  try {
    const categoryId = req.params.id as string;
    const result = await pool.query<{
      category_id: string;
      group_id: string;
      group_name: string;
      permission_id: string;
      permission_name: string;
      value: string;
    }>(
      `SELECT
         cp.category_id,
         cp.group_id,
         g.name        AS group_name,
         cp.permission_id,
         p.name        AS permission_name,
         cp.value
       FROM forum_category_permissions cp
       JOIN forum_user_groups g ON g.id = cp.group_id
       JOIN forum_permissions p ON p.id = cp.permission_id
       WHERE cp.category_id = $1
       ORDER BY g.name ASC, p.name ASC`,
      [categoryId]
    );

    res.json({ permissions: result.rows });
  } catch (err) {
    console.error("Error listing category permissions:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/admin/categories/:id/permissions
 * Update category-specific permissions.
 * Body: { permissions: [{ group_id, permission_id, value }] }
 */
router.put("/api/admin/categories/:id/permissions", async (req: AuthRequest, res: Response) => {
  try {
    const categoryId = req.params.id as string;
    const { permissions } = req.body;

    if (!Array.isArray(permissions) || permissions.length === 0) {
      res.status(400).json({ error: "permissions array is required and must not be empty" });
      return;
    }

    for (const perm of permissions) {
      if (!perm.group_id || typeof perm.group_id !== "string") {
        res.status(400).json({ error: "Each permission must have a valid group_id" });
        return;
      }
      if (!perm.permission_id || typeof perm.permission_id !== "string") {
        res.status(400).json({ error: "Each permission must have a valid permission_id" });
        return;
      }
      if (!perm.value || typeof perm.value !== "string") {
        res.status(400).json({ error: "Each permission must have a valid value" });
        return;
      }
      await permService.setCategoryPermission(categoryId, perm.group_id, perm.permission_id, perm.value);
    }

    res.json({ message: "Category permissions updated successfully" });
  } catch (err) {
    console.error("Error updating category permissions:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════════════
//  REPORTS
// ════════════════════════════════════════════════════════════

/**
 * GET /api/admin/reports
 * List reports with optional status filter and pagination.
 * Query: ?status=open&page=1
 */
router.get("/api/admin/reports", async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    const result = await modService.getReports(status, page, DEFAULT_PAGE_LIMIT);
    res.json(result);
  } catch (err) {
    console.error("Error listing reports:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/reports/:id
 * Get detailed information about a specific report.
 */
router.get("/api/admin/reports/:id", async (req: AuthRequest, res: Response) => {
  try {
    const reportId = req.params.id as string;
    const report = await modService.getReportDetail(reportId);

    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    res.json({ report });
  } catch (err) {
    console.error("Error getting report detail:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/admin/reports/:id/resolve
 * Resolve a report.
 */
router.post("/api/admin/reports/:id/resolve", async (req: AuthRequest, res: Response) => {
  try {
    const reportId = req.params.id as string;
    await modService.resolveReport(reportId, req.userId!);
    res.json({ message: "Report resolved successfully" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Report not found") {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    console.error("Error resolving report:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/admin/reports/:id/reject
 * Reject (dismiss) a report.
 */
router.post("/api/admin/reports/:id/reject", async (req: AuthRequest, res: Response) => {
  try {
    const reportId = req.params.id as string;
    await modService.rejectReport(reportId, req.userId!);
    res.json({ message: "Report rejected successfully" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Report not found") {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    console.error("Error rejecting report:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════════════
//  BANS
// ════════════════════════════════════════════════════════════

/**
 * GET /api/admin/bans
 * List active bans with pagination.
 * Query: ?page=1
 */
router.get("/api/admin/bans", async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    const result = await modService.getActiveBans(page, DEFAULT_PAGE_LIMIT);
    res.json(result);
  } catch (err) {
    console.error("Error listing bans:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/admin/users/:id/ban
 * Ban a user.
 * Body: { reason: string, duration_hours?: number }
 */
router.post("/api/admin/users/:id/ban", async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.id as string;
    const { reason, duration_hours } = req.body;

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      res.status(400).json({ error: "reason is required" });
      return;
    }

    if (duration_hours !== undefined && (typeof duration_hours !== "number" || duration_hours < 1)) {
      res.status(400).json({ error: "duration_hours must be a positive number" });
      return;
    }

    await modService.banUser(targetUserId, req.userId!, reason.trim(), duration_hours);
    res.json({ message: "User banned successfully" });
  } catch (err) {
    console.error("Error banning user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/admin/users/:id/unban
 * Unban a user.
 */
router.post("/api/admin/users/:id/unban", async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.id as string;
    await modService.unbanUser(targetUserId, req.userId!);
    res.json({ message: "User unbanned successfully" });
  } catch (err) {
    console.error("Error unbanning user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════════════
//  WARNINGS
// ════════════════════════════════════════════════════════════

/**
 * POST /api/admin/users/:id/warn
 * Issue a warning to a user.
 * Body: { points: number, reason: string }
 */
router.post("/api/admin/users/:id/warn", async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.id as string;
    const { points, reason } = req.body;

    if (points === undefined || typeof points !== "number" || points < 1) {
      res.status(400).json({ error: "points must be a positive number" });
      return;
    }

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      res.status(400).json({ error: "reason is required" });
      return;
    }

    await modService.warnUser(targetUserId, req.userId!, points, reason.trim());
    res.json({ message: "Warning issued successfully" });
  } catch (err) {
    console.error("Error warning user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/warnings
 * List warnings with optional user filter and pagination.
 * Query: ?userId=&page=1
 */
router.get("/api/admin/warnings", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = DEFAULT_PAGE_LIMIT;
    const offset = (page - 1) * limit;

    let countSql: string;
    let dataSql: string;
    const params: (string | number)[] = [];
    const countParams: (string | number)[] = [];

    if (userId) {
      countParams.push(userId);
      params.push(userId, limit, offset);

      countSql = `SELECT COUNT(*)::INT AS count FROM forum_warnings WHERE user_id = $1`;
      dataSql = `
        SELECT
          w.id,
          w.user_id,
          u.username        AS username,
          w.warned_by,
          wu.username       AS warner_username,
          w.points,
          w.reason,
          w.created_at
        FROM forum_warnings w
        JOIN users u  ON u.id = w.user_id
        JOIN users wu ON wu.id = w.warned_by
        WHERE w.user_id = $1
        ORDER BY w.created_at DESC
        LIMIT $2 OFFSET $3
      `;
    } else {
      params.push(limit, offset);

      countSql = `SELECT COUNT(*)::INT AS count FROM forum_warnings`;
      dataSql = `
        SELECT
          w.id,
          w.user_id,
          u.username        AS username,
          w.warned_by,
          wu.username       AS warner_username,
          w.points,
          w.reason,
          w.created_at
        FROM forum_warnings w
        JOIN users u  ON u.id = w.user_id
        JOIN users wu ON wu.id = w.warned_by
        ORDER BY w.created_at DESC
        LIMIT $1 OFFSET $2
      `;
    }

    const countResult = await pool.query<{ count: number }>(countSql, countParams);
    const total = Number(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    const result = await pool.query<{
      id: string;
      user_id: string;
      username: string;
      warned_by: string;
      warner_username: string;
      points: number;
      reason: string | null;
      created_at: Date;
    }>(dataSql, params);

    const warnings = result.rows.map((row) => ({
      ...row,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }));

    res.json({
      warnings,
      total,
      page,
      totalPages,
    });
  } catch (err) {
    console.error("Error listing warnings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════════════
//  MOD LOG
// ════════════════════════════════════════════════════════════

/**
 * GET /api/admin/mod-log
 * List moderator action log with pagination.
 * Query: ?page=1
 */
router.get("/api/admin/mod-log", async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    const result = await modService.getModLog(page, DEFAULT_PAGE_LIMIT);
    res.json(result);
  } catch (err) {
    console.error("Error listing mod log:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════

/**
 * GET /api/admin/stats
 * Get dashboard statistics.
 */
router.get("/api/admin/stats", async (_req: AuthRequest, res: Response) => {
  try {
    const [totalUsers, totalThreads, totalPosts, openReports, activeBans] = await Promise.all([
      pool.query<{ count: number }>(`SELECT COUNT(*)::INT AS count FROM users`),
      pool.query<{ count: number }>(`SELECT COUNT(*)::INT AS count FROM forum_threads`),
      pool.query<{ count: number }>(`SELECT COUNT(*)::INT AS count FROM forum_posts`),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::INT AS count FROM forum_reports WHERE status = 'open'`
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::INT AS count
         FROM forum_bans
         WHERE lifted_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())`
      ),
    ]);

    res.json({
      total_users: Number(totalUsers.rows[0].count),
      total_threads: Number(totalThreads.rows[0].count),
      total_posts: Number(totalPosts.rows[0].count),
      open_reports: Number(openReports.rows[0].count),
      active_bans: Number(activeBans.rows[0].count),
    });
  } catch (err) {
    console.error("Error fetching admin stats:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
