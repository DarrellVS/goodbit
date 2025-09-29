import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const code = err?.code || 'INTERNAL_ERROR';
  const message = err?.message || 'Internal server error';
  res.status(status).json({ status, code, message });
};


