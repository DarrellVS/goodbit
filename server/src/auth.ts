import type { Request, Response, NextFunction } from 'express';
import { VerifyFirebaseTokenAction } from './actions/VerifyFirebaseTokenAction.js';

// API token from environment variable
const API_TOKEN = 'REMOVED'

export async function verifyFirebaseToken(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    const queryToken = typeof req.query.token === 'string' ? (req.query.token as string) : null;
    const idToken = m ? m[1] : (queryToken || '');
    if (!idToken) return res.status(401).json({ error: 'Missing bearer token' });
    
    // Check if it's an API token first
    if (API_TOKEN && idToken === API_TOKEN) {
      // Valid API token - proceed without setting user
      return next();
    }
    
    // Otherwise, try Firebase authentication
    const decoded = await new VerifyFirebaseTokenAction().execute({ token: idToken });
    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}


