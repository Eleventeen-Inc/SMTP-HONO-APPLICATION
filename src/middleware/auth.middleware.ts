import type { Context, Next } from "hono";
import auth from "../lib/auth.js";
import { error } from "../utils/response.js";

/**
 * Middleware: Require a valid API key in the Authorization header.
 * Used for all /api/v1/* endpoints.
 *
 * Reads: Authorization: Bearer <api-key>
 * Sets on context: userId, organizationId, apiKeyId
 */
export async function requireApiKey(c: Context, next: Next) {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return error(
            c,
            "Missing or invalid Authorization header. Use: Bearer <api-key>",
            401,
            "UNAUTHORIZED"
        );
    }

    const key = authHeader.slice(7).trim();

    if (!key) {
        return error(c, "API key is empty", 401, "UNAUTHORIZED");
    }

    try {
        // Use Better Auth's server-side API key verification
        const result = await auth.api.verifyApiKey({
            body: { key },
        });

        if (!result.valid || result.error) {
            return error(
                c,
                result.error?.message || "Invalid API key",
                401,
                "INVALID_API_KEY"
            );
        }

        if (!result.key) {
            return error(c, "API key not found", 401, "INVALID_API_KEY");
        }

        // Set auth context on the Hono context for downstream handlers
        c.set("userId", result.key.userId);
        c.set("apiKeyId", result.key.id);

        // Organization ID can come from the X-Organization-Id header
        // or we'll resolve it in the org-context middleware
        const orgHeader = c.req.header("X-Organization-Id");
        if (orgHeader) {
            c.set("organizationId", orgHeader);
        }

        await next();
    } catch (err: any) {
        console.error("[auth-middleware] API key verification failed:", err);
        return error(c, "Authentication failed", 401, "AUTH_FAILED");
    }
}

/**
 * Middleware: Require a valid session (cookie-based).
 * Used for dashboard/management endpoints like API key creation.
 *
 * Sets on context: userId, session
 */
export async function requireSession(c: Context, next: Next) {
    try {
        const session = await auth.api.getSession({
            headers: c.req.raw.headers,
        });

        if (!session || !session.user) {
            return error(
                c,
                "Authentication required. Please sign in.",
                401,
                "UNAUTHORIZED"
            );
        }

        c.set("userId", session.user.id);
        c.set("session", session);

        await next();
    } catch (err: any) {
        console.error("[auth-middleware] Session verification failed:", err);
        return error(c, "Authentication failed", 401, "AUTH_FAILED");
    }
}
