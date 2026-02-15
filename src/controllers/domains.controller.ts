import type { Context } from "hono";
import { addDomainSchema } from "../validations/domains.validator.js";
import * as domainService from "../services/domain.service.js";
import { success, handleError } from "../utils/response.js";

export const domainsController = {
    /**
     * POST /api/v1/domains
     * Add a custom domain.
     */
    add: async (c: Context) => {
        try {
            const body = await c.req.json();
            const validated = addDomainSchema.parse(body);

            const orgId = c.get("organizationId") as string;

            const result = await domainService.addDomain(orgId, validated.name);

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
     * GET /api/v1/domains
     * List all domains for the organization.
     */
    list: async (c: Context) => {
        try {
            const orgId = c.get("organizationId") as string;

            const result = await domainService.listDomains(orgId);

            return success(c, result);
        } catch (err) {
            return handleError(c, err);
        }
    },

    /**
     * GET /api/v1/domains/:id
     * Get a single domain with its DNS records.
     */
    getOne: async (c: Context) => {
        try {
            const domainId = c.req.param("id");
            const orgId = c.get("organizationId") as string;

            const result = await domainService.getDomain(orgId, domainId);

            return success(c, result);
        } catch (err) {
            return handleError(c, err);
        }
    },

    /**
     * DELETE /api/v1/domains/:id
     * Remove a domain.
     */
    remove: async (c: Context) => {
        try {
            const domainId = c.req.param("id");
            const orgId = c.get("organizationId") as string;

            const result = await domainService.deleteDomain(orgId, domainId);

            return success(c, result);
        } catch (err) {
            return handleError(c, err);
        }
    },

    /**
     * POST /api/v1/domains/:id/verify
     * Trigger DNS verification for a domain.
     */
    verify: async (c: Context) => {
        try {
            const domainId = c.req.param("id");
            const orgId = c.get("organizationId") as string;

            const result = await domainService.verifyDomain(orgId, domainId);

            return success(c, result);
        } catch (err) {
            return handleError(c, err);
        }
    },
};
