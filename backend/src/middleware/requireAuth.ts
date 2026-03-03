import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type JwtAccessPayload } from '../utils/jwt';

export type AuthedRequest = Request & { user?: JwtAccessPayload };

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const payload = verifyAccessToken<JwtAccessPayload>(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  req.user = payload;
  next();
}

export function requireRole(roles: string[]) {
  const normalized = new Set(roles);
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!normalized.has(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
