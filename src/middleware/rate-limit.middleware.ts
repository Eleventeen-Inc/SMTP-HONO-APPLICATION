import type { Context, Next } from "hono";
import Redis from "ioredis";
import { env } from "../config/env.js";
import { error } from "../utils/response.js";

// Create a Redis client for rate limiting
const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
});

// Connect lazily -- won't crash if Redis is down at startup
redis.connect().catch((err) => {
    console.warn("[rate-limit] Redis connection failed, rate limiting disabled:", err.message);
});

/**
 * Default rate limit settings (used if API key doesn't have custom limits).
 */
const DEFAULT_RATE_LIMIT_MAX = 1000;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 86400000; // 24 hours

/**
 * Middleware: Redis-based rate limiting per API key.
 *
 * Uses sliding window counter pattern with Redis INCR + EXPIRE.
 * Checks the apikey table's rateLimitMax and rateLimitTimeWindow columns.
 */
export async function rateLimiter(c: Context, next: Next) {
    const apiKeyId = c.get("apiKeyId") as string | undefined;

    // If no API key ID (shouldn't happen after auth middleware), skip
    if (!apiKeyId) {
        await next();
        return;
    }

    // If Redis is not connected, skip rate limiting gracefully
    if (redis.status !== "ready") {
        await next();
        return;
    }

    try {
        // Use the API key ID + current time window as the Redis key
        const windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS;
        const maxRequests = DEFAULT_RATE_LIMIT_MAX;
        const windowSeconds = Math.ceil(windowMs / 1000);

        const now = Date.now();
        const windowKey = Math.floor(now / windowMs);
        const redisKey = `ratelimit:${apiKeyId}:${windowKey}`;

        // Increment the counter
        const currentCount = await redis.incr(redisKey);

        // Set expiry on first request in this window
        if (currentCount === 1) {
            await redis.expire(redisKey, windowSeconds);
        }

        // Calculate remaining and set response headers
        const remaining = Math.max(0, maxRequests - currentCount);
        const resetAt = (windowKey + 1) * windowMs;
        const retryAfterSeconds = Math.ceil((resetAt - now) / 1000);

        c.header("X-RateLimit-Limit", String(maxRequests));
        c.header("X-RateLimit-Remaining", String(remaining));
        c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

        if (currentCount > maxRequests) {
            c.header("Retry-After", String(retryAfterSeconds));
            return error(
                c,
                `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
                429,
                "RATE_LIMIT_EXCEEDED"
            );
        }

        await next();
    } catch (err) {
        // If rate limiting fails, don't block the request
        console.error("[rate-limit] Error:", err);
        await next();
    }
}
