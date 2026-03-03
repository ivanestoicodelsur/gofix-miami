import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { newJti, refreshExpiresAt, sha256, signAccessToken, signRefreshToken, verifyRefreshToken, type JwtRefreshPayload } from "../utils/jwt";
import { body } from "express-validator";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();
const prisma = new PrismaClient();

router.post(
  "/register",
  body("email").isEmail().withMessage("Invalid email"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("name").optional().isString(),
  validateRequest,
  async (req, res) => {
    const { email, password, name } = req.body;
    try {
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) return res.status(409).json({ error: "User already exists" });
      const hash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({ data: { email, password: hash, name } });

      const accessToken = signAccessToken({ userId: user.id, role: user.role });
      const jti = newJti();
      const refreshToken = signRefreshToken({ userId: user.id, jti });
      const tokenHash = sha256(refreshToken);

      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          jti,
          tokenHash,
          expiresAt: refreshExpiresAt(),
        },
      });

      res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, accessToken, refreshToken });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.post(
  "/login",
  body("email").isEmail().withMessage("Invalid email"),
  body("password").notEmpty().withMessage("Password is required"),
  validateRequest,
  async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });

      const accessToken = signAccessToken({ userId: user.id, role: user.role });
      const jti = newJti();
      const refreshToken = signRefreshToken({ userId: user.id, jti });
      const tokenHash = sha256(refreshToken);

      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          jti,
          tokenHash,
          expiresAt: refreshExpiresAt(),
        },
      });

      res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, accessToken, refreshToken });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.post(
  "/refresh",
  body("refreshToken").isString().notEmpty(),
  validateRequest,
  async (req, res) => {
    const refreshToken = String(req.body.refreshToken);
    const payload = verifyRefreshToken<JwtRefreshPayload>(refreshToken);
    if (!payload) return res.status(401).json({ error: "Invalid refresh token" });

    const tokenHash = sha256(refreshToken);

    const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record) return res.status(401).json({ error: "Refresh token not found" });
    if (record.revokedAt) return res.status(401).json({ error: "Refresh token revoked" });
    if (record.expiresAt.getTime() <= Date.now()) return res.status(401).json({ error: "Refresh token expired" });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: "User not found" });

    // rotate refresh token
    const nextJti = newJti();
    const nextRefreshToken = signRefreshToken({ userId: user.id, jti: nextJti });
    const nextHash = sha256(nextRefreshToken);

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { tokenHash },
        data: { revokedAt: new Date(), replacedByTokenHash: nextHash },
      }),
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          jti: nextJti,
          tokenHash: nextHash,
          expiresAt: refreshExpiresAt(),
        },
      }),
    ]);

    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    res.json({ accessToken, refreshToken: nextRefreshToken });
  }
);

router.post(
  "/logout",
  body("refreshToken").isString().notEmpty(),
  validateRequest,
  async (req, res) => {
    const refreshToken = String(req.body.refreshToken);
    const tokenHash = sha256(refreshToken);
    try {
      await prisma.refreshToken.update({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });
    } catch {
      // ignore if missing
    }
    res.json({ ok: true });
  }
);

export default router;
