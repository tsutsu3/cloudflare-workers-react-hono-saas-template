/**
 * Error Handler Middleware
 * Centralized error handling for the Hono application
 */

import type { ErrorHandler, Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { HTTPException } from "hono/http-exception";

// ============================================================================
// Types
// ============================================================================

interface ErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
  code?: string;
}

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Application-specific error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends AppError {
  constructor(message: string = "Not authenticated") {
    super(message, 401, "AUTHENTICATION_ERROR");
    this.name = "AuthenticationError";
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends AppError {
  constructor(message: string = "Not authorized") {
    super(message, 403, "AUTHORIZATION_ERROR");
    this.name = "AuthorizationError";
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  constructor(message: string = "Rate limit exceeded", retryAfter?: number) {
    super(message, 429, "RATE_LIMIT_EXCEEDED", { retryAfter });
    this.name = "RateLimitError";
  }
}

// ============================================================================
// Error Handler
// ============================================================================

/**
 * Global error handler for the Hono application
 */
export const errorHandler: ErrorHandler = (err, c) => {
  // Log the error for debugging
  console.error("Error:", {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });

  // Build the error response
  const response: ErrorResponse = {
    error: "Internal server error",
  };

  let statusCode: ContentfulStatusCode = 500;

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    response.error = "Validation error";
    response.code = "VALIDATION_ERROR";
    response.details = err.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));
    return c.json(response, 400);
  }

  // Handle Hono HTTP exceptions
  if (err instanceof HTTPException) {
    response.error = err.message || getDefaultMessageForStatus(err.status);
    return c.json(response, err.status);
  }

  // Handle custom application errors
  if (err instanceof AppError) {
    response.error = err.message;
    response.code = err.code;
    if (err.details) {
      response.details = err.details;
    }
    // Cast to ContentfulStatusCode - we know these are valid HTTP status codes
    return c.json(response, err.statusCode as ContentfulStatusCode);
  }

  // Handle standard errors with known messages
  if (err instanceof Error) {
    // Check for common authentication/authorization messages
    if (err.message.includes("Not authenticated") || err.message.includes("not authenticated")) {
      statusCode = 401;
      response.error = err.message;
    } else if (err.message.includes("permission") || err.message.includes("Admin access required")) {
      statusCode = 403;
      response.error = err.message;
    } else if (err.message.includes("not found") || err.message.includes("Not found")) {
      statusCode = 404;
      response.error = err.message;
    } else {
      // Generic server error - don't expose internal details
      response.error = "An unexpected error occurred";
    }
  }

  return c.json(response, statusCode);
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get default error message for HTTP status code
 */
function getDefaultMessageForStatus(status: number): string {
  const messages: Record<number, string> = {
    400: "Bad request",
    401: "Not authenticated",
    403: "Not authorized",
    404: "Not found",
    405: "Method not allowed",
    409: "Conflict",
    422: "Unprocessable entity",
    429: "Too many requests",
    500: "Internal server error",
    502: "Bad gateway",
    503: "Service unavailable",
  };

  return messages[status] || "An error occurred";
}

// ============================================================================
// Not Found Handler
// ============================================================================

/**
 * Handler for 404 Not Found responses
 */
export const notFoundHandler = (c: Context) => {
  return c.json(
    {
      error: "Not found",
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
};
