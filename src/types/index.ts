import type { EmailStatus } from "../config/constants.js";

/**
 * Authenticated user context set by auth middleware.
 */
export interface AuthContext {
    userId: string;
    organizationId: string;
    apiKeyId?: string;
}

/**
 * Pagination parameters from query string.
 */
export interface PaginationParams {
    page: number;
    pageSize: number;
}

/**
 * Standard API success response shape.
 */
export interface ApiResponse<T> {
    success: true;
    data: T;
}

/**
 * Standard API error response shape.
 */
export interface ApiErrorResponse {
    success: false;
    error: {
        message: string;
        code: string;
    };
}

/**
 * Data shape for a job in the BullMQ mail queue.
 */
export interface EmailJobData {
    emailSentId: string;
    from: string;
    to: string[];
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string;
    cc?: string[];
    bcc?: string[];
    headers?: Record<string, string>;
}

/**
 * Payload for the sendEmail service function.
 */
export interface SendEmailPayload {
    from: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string;
    cc?: string | string[];
    bcc?: string | string[];
    scheduledAt?: string;
    headers?: Record<string, string>;
    tags?: Array<{ name: string; value: string }>;
}

/**
 * Filters for listing emails.
 */
export interface ListEmailsParams extends PaginationParams {
    status?: EmailStatus;
}
