import { Router, type Request, type Response } from "express";
import * as forumService from "../services/forum.service";
import { verifyAccessToken } from "../services/token.service";
import { pool } from "../db/pool";

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
const POSTS_PER_PAGE = 10;

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
 * Convert plain text to HTML with paragraph breaks.
 */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return escaped
    .split(/\n\s*\n/)
    .map((p) => `<p>${p.replace(/\n/g, "<br />")}</p>`)
    .join("");
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
    const result = await pool.query<{ username: string }>(
      `SELECT username FROM users WHERE id = $1`,
      [req.userId]
    );
    const isAdmin = result.rows[0]?.username === "admin";
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
 * GET /forum — list all categories
 */
router.get("/forum", hydrateCurrentUser, async (req: AuthRequest, res: Response) => {
  try {
    const categories = await forumService.listCategories();

    // Format dates for display
    const formattedCategories = categories.map((cat) => {
      const catObj: Record<string, unknown> = { ...cat };
      if (cat.last_post) {
        catObj.last_post = {
          ...cat.last_post,
          created_at_formatted: formatDate(cat.last_post.created_at),
        };
      }
      return catObj;
    });

    renderWithLayout(res, "forum/categories", {
      forumTitle: "Forum — insolution.cloud",
      currentUser: req.currentUser,
      activeNav: "forum",
      categories: formattedCategories,
    });
  } catch (err) {
    console.error("Error loading categories:", err);
    renderWithLayout(res, "forum/categories", {
      forumTitle: "Forum — insolution.cloud",
      currentUser: req.currentUser,
      activeNav: "forum",
      categories: [],
      error: "Fehler beim Laden der Kategorien.",
    });
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
router.get("/forum/t/:slug", hydrateCurrentUser, async (req: AuthRequest, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    // Increment view counter
    forumService.incrementViews(slug).catch(() => {});

    const thread = await forumService.getThreadBySlug(slug);
    if (!thread) {
      res.status(404).send("Thread not found");
      return;
    }

    const postsResult = await forumService.getPostsByThread(slug, page, POSTS_PER_PAGE);

    // Get the token for the reply/delete forms
    const token = extractToken(req) || "";

    // Format dates and content
    const formattedPosts = postsResult.posts.map((post) => {
      const p: Record<string, unknown> = { ...post };
      p.created_at_formatted = formatDate(post.created_at);
      p.updated_at_formatted = post.updated_at && post.updated_at !== post.created_at
        ? formatDate(post.updated_at)
        : null;
      p.content_html = textToHtml(post.content);
      return p;
    });

    // Calculate reply count (total posts minus first = replies)
    const replyCount = postsResult.total - 1;

    renderWithLayout(res, "forum/thread", {
      forumTitle: `${thread.title} — Forum — insolution.cloud`,
      currentUser: req.currentUser,
      activeNav: "forum",
      thread: {
        id: thread.id,
        title: thread.title,
        slug: thread.slug,
        category_name: thread.category_name,
        category_slug: thread.category_slug,
        author_username: thread.author_username,
        author_id: thread.author_id,
        pinned: thread.pinned,
        locked: thread.locked,
        views: thread.views,
        replyCount: Math.max(0, replyCount),
        created_at_formatted: formatDate(thread.created_at),
      },
      posts: formattedPosts,
      pagination: {
        page: postsResult.page,
        limit: POSTS_PER_PAGE,
        total: postsResult.total,
        totalPages: postsResult.totalPages,
      },
      token,
    });
  } catch (err) {
    console.error("Error loading thread:", err);
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
    const userResult = await pool.query<{ username: string }>(
      `SELECT username FROM users WHERE id = $1`,
      [req.userId]
    );
    const isAdmin = userResult.rows[0]?.username === "admin";

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

export default router;
