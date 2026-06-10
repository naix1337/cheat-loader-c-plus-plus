import cors from "cors";
import { env } from "../config/env";

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) {
      // Native clients (no Origin header) are allowed.
      callback(null, true);
      return;
    }
    if (env.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("CORS origin not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
