import type { Request, Response, NextFunction } from 'express';
import { firebaseService } from '../services/firebaseService.js';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    const queryToken = typeof req.query.token === 'string' ? (req.query.token as string) : null;
    const idToken = m ? m[1] : (queryToken || '');
    if (!idToken) return res.status(401).json({ error: 'Missing bearer token' });
    const decoded = await firebaseService.admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}


