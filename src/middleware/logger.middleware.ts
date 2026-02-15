import type { Context, Next } from "hono";
import { logAction } from "../services/log.service.js";

/**
 * Middleware: Log every API request to the logs table.
 * Runs asynchronously after the response is sent (non-blocking).
 */
export async function requestLogger(c: Context, next: Next) {
    const startTime = Date.now();

    // Continue with the request
    await next();

    // Log asynchronously -- don't block the response
    const duration = Date.now() - startTime;

    // Fire and forget -- we don't await this
    logAction({
        organizationId: c.get("organizationId") as string | undefined,
        userId: c.get("userId") as string | undefined,
        apiKeyId: c.get("apiKeyId") as string | undefined,
        action: "api_request",
        method: c.req.method,
        path: c.req.path,
        statusCode: c.res.status,
        ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
        userAgent: c.req.header("user-agent") || "unknown",
        duration,
    }).catch(() => {
        // Silently ignore logging errors
    });
}
