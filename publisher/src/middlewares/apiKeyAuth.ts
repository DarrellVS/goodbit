import type { RequestHandler } from 'express';

export const apiKeyAuth: RequestHandler = (req, res, next) => {
  const apiKey = process.env.PUBLISHER_API_KEY;

  // If no API key is configured, skip auth (for local development)
  if (!apiKey) {
    console.warn('⚠️  PUBLISHER_API_KEY not set - API is unprotected!');
    return next();
  }

  // Check for API key in Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Missing or invalid authorization header' 
    });
  }

  const providedKey = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (providedKey !== apiKey) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid API key' 
    });
  }

  next();
};

