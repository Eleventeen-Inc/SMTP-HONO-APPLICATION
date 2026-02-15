import { z } from "zod";

/**
 * Validation schema for creating a new API key.
 */
export const createApiKeySchema = z.object({
    name: z
        .string()
        .min(1, "API key name is required")
        .max(100, "API key name too long"),
    expiresIn: z
        .number()
        .int()
        .positive("expiresIn must be a positive number (seconds)")
        .optional(),
    rateLimitMax: z.coerce
        .number()
        .int()
        .min(1, "Rate limit max must be at least 1")
        .max(10000, "Rate limit max cannot exceed 10000")
        .default(1000),
    rateLimitTimeWindow: z.coerce
        .number()
        .int()
        .min(1000, "Rate limit window must be at least 1000ms (1 second)")
        .default(86400000), // 24 hours in ms
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
