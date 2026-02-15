import { env } from "./env.js";

/**
 * Redis connection configuration for BullMQ.
 * Used by both the queue producer and worker consumer.
 */
export const redisConnection = {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
};
