import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../services/token.service";

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "Token expired or invalid" });
    return;
  }

  req.userId = payload.sub;
  req.username = payload.username;
  next();
}
