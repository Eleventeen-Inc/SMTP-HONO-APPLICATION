import db from "../db/index.js";
import { logs } from "../db/schema.js";
import { generateId } from "../utils/id.js";

export interface LogActionParams {
    organizationId?: string;
    userId?: string;
    apiKeyId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    method?: string;
    path?: string;
    statusCode?: number;
    details?: string;
    error?: string;
    duration?: number;
}

/**
 * Insert an audit log entry into the logs table.
 * This runs asynchronously and should not block the response.
 */
export async function logAction(params: LogActionParams): Promise<void> {
    try {
        await db.insert(logs).values({
            id: generateId("log"),
            organizationId: params.organizationId || null,
            userId: params.userId || null,
            apiKeyId: params.apiKeyId || null,
            action: params.action,
            resourceType: params.resourceType || null,
            resourceId: params.resourceId || null,
            ipAddress: params.ipAddress || null,
            userAgent: params.userAgent || null,
            method: params.method || null,
            path: params.path || null,
            statusCode: params.statusCode || null,
            details: params.details || null,
            error: params.error || null,
            duration: params.duration || null,
            createdAt: new Date(),
        });
    } catch (err) {
        // Logging should never crash the app -- just print to console
        console.error("Failed to write audit log:", err);
    }
}
