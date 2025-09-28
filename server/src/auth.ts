import type { Request, Response, NextFunction } from 'express';
import { firebaseAdmin } from './firebase.js';

export async function verifyFirebaseToken(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    const queryToken = typeof req.query.token === 'string' ? (req.query.token as string) : null;
    const idToken = m ? m[1] : (queryToken || '');
    if (!idToken) return res.status(401).json({ error: 'Missing bearer token' });
    const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}


