import type { Context } from "hono";
import { AppError } from "./errors.js";

/**
 * Standard success response.
 */
export function success<T>(c: Context, data: T, status: 200 | 201 = 200) {
    return c.json({ success: true as const, data }, status);
}

/**
 * Standard error response.
 */
export function error(
    c: Context,
    message: string,
    status: number = 500,
    code: string = "INTERNAL_ERROR"
) {
    return c.json(
        {
            success: false as const,
            error: { message, code },
        },
        status as any
    );
}

/**
 * Standard paginated response.
 */
export function paginated<T>(
    c: Context,
    data: T[],
    total: number,
    page: number,
    pageSize: number
) {
    return c.json({
        success: true as const,
        data,
        pagination: {
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
            hasMore: page * pageSize < total,
        },
    });
}

/**
 * Handle errors thrown by services/controllers and return the appropriate response.
 */
export function handleError(c: Context, err: unknown) {
    if (err instanceof AppError) {
        return error(c, err.message, err.statusCode, err.code);
    }

    console.error("Unhandled error:", err);
    return error(c, "Internal server error", 500, "INTERNAL_ERROR");
}
