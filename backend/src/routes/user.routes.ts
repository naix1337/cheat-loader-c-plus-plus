import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { findById, toPublicUser, updateProfile } from "../services/user.service";

const router = Router();

const updateSchema = z.object({
  email: z.string().email().optional(),
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const user = await findById(req.userId!);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: toPublicUser(user) });
});

router.put("/me", requireAuth, async (req: AuthRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed" });
    return;
  }

  const updated = await updateProfile(req.userId!, parsed.data);
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ user: updated });
});

export default router;
