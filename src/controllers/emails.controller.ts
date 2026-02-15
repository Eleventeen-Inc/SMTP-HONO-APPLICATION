import type { Context } from "hono";
import { sendEmailSchema, listEmailsSchema } from "../validations/emails.validator.js";
import * as emailService from "../services/email.service.js";
import { success, paginated, handleError } from "../utils/response.js";

export const emailsController = {
    /**
     * POST /api/v1/emails
     * Send an email.
     */
    send: async (c: Context) => {
        try {
            const body = await c.req.json();
            const validated = sendEmailSchema.parse(body);

            const orgId = c.get("organizationId") as string;
            const userId = c.get("userId") as string;

            const result = await emailService.sendEmail(orgId, userId, validated as any);

            return success(c, result, 201);
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
     * GET /api/v1/emails
     * List sent emails with pagination.
     */
    list: async (c: Context) => {
        try {
            const query = c.req.query();
            const validated = listEmailsSchema.parse(query);

            const orgId = c.get("organizationId") as string;

            const result = await emailService.listEmails(orgId, validated);

            return paginated(c, result.data, result.total, result.page, result.pageSize);
        } catch (err: any) {
            if (err.name === "ZodError") {
                return c.json(
                    {
                        success: false,
                        error: {
                            message: "Invalid query parameters",
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
     * GET /api/v1/emails/:id
     * Get a single email by ID.
     */
    getOne: async (c: Context) => {
        try {
            const emailId = c.req.param("id");
            const orgId = c.get("organizationId") as string;

            const result = await emailService.getEmail(orgId, emailId);

            return success(c, result);
        } catch (err) {
            return handleError(c, err);
        }
    },

    /**
     * PATCH /api/v1/emails/:id/cancel
     * Cancel a queued email.
     */
    cancel: async (c: Context) => {
        try {
            const emailId = c.req.param("id");
            const orgId = c.get("organizationId") as string;

            const result = await emailService.cancelEmail(orgId, emailId);

            return success(c, result);
        } catch (err) {
            return handleError(c, err);
        }
    },
};
