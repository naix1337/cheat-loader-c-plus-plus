import express from "express";
import helmet from "helmet";
import path from "path";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { corsMiddleware } from "./middleware/cors";
import { globalRateLimiter } from "./middleware/rateLimiter";
import { requestLogger } from "./middleware/security";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import registerRoutes from "./routes/register.routes";
import forumRoutes from "./routes/forum.routes";
import adminRoutes from './routes/admin.routes';
import userContentRoutes from './routes/user-content.routes';

const app = express();

app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(corsMiddleware);
app.use(cookieParser());
app.use(express.json({ limit: "16kb" }));
app.use(requestLogger);
app.use(globalRateLimiter);

// Serve static frontend from public/ directory
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// API routes
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

// Registration — the GET route serves the HTML page,
// POST /api/register handles account creation
app.use("/register", registerRoutes);

// Forum — SSR pages and API endpoints
app.use("/", forumRoutes);

// Admin API — group management, permissions, reports, bans, warnings, mod log
app.use("/api/admin", adminRoutes);

// User-content API — notifications, conversations, bookmarks, profile
app.use("/api/notifications", userContentRoutes);
app.use("/api/conversations", userContentRoutes);
app.use("/api/bookmarks", userContentRoutes);
app.use("/api/user", userContentRoutes);  // for profile routes

// 404 handler — skip for paths that might be static files
app.use((req, res) => {
  // Don't 404 for root — index.html is served by express.static
  if (req.accepts("html")) {
    res.status(404).sendFile(path.join(publicDir, "404.html"), (err) => {
      if (err) res.status(404).json({ error: "Not found" });
    });
    return;
  }
  res.status(404).json({ error: "Not found" });
});

app.listen(env.port, () => {
  console.log(`API listening on port ${env.port} (${env.nodeEnv})`);
  console.log(`Static frontend: ${publicDir}`);
});
