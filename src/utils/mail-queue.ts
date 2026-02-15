import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';

export const mailQueue = new Queue('mail-queue', {
    connection: redisConnection
});