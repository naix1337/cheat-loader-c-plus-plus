import type { NextFunction, Request, Response } from "express";

const SENSITIVE_KEYS = new Set(["password", "otp", "refresh_token", "access_token"]);

function redactBody(body: unknown): unknown {
  if (!body || typeof body !== "object") {
    return body;
  }
  const copy: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of Object.keys(copy)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      copy[key] = "[REDACTED]";
    }
  }
  return copy;
}

/** Request logging — never log passwords or tokens. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const body =
      req.method === "POST" || req.method === "PUT"
        ? JSON.stringify(redactBody(req.body))
        : "";
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms ${body}`
    );
  });
  next();
}
