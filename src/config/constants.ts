export const APP_NAME = "smtp-api";
export const API_VERSION = "v1";
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_RECIPIENTS_PER_EMAIL = 50;
export const MAX_EMAIL_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export const EMAIL_STATUSES = [
    "queued",
    "sending",
    "sent",
    "delivered",
    "failed",
    "bounced",
    "cancelled",
] as const;

export type EmailStatus = (typeof EMAIL_STATUSES)[number];
