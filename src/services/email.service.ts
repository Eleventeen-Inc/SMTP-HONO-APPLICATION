import { eq, and, sql, gte, count } from "drizzle-orm";
import db from "../db/index.js";
import { emailSent, domain, user } from "../db/schema.js";
import { mailQueue } from "../utils/mail-queue.js";
import { generateId } from "../utils/id.js";
import {
    ForbiddenError,
    NotFoundError,
    ValidationError,
} from "../utils/errors.js";
import { checkAndDeduct } from "./credit.service.js";
import { env } from "../config/env.js";
import type { SendEmailPayload, ListEmailsParams, EmailJobData } from "../types/index.js";

/**
 * Normalize recipients to always be an array.
 */
function normalizeRecipients(input: string | string[] | undefined): string[] {
    if (!input) return [];
    return Array.isArray(input) ? input : [input];
}

/**
 * Extract the domain part from an email address.
 */
function extractDomain(email: string): string {
    return email.split("@")[1]!.toLowerCase();
}

/**
 * Send an email. This is the core API function.
 *
 * Shared domain logic:
 *   - If from domain === SHARED_DOMAIN, user can only send to their own verified email
 *   - Daily limit applies on shared domain
 *
 * Custom domain logic:
 *   - from domain must be a verified domain owned by the org
 *   - No recipient restrictions
 */
export async function sendEmail(
    orgId: string,
    userId: string,
    payload: SendEmailPayload
) {
    const toRecipients = normalizeRecipients(payload.to);
    const ccRecipients = normalizeRecipients(payload.cc);
    const bccRecipients = normalizeRecipients(payload.bcc);
    const allRecipients = [...toRecipients, ...ccRecipients, ...bccRecipients];
    const fromDomain = extractDomain(payload.from);

    // === SHARED DOMAIN LOGIC ===
    if (fromDomain === env.SHARED_DOMAIN) {
        // Must use the exact shared from email
        if (payload.from.toLowerCase() !== env.SHARED_FROM_EMAIL.toLowerCase()) {
            throw new ForbiddenError(
                `When using the shared domain, you must send from ${env.SHARED_FROM_EMAIL}`
            );
        }

        // Get user's verified email
        const users = await db
            .select()
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);

        if (users.length === 0) {
            throw new NotFoundError("User");
        }

        const userEmail = users[0]!.email.toLowerCase();

        // All recipients must be the user's own verified email
        for (const recipient of allRecipients) {
            if (recipient.toLowerCase() !== userEmail) {
                throw new ForbiddenError(
                    `Shared domain can only send emails to your own verified email address (${userEmail}). ` +
                    `Add a custom domain to send to other recipients.`
                );
            }
        }

        // Check daily sending limit on shared domain
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayCount = await db
            .select({ count: count() })
            .from(emailSent)
            .where(
                and(
                    eq(emailSent.organizationId, orgId),
                    gte(emailSent.createdAt, todayStart),
                    sql`${emailSent.from} LIKE ${'%@' + env.SHARED_DOMAIN}`
                )
            );

        const sentToday = todayCount[0]?.count ?? 0;
        if (sentToday >= env.SHARED_DAILY_LIMIT) {
            throw new ForbiddenError(
                `Daily limit of ${env.SHARED_DAILY_LIMIT} emails reached for the shared domain. ` +
                `Add a custom domain for higher limits.`
            );
        }
    } else {
        // === CUSTOM DOMAIN LOGIC ===
        // Verify the from domain belongs to this org and is verified
        const domains = await db
            .select()
            .from(domain)
            .where(
                and(
                    eq(domain.organizationId, orgId),
                    eq(domain.name, fromDomain)
                )
            )
            .limit(1);

        if (domains.length === 0) {
            throw new ForbiddenError(
                `Domain "${fromDomain}" is not registered to your organization. Add it first via POST /api/v1/domains.`
            );
        }

        if (!domains[0]!.verified) {
            throw new ForbiddenError(
                `Domain "${fromDomain}" is not verified. Complete DNS verification first via POST /api/v1/domains/${domains[0]!.id}/verify.`
            );
        }
    }

    // Check and deduct credits (1 credit per email)
    const totalRecipients = allRecipients.length;
    const emailId = generateId("email");

    await checkAndDeduct(orgId, totalRecipients, emailId);

    // Create the email record
    const now = new Date();
    await db.insert(emailSent).values({
        id: emailId,
        organizationId: orgId,
        from: payload.from,
        to: toRecipients.join(", "),
        subject: payload.subject,
        body: payload.text || null,
        htmlBody: payload.html || null,
        status: payload.scheduledAt ? "queued" : "queued",
        scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
        metadata: payload.tags ? JSON.stringify(payload.tags) : null,
        createdAt: now,
    });

    // Add job to BullMQ queue
    const jobData: EmailJobData = {
        emailSentId: emailId,
        from: payload.from,
        to: toRecipients,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        replyTo: payload.replyTo,
        cc: ccRecipients.length > 0 ? ccRecipients : undefined,
        bcc: bccRecipients.length > 0 ? bccRecipients : undefined,
        headers: payload.headers,
    };

    // If scheduled, add with a delay
    const jobOptions: any = {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
    };

    if (payload.scheduledAt) {
        const delay = new Date(payload.scheduledAt).getTime() - Date.now();
        if (delay > 0) {
            jobOptions.delay = delay;
        }
    }

    await mailQueue.add("send-email", jobData, jobOptions);

    // Return the created email record
    return {
        id: emailId,
        from: payload.from,
        to: toRecipients,
        subject: payload.subject,
        status: "queued",
        scheduledAt: payload.scheduledAt || null,
        createdAt: now.toISOString(),
    };
}

/**
 * Get a single email by ID, scoped to organization.
 */
export async function getEmail(orgId: string, emailId: string) {
    const rows = await db
        .select()
        .from(emailSent)
        .where(
            and(eq(emailSent.id, emailId), eq(emailSent.organizationId, orgId))
        )
        .limit(1);

    if (rows.length === 0) {
        throw new NotFoundError("Email");
    }

    return rows[0]!;
}

/**
 * List emails with pagination, scoped to organization.
 */
export async function listEmails(orgId: string, params: ListEmailsParams) {
    const { page, pageSize, status } = params;
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [eq(emailSent.organizationId, orgId)];
    if (status) {
        conditions.push(eq(emailSent.status, status));
    }

    const whereClause = and(...conditions);

    // Get total count
    const totalResult = await db
        .select({ count: count() })
        .from(emailSent)
        .where(whereClause);

    const total = totalResult[0]?.count ?? 0;

    // Get paginated results
    const rows = await db
        .select()
        .from(emailSent)
        .where(whereClause)
        .orderBy(sql`${emailSent.createdAt} DESC`)
        .limit(pageSize)
        .offset(offset);

    return { data: rows, total, page, pageSize };
}

/**
 * Cancel a queued email (only if not yet sent).
 */
export async function cancelEmail(orgId: string, emailId: string) {
    const rows = await db
        .select()
        .from(emailSent)
        .where(
            and(eq(emailSent.id, emailId), eq(emailSent.organizationId, orgId))
        )
        .limit(1);

    if (rows.length === 0) {
        throw new NotFoundError("Email");
    }

    const email = rows[0]!;

    if (email.status !== "queued") {
        throw new ValidationError(
            `Cannot cancel email with status "${email.status}". Only queued emails can be cancelled.`
        );
    }

    // Update status to cancelled
    await db
        .update(emailSent)
        .set({ status: "cancelled" })
        .where(eq(emailSent.id, emailId));

    return { id: emailId, status: "cancelled" };
}
