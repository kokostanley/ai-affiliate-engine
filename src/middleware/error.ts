// ============================================
// Error Classes
// ============================================

export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

// Not Found Error
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier "${identifier}" not found`
      : `${resource} not found`;
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

// Validation Error
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

// Unauthorized Error
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}

// Forbidden Error
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

// Conflict Error
export class ConflictError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier "${identifier}" already exists`
      : `${resource} already exists`;
    super('CONFLICT', message, 409);
    this.name = 'ConflictError';
  }
}

// Rate Limit Error
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super('RATE_LIMIT_EXCEEDED', message, 429);
    this.name = 'RateLimitError';
  }
}

// External Service Error
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: unknown) {
    super('EXTERNAL_SERVICE_ERROR', `${service}: ${message}`, 502, details);
    this.name = 'ExternalServiceError';
  }
}

// AI Service Error
export class AIServiceError extends AppError {
  constructor(message: string, details?: unknown) {
    super('AI_SERVICE_ERROR', message, 503, details);
    this.name = 'AIServiceError';
  }
}

// Database Error
export class DatabaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super('DATABASE_ERROR', message, 500, details);
    this.name = 'DatabaseError';
  }
}

// ============================================
// Error Handler
// ============================================

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { config } from '../lib/config';

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  stack?: string;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error
  console.error('[Error]', {
    name: err.name,
    message: err.message,
    path: req.path,
    method: req.method,
  });

  // Handle known errors
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      success: false,
      error: err.toJSON(),
    };

    // Include stack trace in development
    if (config.isDevelopment) {
      response.stack = err.stack;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    };

    if (config.isDevelopment) {
      response.stack = err.stack;
    }

    res.status(400).json(response);
    return;
  }

  // Handle unknown errors
  const response: ErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isDevelopment ? err.message : 'Internal server error',
    },
  };

  if (config.isDevelopment) {
    response.stack = err.stack;
  }

  res.status(500).json(response);
}

// ============================================
// Async Handler Wrapper
// ============================================

import type { RequestHandler } from 'express';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ============================================
// Not Found Handler
// ============================================

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}

// ============================================
// Conflict Handler Helper
// ============================================

export function handlePrismaError(error: any): never {
  // P2002 = Unique constraint failed
  if (error.code === 'P2002') {
    const field = error.meta?.target || 'field';
    throw new ConflictError(field);
  }

  // P2003 = Foreign key constraint failed
  if (error.code === 'P2003') {
    throw new DatabaseError('Referenced resource does not exist');
  }

  // P2025 = Record not found
  if (error.code === 'P2025') {
    throw new NotFoundError('Resource');
  }

  throw new DatabaseError(error.message);
}