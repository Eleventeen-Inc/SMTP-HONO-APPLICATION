import { z } from "zod";
import { MAX_RECIPIENTS_PER_EMAIL, EMAIL_STATUSES } from "../config/constants.js";

/**
 * Validation schema for sending an email.
 * Matches the Resend-style API payload.
 */
export const sendEmailSchema = z
    .object({
        from: z.string().email("Invalid 'from' email address"),
        to: z.union([
            z.string().email("Invalid 'to' email address"),
            z
                .array(z.string().email("Invalid email in 'to' array"))
                .min(1, "At least one recipient is required")
                .max(MAX_RECIPIENTS_PER_EMAIL, `Maximum ${MAX_RECIPIENTS_PER_EMAIL} recipients allowed`),
        ]),
        subject: z
            .string()
            .min(1, "Subject is required")
            .max(998, "Subject too long (max 998 characters)"),
        html: z.string().optional(),
        text: z.string().optional(),
        replyTo: z.string().email("Invalid 'replyTo' email address").optional(),
        cc: z
            .union([
                z.string().email("Invalid email in 'cc'"),
                z.array(z.string().email("Invalid email in 'cc' array")),
            ])
            .optional(),
        bcc: z
            .union([
                z.string().email("Invalid email in 'bcc'"),
                z.array(z.string().email("Invalid email in 'bcc' array")),
            ])
            .optional(),
        scheduledAt: z.string().datetime("Invalid ISO 8601 datetime").optional(),
        headers: z.record(z.string(), z.string()).optional(),
        tags: z
            .array(
                z.object({
                    name: z.string().min(1).max(100),
                    value: z.string().min(1).max(500),
                })
            )
            .max(10, "Maximum 10 tags allowed")
            .optional(),
    })
    .refine((data) => data.html || data.text, {
        message: "Either 'html' or 'text' must be provided",
    });

export type SendEmailInput = z.infer<typeof sendEmailSchema>;

/**
 * Validation schema for listing emails (query parameters).
 */
export const listEmailsSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(20),
    status: z.enum(EMAIL_STATUSES).optional(),
});

export type ListEmailsInput = z.infer<typeof listEmailsSchema>;
