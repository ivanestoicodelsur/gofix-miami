import jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || "change-me";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "change-me";

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";
const REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS || 30);

export type JwtAccessPayload = {
  userId: number;
  role: string;
};

export type JwtRefreshPayload = {
  userId: number;
  jti: string;
};

export function signAccessToken(payload: JwtAccessPayload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL } as jwt.SignOptions);
}

export function verifyAccessToken<T = any>(token: string): T | null {
  try {
    return jwt.verify(token, ACCESS_SECRET) as T;
  } catch {
    return null;
  }
}

export function signRefreshToken(payload: JwtRefreshPayload) {
  const expiresInSeconds = Math.max(1, Math.floor(REFRESH_TTL_DAYS * 24 * 60 * 60));
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: expiresInSeconds } as jwt.SignOptions);
}

export function verifyRefreshToken<T = any>(token: string): T | null {
  try {
    return jwt.verify(token, REFRESH_SECRET) as T;
  } catch {
    return null;
  }
}

export function newJti(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function refreshExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}
