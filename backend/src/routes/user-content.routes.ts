import { Router, type Request, type Response } from "express";
import * as profileService from "../services/profile.service";
import * as notifService from "../services/notification.service";
import * as convService from "../services/conversation.service";
import * as bookmarkService from "../services/bookmark.service";
import { verifyAccessToken } from "../services/token.service";

// ── Types ──────────────────────────────────────────────────

interface AuthPayload {
  sub: string;
  username: string;
}

interface AuthRequest extends Request {
  userId?: string;
  username?: string;
  currentUser?: { id: string; username: string } | null;
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Extract token from Authorization header or cookie.
 */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7);
  }
  if ((req as any).cookies?.token) {
    return (req as any).cookies.token;
  }
  return null;
}

/**
 * Verify a JWT and return the payload, or null.
 */
function verifyRequestToken(req: Request): AuthPayload | null {
  const token = extractToken(req);
  if (!token) return null;
  return verifyAccessToken(token);
}

// ── Middleware ──────────────────────────────────────────────

/**
 * Require authentication. Checks Authorization header first, then token cookie.
 * Returns 401 if not authenticated.
 */
function requireAuth(req: AuthRequest, res: Response, next: () => void): void {
  const payload = verifyRequestToken(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = payload.sub;
  req.username = payload.username;
  req.currentUser = { id: payload.sub, username: payload.username };
  next();
}

// ── Router ─────────────────────────────────────────────────

const router = Router();

// ════════════════════════════════════════════════════════════
//  Profile Routes
// ════════════════════════════════════════════════════════════

/**
 * GET /api/user/:id/profile — get a user's public profile
 */
router.get("/api/user/:id/profile", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id as string;

    if (!userId) {
      res.status(400).json({ error: "User ID is required" });
      return;
    }

    const profile = await profileService.getProfile(userId);
    if (!profile) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ profile });
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/user/profile — update the authenticated user's profile
 */
router.put("/api/user/profile", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { signature, about, website, location } = req.body;

    const data: { signature?: string; about?: string; website?: string; location?: string } = {};
    if (signature !== undefined) data.signature = signature;
    if (about !== undefined) data.about = about;
    if (website !== undefined) data.website = website;
    if (location !== undefined) data.location = location;

    const profile = await profileService.updateProfile(req.userId!, data);
    res.json({ profile });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/user/:id/posts — get a user's posts with pagination
 */
router.get("/api/user/:id/posts", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id as string;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    if (!userId) {
      res.status(400).json({ error: "User ID is required" });
      return;
    }

    const result = await profileService.getUserPosts(userId, page, 20);
    res.json({
      posts: result.posts,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (err) {
    console.error("Error fetching user posts:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/user/:id/threads — get a user's threads with pagination
 */
router.get("/api/user/:id/threads", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id as string;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    if (!userId) {
      res.status(400).json({ error: "User ID is required" });
      return;
    }

    const result = await profileService.getUserThreads(userId, page, 20);
    res.json({
      threads: result.threads,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (err) {
    console.error("Error fetching user threads:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════════════
//  Notification Routes
// ════════════════════════════════════════════════════════════

/**
 * GET /api/notifications — get the authenticated user's notifications
 */
router.get("/api/notifications", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    const result = await notifService.getNotifications(req.userId!, page, 20);
    res.json({
      notifications: result.notifications,
      total: result.total,
      unread_count: result.unread_count,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/notifications/unread-count — get the unread notification count
 */
router.get("/api/notifications/unread-count", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const count = await notifService.getUnreadCount(req.userId!);
    res.json({ count });
  } catch (err) {
    console.error("Error fetching unread count:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/notifications/:id/read — mark a single notification as read
 */
router.post("/api/notifications/:id/read", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const notificationId = req.params.id as string;

    if (!notificationId) {
      res.status(400).json({ error: "Notification ID is required" });
      return;
    }

    await notifService.markRead(notificationId, req.userId!);
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/notifications/read-all — mark all notifications as read
 */
router.post("/api/notifications/read-all", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await notifService.markAllRead(req.userId!);
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking all notifications as read:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════════════
//  Conversation Routes
// ════════════════════════════════════════════════════════════

/**
 * GET /api/conversations — list the authenticated user's conversations
 */
router.get("/api/conversations", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    const result = await convService.getConversations(req.userId!, page, 20);
    res.json({
      conversations: result.conversations,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (err) {
    console.error("Error fetching conversations:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/conversations — create a new conversation
 */
router.post("/api/conversations", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, recipients, content } = req.body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({ error: "At least one recipient is required" });
      return;
    }

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: "Content is required" });
      return;
    }

    const conversation = await convService.createConversation(
      req.userId!,
      title.trim(),
      recipients,
      content.trim()
    );

    res.status(201).json({ conversation });
  } catch (err) {
    console.error("Error creating conversation:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/conversations/:id — get messages for a conversation
 */
router.get("/api/conversations/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.id as string;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    if (!conversationId) {
      res.status(400).json({ error: "Conversation ID is required" });
      return;
    }

    const result = await convService.getConversationMessages(conversationId, req.userId!, page, 20);
    res.json({
      messages: result.messages,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (err) {
    console.error("Error fetching conversation messages:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/conversations/:id/reply — reply to a conversation
 */
router.post("/api/conversations/:id/reply", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.id as string;
    const { content } = req.body;

    if (!conversationId) {
      res.status(400).json({ error: "Conversation ID is required" });
      return;
    }

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: "Content is required" });
      return;
    }

    const message = await convService.replyToConversation(conversationId, req.userId!, content.trim());
    res.status(201).json({ message });
  } catch (err) {
    console.error("Error replying to conversation:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/conversations/:id/leave — leave a conversation
 */
router.post("/api/conversations/:id/leave", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.id as string;

    if (!conversationId) {
      res.status(400).json({ error: "Conversation ID is required" });
      return;
    }

    await convService.leaveConversation(conversationId, req.userId!);
    res.json({ success: true });
  } catch (err) {
    console.error("Error leaving conversation:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/conversations/:id/add — add recipients to a conversation
 */
router.post("/api/conversations/:id/add", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.id as string;
    const { recipients } = req.body;

    if (!conversationId) {
      res.status(400).json({ error: "Conversation ID is required" });
      return;
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({ error: "At least one recipient is required" });
      return;
    }

    await convService.addRecipients(conversationId, req.userId!, recipients);
    res.json({ success: true });
  } catch (err) {
    console.error("Error adding recipients:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════════════
//  Bookmark Routes
// ════════════════════════════════════════════════════════════

/**
 * GET /api/bookmarks — get the authenticated user's bookmarks
 */
router.get("/api/bookmarks", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    const result = await bookmarkService.getBookmarks(req.userId!, page, 20);
    res.json({
      bookmarks: result.bookmarks,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (err) {
    console.error("Error fetching bookmarks:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
