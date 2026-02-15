import type { Context, Next } from "hono";
import { eq, and } from "drizzle-orm";
import db from "../db/index.js";
import { member, organization } from "../db/schema.js";
import { error } from "../utils/response.js";

/**
 * Middleware: Resolve and validate the organization context.
 *
 * After authentication, this middleware determines which organization
 * the request is operating on:
 *
 * 1. Check X-Organization-Id header (explicit selection)
 * 2. Fall back to the user's first organization membership
 *
 * Verifies the user is a member of the organization.
 * Sets c.set("organizationId", orgId) for downstream handlers.
 */
export async function orgContext(c: Context, next: Next) {
    const userId = c.get("userId") as string | undefined;

    if (!userId) {
        return error(c, "Authentication required", 401, "UNAUTHORIZED");
    }

    // Check if org ID was already set (e.g., from X-Organization-Id header in auth middleware)
    let orgId = c.get("organizationId") as string | undefined;

    if (orgId) {
        // Validate that the user is a member of this org
        const membership = await db
            .select()
            .from(member)
            .where(
                and(
                    eq(member.userId, userId),
                    eq(member.organizationId, orgId)
                )
            )
            .limit(1);

        if (membership.length === 0) {
            return error(
                c,
                "You are not a member of this organization",
                403,
                "FORBIDDEN"
            );
        }

        c.set("organizationId", orgId);
        c.set("memberRole", membership[0]!.role);
    } else {
        // Fall back to the user's first org membership
        const memberships = await db
            .select()
            .from(member)
            .where(eq(member.userId, userId))
            .limit(1);

        if (memberships.length === 0) {
            return error(
                c,
                "No organization found. Create an organization first via the auth API.",
                403,
                "NO_ORGANIZATION"
            );
        }

        orgId = memberships[0]!.organizationId;
        c.set("organizationId", orgId);
        c.set("memberRole", memberships[0]!.role);
    }

    await next();
}
