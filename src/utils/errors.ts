/**
 * Base application error class.
 * All custom errors extend this.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;

    constructor(message: string, statusCode: number, code: string) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
    }
}

/**
 * 400 - Bad Request / Validation Error
 */
export class ValidationError extends AppError {
    public readonly details?: unknown;

    constructor(message: string, details?: unknown) {
        super(message, 400, "VALIDATION_ERROR");
        this.details = details;
    }
}

/**
 * 401 - Unauthorized (missing or invalid credentials)
 */
export class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super(message, 401, "UNAUTHORIZED");
    }
}

/**
 * 403 - Forbidden (authenticated but not allowed)
 */
export class ForbiddenError extends AppError {
    constructor(message = "Forbidden") {
        super(message, 403, "FORBIDDEN");
    }
}

/**
 * 404 - Resource Not Found
 */
export class NotFoundError extends AppError {
    constructor(resource = "Resource") {
        super(`${resource} not found`, 404, "NOT_FOUND");
    }
}

/**
 * 409 - Conflict (duplicate resource)
 */
export class ConflictError extends AppError {
    constructor(message = "Resource already exists") {
        super(message, 409, "CONFLICT");
    }
}

/**
 * 402 - Insufficient Credits
 */
export class InsufficientCreditsError extends AppError {
    constructor(message = "Insufficient credits to perform this action") {
        super(message, 402, "INSUFFICIENT_CREDITS");
    }
}

/**
 * 429 - Rate Limit Exceeded
 */
export class RateLimitError extends AppError {
    public readonly retryAfter: number;

    constructor(retryAfter: number) {
        super("Rate limit exceeded", 429, "RATE_LIMIT_EXCEEDED");
        this.retryAfter = retryAfter;
    }
}
