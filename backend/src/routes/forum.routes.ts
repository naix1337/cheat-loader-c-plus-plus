import { Router, type Request, type Response } from "express";
import path from "path";
import * as forumService from "../services/forum.service";
import { verifyAccessToken } from "../services/token.service";
import { pool } from "../db/pool";
import * as searchService from "../services/search.service";
import * as reactionService from "../services/reaction.service";
import * as watchService from "../services/watch.service";
import * as bookmarkService from "../services/bookmark.service";

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

// ── Constants ──────────────────────────────────────────────

const THREADS_PER_PAGE = 20;

// ── Helpers ────────────────────────────────────────────────

/**
 * Format an ISO date string into a human-readable German format.
 */
function formatDate(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const timeStr = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  if (target.getTime() === today.getTime()) {
    return `Heute, ${timeStr}`;
  }
  if (target.getTime() === yesterday.getTime()) {
    return `Gestern, ${timeStr}`;
  }
  return `${d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })}, ${timeStr}`;
}

/**
 * Extract token from Authorization header or cookie.
 */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7);
  }
  if (req.cookies?.token) {
    return req.cookies.token;
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

// ── Middleware ─────────────────────────────────────────────

/**
 * Hydrate currentUser from JWT (optional — does not fail if unauthenticated).
 * Sets req.currentUser to { id, username } or null.
 */
function hydrateCurrentUser(req: AuthRequest, _res: Response, next: () => void): void {
  const payload = verifyRequestToken(req);
  if (payload) {
    req.currentUser = { id: payload.sub, username: payload.username };
  } else {
    req.currentUser = null;
  }
  next();
}

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

/**
 * Require admin role (after requireAuth).
 */
async function requireAdmin(req: AuthRequest, res: Response, next: () => void): Promise<void> {
  try {
    const result = await pool.query<{ role: string }>(
      `SELECT role FROM users WHERE id = $1`,
      [req.userId]
    );
    const isAdmin = result.rows[0]?.role === "admin";
    if (!isAdmin) {
      res.status(403).json({ error: "Forbidden — admin access required" });
      return;
    }
    next();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Render a content template inside the forum layout.
 */
function renderWithLayout(
  res: Response,
  template: string,
  data: Record<string, unknown>
): void {
  const { forumTitle, currentUser, activeNav, ...templateData } = data;
  res.render(template, templateData, (err: Error | null, html: string) => {
    if (err) {
      console.error("Template render error:", err);
      res.status(500).send("Template error");
      return;
    }
    res.render("forum/layout", {
      forumTitle: forumTitle || "Forum",
      currentUser: currentUser || null,
      activeNav: activeNav || "forum",
      body: html,
    });
  });
}

// ── Router ─────────────────────────────────────────────────

const router = Router();

// ════════════════════════════════════════════════════════════
//  SSR ROUTES (HTML pages)
// ════════════════════════════════════════════════════════════

/**
 * GET /forum — serve the new design forum page (static HTML with API calls)
 */
router.get("/forum", hydrateCurrentUser, async (_req: AuthRequest, res: Response) => {
  try {
    const publicDir = path.join(__dirname, "../public");
    res.sendFile(path.join(publicDir, "forum.html"));
  } catch (err) {
    console.error("Error serving forum page:", err);
    res.status(500).send("Internal server error");
  }
});

/**
 * GET /forum/c/:slug — list threads in a category
 */
router.get("/forum/c/:slug", hydrateCurrentUser, async (req: AuthRequest, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    const result = await forumService.listThreads(slug, page, THREADS_PER_PAGE);

    // Get category info
    const category = await forumService.getCategoryBySlug(slug);
    if (!category) {
      res.status(404).send("Category not found");
      return;
    }

    // Format dates for display
    const formattedThreads = result.threads.map((thread) => {
      const t: Record<string, unknown> = { ...thread };
      t.created_at_formatted = formatDate(thread.created_at);
      if (thread.last_post) {
        t.last_post = {
          ...thread.last_post,
          created_at_formatted: formatDate(thread.last_post.created_at),
        };
      }
      return t;
    });

    renderWithLayout(res, "forum/threads", {
      forumTitle: `${category.name} — Forum — insolution.cloud`,
      currentUser: req.currentUser,
      activeNav: "forum",
      category: { name: category.name, slug: category.slug, description: category.description },
      threads: formattedThreads,
      pagination: {
        page: result.page,
        limit: THREADS_PER_PAGE,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Category not found") {
      res.status(404).send("Category not found");
      return;
    }
    console.error("Error loading threads:", err);
    res.status(500).send("Internal server error");
  }
});

/**
 * GET /forum/c/:slug/new — show new thread form
 */
router.get(
  "/forum/c/:slug/new",
  hydrateCurrentUser,
  async (req: AuthRequest, res: Response) => {
    if (!req.currentUser) {
      res.redirect("/forum/c/" + (req.params.slug as string));
      return;
    }

    try {
      const slug = req.params.slug as string;
      const category = await forumService.getCategoryBySlug(slug);
      if (!category) {
        res.status(404).send("Category not found");
        return;
      }

      // Get a fresh token for the form
      const token = extractToken(req) || "";

      renderWithLayout(res, "forum/new-thread", {
        forumTitle: `Neues Thema — ${category.name} — Forum — insolution.cloud`,
        currentUser: req.currentUser,
        activeNav: "forum",
        category: { name: category.name, slug: category.slug },
        token,
      });
    } catch (err) {
      console.error("Error loading new thread form:", err);
      res.status(500).send("Internal server error");
    }
  }
);

/**
 * GET /forum/t/:slug — view a thread with posts
 */
router.get("/forum/t/:slug", hydrateCurrentUser, async (_req: AuthRequest, res: Response) => {
  try {
    const publicDir = path.join(__dirname, "../public");
    res.sendFile(path.join(publicDir, "thread.html"));
  } catch (err) {
    console.error("Error serving thread page:", err);
    res.status(500).send("Internal server error");
  }
});

/**
 * GET /forum/posts/:id/edit — show edit post form
 */
router.get(
  "/forum/posts/:id/edit",
  hydrateCurrentUser,
  async (req: AuthRequest, res: Response) => {
    if (!req.currentUser) {
      res.redirect("/forum");
      return;
    }

    try {
      const postId = req.params.id as string;

      // Get the post details
      const postResult = await pool.query<{
        id: string;
        thread_id: string;
        author_id: string;
        content: string;
        slug: string;
        title: string;
        category_name: string;
        category_slug: string;
      }>(
        `SELECT p.id, p.thread_id, p.author_id, p.content,
                t.slug, t.title, c.name AS category_name, c.slug AS category_slug
         FROM forum_posts p
         JOIN forum_threads t ON t.id = p.thread_id
         JOIN forum_categories c ON c.id = t.category_id
         WHERE p.id = $1`,
        [postId]
      );

      if (postResult.rows.length === 0) {
        res.status(404).send("Post not found");
        return;
      }

      const post = postResult.rows[0];

      // Only author can edit
      if (post.author_id !== req.currentUser.id) {
        res.status(403).send("Not authorized");
        return;
      }

      const token = extractToken(req) || "";

      renderWithLayout(res, "forum/edit-post", {
        forumTitle: "Beitrag bearbeiten — Forum — insolution.cloud",
        currentUser: req.currentUser,
        activeNav: "forum",
        post: {
          id: post.id,
          content: post.content,
        },
        thread: {
          slug: post.slug,
          title: post.title,
          category_name: post.category_name,
          category_slug: post.category_slug,
        },
        token,
      });
    } catch (err) {
      console.error("Error loading edit form:", err);
      res.status(500).send("Internal server error");
    }
  }
);

// ════════════════════════════════════════════════════════════
//  API ROUTES (JSON)
// ════════════════════════════════════════════════════════════

/**
 * GET /api/forum/categories — list all categories with thread counts
 */
router.get("/api/forum/categories", async (_req: AuthRequest, res: Response) => {
  try {
    const categories = await forumService.listCategories();
    res.json(categories);
  } catch (err) {
    console.error("Error listing categories:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/forum/threads — create a new thread
 */
router.post("/api/forum/threads", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { categorySlug, title, content } = req.body;

    if (!categorySlug || !title || !content) {
      res.status(400).json({ error: "categorySlug, title, and content are required" });
      return;
    }

    if (typeof title !== "string" || title.trim().length < 3) {
      res.status(400).json({ error: "Title must be at least 3 characters" });
      return;
    }

    if (typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: "Content cannot be empty" });
      return;
    }

    const thread = await forumService.createThread(
      categorySlug,
      req.userId!,
      title.trim(),
      content.trim()
    );

    res.status(201).json({
      id: thread.id,
      slug: thread.slug,
      title: thread.title,
      message: "Thread created successfully",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Category not found") {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    console.error("Error creating thread:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/forum/posts — create a new post (reply)
 */
router.post("/api/forum/posts", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { threadSlug, content } = req.body;

    if (!threadSlug || !content) {
      res.status(400).json({ error: "threadSlug and content are required" });
      return;
    }

    if (typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: "Content cannot be empty" });
      return;
    }

    const post = await forumService.createPost(
      threadSlug,
      req.userId!,
      content.trim()
    );

    // XHR form submissions via fetch — always return JSON
    res.status(201).json({
      id: post.id,
      message: "Post created successfully",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Thread not found") {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    if (msg === "Cannot post to a locked thread") {
      res.status(403).json({ error: "Thread is locked" });
      return;
    }
    console.error("Error creating post:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/forum/posts/:id — edit a post
 */
router.put("/api/forum/posts/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;
    const { content } = req.body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: "Content cannot be empty" });
      return;
    }

    const updated = await forumService.updatePost(postId, req.userId!, content.trim());

    if (!updated) {
      res.status(404).json({ error: "Post not found or not authorized" });
      return;
    }

    res.json({ message: "Post updated successfully" });
  } catch (err) {
    console.error("Error updating post:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/forum/posts/:id — delete a post
 */
router.delete("/api/forum/posts/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;

    // Determine if user is admin
    const userResult = await pool.query<{ role: string }>(
      `SELECT role FROM users WHERE id = $1`,
      [req.userId]
    );
    const isAdmin = userResult.rows[0]?.role === "admin";

    const deleted = await forumService.deletePost(postId, req.userId!, isAdmin);

    if (!deleted) {
      res.status(404).json({ error: "Post not found or not authorized" });
      return;
    }

    res.json({ message: "Post deleted successfully" });
  } catch (err) {
    console.error("Error deleting post:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/forum/admin/pin/:threadId — toggle pin (admin only)
 */
router.post(
  "/api/forum/admin/pin/:threadId",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const pinned = await forumService.pinThread(
        req.params.threadId as string,
        req.userId!,
        true
      );

      res.json({
        message: pinned ? "Thread pinned" : "Thread unpinned",
        pinned,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg === "Thread not found") {
        res.status(404).json({ error: "Thread not found" });
        return;
      }
      console.error("Error toggling pin:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * POST /api/forum/admin/lock/:threadId — toggle lock (admin only)
 */
router.post(
  "/api/forum/admin/lock/:threadId",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const locked = await forumService.lockThread(
        req.params.threadId as string,
        req.userId!,
        true
      );

      res.json({
        message: locked ? "Thread locked" : "Thread unlocked",
        locked,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg === "Thread not found") {
        res.status(404).json({ error: "Thread not found" });
        return;
      }
      console.error("Error toggling lock:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ════════════════════════════════════════════════════════════
//  NEW API ROUTES (reactions, bookmarks, watch, search, etc.)
// ════════════════════════════════════════════════════════════

/**
 * POST /api/forum/posts/:id/reaction — toggle a reaction on a post
 */
router.post("/api/forum/posts/:id/reaction", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;
    const { type } = req.body;

    if (!type || !["like", "love", "haha", "wow", "sad", "angry"].includes(type)) {
      res.status(400).json({ error: "Invalid reaction type" });
      return;
    }

    const result = await reactionService.toggleReaction(postId, req.userId!, type);
    res.json({ action: result.action, reaction: result.reaction });
  } catch (err) {
    console.error("Error toggling reaction:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/forum/posts/:id/reactions — get reaction breakdown for a post
 */
router.get("/api/forum/posts/:id/reactions", hydrateCurrentUser, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;
    const reactions = await reactionService.getPostReactions(postId, req.currentUser?.id);
    res.json(reactions);
  } catch (err) {
    console.error("Error getting reactions:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/forum/posts/:id/bookmark — toggle a bookmark on a post
 */
router.post("/api/forum/posts/:id/bookmark", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;
    const result = await bookmarkService.toggleBookmark(req.userId!, postId);
    res.json({ bookmarked: result.bookmarked });
  } catch (err) {
    console.error("Error toggling bookmark:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/forum/threads/:id/watch — toggle watching a thread
 */
router.post("/api/forum/threads/:id/watch", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const threadId = req.params.id as string;
    const result = await watchService.toggleThreadWatch(req.userId!, threadId);
    res.json({ watching: result.watching });
  } catch (err) {
    console.error("Error toggling thread watch:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/forum/threads/:id/move — move a thread to a different category (admin only)
 */
router.post("/api/forum/threads/:id/move", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const threadId = req.params.id as string;
    const { category_id } = req.body;

    if (!category_id) {
      res.status(400).json({ error: "category_id is required" });
      return;
    }

    await pool.query(
      `UPDATE forum_threads SET category_id = $1, updated_at = NOW() WHERE id = $2`,
      [category_id, threadId]
    );

    res.json({ message: "Thread moved successfully" });
  } catch (err) {
    console.error("Error moving thread:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/forum/search — search threads and posts
 */
router.get("/api/forum/search", async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query.q as string;
    const type = (req.query.type as string) || "threads";
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    if (!q || q.trim().length === 0) {
      res.status(400).json({ error: "Search query is required" });
      return;
    }

    const results = await searchService.search(q.trim(), type as "threads" | "posts", page);
    res.json(results);
  } catch (err) {
    console.error("Error searching:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/forum/unread — list recent threads (simple unread implementation)
 */
router.get("/api/forum/unread", requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, title, slug, updated_at, created_at
       FROM forum_threads
       ORDER BY updated_at DESC
       LIMIT 50`
    );

    res.json({ threads: result.rows });
  } catch (err) {
    console.error("Error fetching unread threads:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════════════
//  NEW SSR ROUTES
// ════════════════════════════════════════════════════════════

/**
 * GET /forum/search — search page (SSR)
 */
router.get("/forum/search", hydrateCurrentUser, async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query.q as string;

    if (!q || q.trim().length === 0) {
      renderWithLayout(res, "forum/search", {
        forumTitle: "Suche — Forum — insolution.cloud",
        currentUser: req.currentUser,
        activeNav: "forum",
        results: null,
        query: "",
      });
      return;
    }

    const results = await searchService.search(q.trim(), "threads", 1);

    renderWithLayout(res, "forum/search", {
      forumTitle: `Suche: ${q} — Forum — insolution.cloud`,
      currentUser: req.currentUser,
      activeNav: "forum",
      results,
      query: q,
    });
  } catch (err) {
    console.error("Error searching:", err);
    renderWithLayout(res, "forum/search", {
      forumTitle: "Suche — Forum — insolution.cloud",
      currentUser: req.currentUser,
      activeNav: "forum",
      results: null,
      query: (req.query.q as string) || "",
      error: "Fehler bei der Suche.",
    });
  }
});

export default router;
