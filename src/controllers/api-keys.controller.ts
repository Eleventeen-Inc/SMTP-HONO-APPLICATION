import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { createApiKeySchema } from "../validations/api-keys.validator.js";
import auth from "../lib/auth.js";
import db from "../db/index.js";
import { apikey } from "../db/schema.js";
import { success, handleError, error } from "../utils/response.js";

export const apiKeysController = {
    /**
     * POST /api/v1/api-keys
     * Create a new API key. Requires session auth (not API key).
     * Delegates to Better Auth's createApiKey endpoint.
     */
    create: async (c: Context) => {
        try {
            const body = await c.req.json();
            const validated = createApiKeySchema.parse(body);

            // Better Auth's createApiKey uses the session from headers
            const result = await auth.api.createApiKey({
                headers: c.req.raw.headers,
                body: {
                    name: validated.name,
                    expiresIn: validated.expiresIn ?? null,
                    rateLimitMax: validated.rateLimitMax,
                    rateLimitTimeWindow: validated.rateLimitTimeWindow,
                    rateLimitEnabled: true,
                },
            });

            return success(c, {
                id: result.id,
                name: result.name,
                key: result.key, // Full key is only returned on creation
                prefix: result.prefix,
                start: result.start,
                expiresAt: result.expiresAt,
                rateLimitMax: result.rateLimitMax,
                rateLimitTimeWindow: result.rateLimitTimeWindow,
                createdAt: result.createdAt,
            }, 201);
        } catch (err: any) {
            if (err.name === "ZodError") {
                return c.json(
                    {
                        success: false,
                        error: {
                            message: "Validation failed",
                            code: "VALIDATION_ERROR",
                            details: err.errors,
                        },
                    },
                    400
                );
            }
            return handleError(c, err);
        }
    },

    /**
     * GET /api/v1/api-keys
     * List all API keys for the authenticated user.
     * Requires session auth.
     */
    list: async (c: Context) => {
        try {
            const result = await auth.api.listApiKeys({
                headers: c.req.raw.headers,
            });

            // Don't return the full key hash -- just safe fields
            const safeKeys = result.map((k) => ({
                id: k.id,
                name: k.name,
                prefix: k.prefix,
                start: k.start,
                enabled: k.enabled,
                expiresAt: k.expiresAt,
                rateLimitEnabled: k.rateLimitEnabled,
                rateLimitMax: k.rateLimitMax,
                rateLimitTimeWindow: k.rateLimitTimeWindow,
                requestCount: k.requestCount,
                remaining: k.remaining,
                lastRequest: k.lastRequest,
                createdAt: k.createdAt,
                updatedAt: k.updatedAt,
            }));

            return success(c, safeKeys);
        } catch (err) {
            return handleError(c, err);
        }
    },

    /**
     * DELETE /api/v1/api-keys/:id
     * Revoke (delete) an API key. Requires session auth.
     */
    revoke: async (c: Context) => {
        try {
            const keyId = c.req.param("id");

            const result = await auth.api.deleteApiKey({
                headers: c.req.raw.headers,
                body: { keyId },
            });

            return success(c, { deleted: true, id: keyId });
        } catch (err) {
            return handleError(c, err);
        }
    },
};
