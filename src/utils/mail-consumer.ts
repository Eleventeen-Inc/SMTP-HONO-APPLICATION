import { Worker } from "bullmq";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { redisConnection } from "../config/redis.js";
import { env } from "../config/env.js";
import db from "../db/index.js";
import { emailSent } from "../db/schema.js";
import { logAction } from "../services/log.service.js";
import type { EmailJobData } from "../types/index.js";

/**
 * Create a nodemailer transporter connected to the Postfix SMTP server.
 * This connects to localhost:587 (submission port) with STARTTLS.
 */
const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false, // false = STARTTLS on port 587
    auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
    },
    tls: {
        // Allow self-signed certificates (common in dev / Docker setups)
        rejectUnauthorized: env.NODE_ENV === "production",
    },
    // Connection pool for better performance
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
});

/**
 * Verify the SMTP connection on startup.
 */
transporter.verify().then(() => {
    console.log("[mail-worker] SMTP transporter connected and ready");
}).catch((err) => {
    console.error("[mail-worker] SMTP transporter connection failed:", err.message);
    console.error("[mail-worker] Emails will fail until SMTP server is reachable");
});

/**
 * Update the status of an email record in the database.
 */
async function updateEmailStatus(
    emailId: string,
    status: string,
    extra: Record<string, any> = {}
): Promise<void> {
    try {
        await db
            .update(emailSent)
            .set({ status, ...extra })
            .where(eq(emailSent.id, emailId));
    } catch (err) {
        console.error(`[mail-worker] Failed to update email ${emailId} status:`, err);
    }
}

/**
 * BullMQ worker that processes email jobs.
 *
 * For each job:
 * 1. Update emailSent status to "sending"
 * 2. Send via nodemailer to the Postfix SMTP server
 * 3. On success: update status to "sent" with timestamp
 * 4. On failure: update status to "failed" with error message
 *
 * BullMQ handles retry logic (3 attempts, exponential backoff).
 */
export const mailWorker = new Worker<EmailJobData>(
    "mail-queue",
    async (job) => {
        const data = job.data;
        console.log(`[mail-worker] Processing job ${job.id}: ${data.from} -> ${data.to.join(", ")}`);

        // Check if this email was cancelled before processing
        const emailRows = await db
            .select({
                status: emailSent.status,
                organizationId: emailSent.organizationId,
            })
            .from(emailSent)
            .where(eq(emailSent.id, data.emailSentId))
            .limit(1);

        if (emailRows.length > 0 && emailRows[0]!.status === "cancelled") {
            console.log(`[mail-worker] Job ${job.id} skipped: email was cancelled`);
            return { processed: false, reason: "cancelled" };
        }
        const organizationId = emailRows[0]?.organizationId;

        // Update status to "sending"
        await updateEmailStatus(data.emailSentId, "sending");

        try {
            // Send the email via nodemailer -> Postfix
            const info = await transporter.sendMail({
                from: data.from,
                to: data.to.join(", "),
                subject: data.subject,
                html: data.html,
                text: data.text,
                replyTo: data.replyTo,
                cc: data.cc?.join(", "),
                bcc: data.bcc?.join(", "),
                headers: data.headers,
            });

            // Success -- update status
            await updateEmailStatus(data.emailSentId, "sent", {
                providerId: info.messageId || null,
                sentAt: new Date(),
            });
            void logAction({
                organizationId,
                action: "email_sent",
                resourceType: "email",
                resourceId: data.emailSentId,
                details: JSON.stringify({
                    from: data.from,
                    toCount: data.to.length,
                    messageId: info.messageId || null,
                    jobId: job.id,
                }),
            });

            console.log(`[mail-worker] Job ${job.id} sent successfully: messageId=${info.messageId}`);

            return {
                processed: true,
                messageId: info.messageId,
                jobId: job.id,
            };
        } catch (err: any) {
            // Failure -- update status with error
            await updateEmailStatus(data.emailSentId, "failed", {
                error: err.message || "Unknown error",
            });
            void logAction({
                organizationId,
                action: "email_failed",
                resourceType: "email",
                resourceId: data.emailSentId,
                error: err.message || "Unknown error",
                details: JSON.stringify({
                    from: data.from,
                    toCount: data.to.length,
                    jobId: job.id,
                }),
            });

            console.error(`[mail-worker] Job ${job.id} failed:`, err.message);

            // Re-throw to trigger BullMQ retry
            throw err;
        }
    },
    {
        connection: redisConnection,
        // Process up to 5 emails concurrently
        concurrency: 5,
        // Rate limit: max 10 emails per second to avoid overwhelming Postfix
        limiter: {
            max: 10,
            duration: 1000,
        },
        // Remove completed/failed jobs after a while to save Redis memory
        removeOnComplete: {
            age: 86400, // Keep completed jobs for 24 hours
            count: 1000, // Keep max 1000 completed jobs
        },
        removeOnFail: {
            age: 604800, // Keep failed jobs for 7 days
            count: 5000, // Keep max 5000 failed jobs
        },
    }
);

// Event handlers for monitoring
mailWorker.on("completed", (job) => {
    console.log(`[mail-worker] Job ${job.id} completed`);
});

mailWorker.on("failed", (job, err) => {
    console.error(`[mail-worker] Job ${job?.id} failed:`, err.message);
});

mailWorker.on("error", (err) => {
    console.error("[mail-worker] Worker error:", err);
});

console.log("[mail-worker] Mail worker started and listening for jobs");
