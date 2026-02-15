import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';

export const mailQueue = new Queue('mail-queue', {
    connection: redisConnection
});