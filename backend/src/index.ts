import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { corsMiddleware } from "./middleware/cors";
import { globalRateLimiter } from "./middleware/rateLimiter";
import { requestLogger } from "./middleware/security";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";

const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(corsMiddleware);
app.use(express.json({ limit: "16kb" }));
app.use(requestLogger);
app.use(globalRateLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(env.port, () => {
  console.log(`API listening on port ${env.port} (${env.nodeEnv})`);
});
