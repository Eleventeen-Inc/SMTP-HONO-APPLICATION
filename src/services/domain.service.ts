import { eq, and } from "drizzle-orm";
import db from "../db/index.js";
import { domain, dnsRecord } from "../db/schema.js";
import { generateId } from "../utils/id.js";
import { NotFoundError, ConflictError, ForbiddenError } from "../utils/errors.js";
import { verifyAllRecords } from "./dns-verify.service.js";
import {
    addDomainToSmtp,
    removeDomainFromSmtp,
    getDkimPublicKey,
    parseDkimPublicKey,
} from "./smtp-manager.service.js";
import { env } from "../config/env.js";

/**
 * Add a new custom domain for an organization.
 * Creates the domain record and generates the required DNS records
 * the user must add to their DNS provider.
 */
export async function addDomain(orgId: string, domainName: string) {
    // Normalize domain name
    const normalizedDomain = domainName.toLowerCase().trim();

    // Check if domain is the shared domain (not allowed)
    if (normalizedDomain === env.SHARED_DOMAIN) {
        throw new ForbiddenError("Cannot add the shared domain as a custom domain");
    }

    // Check if domain already exists
    const existing = await db
        .select()
        .from(domain)
        .where(eq(domain.name, normalizedDomain))
        .limit(1);

    if (existing.length > 0) {
        throw new ConflictError(`Domain "${normalizedDomain}" is already registered`);
    }

    // Create the domain record
    const domainId = generateId("dom");
    const now = new Date();

    await db.insert(domain).values({
        id: domainId,
        organizationId: orgId,
        name: normalizedDomain,
        region: "eu-north-1",
        dkimSelector: "default",
        verified: false,
        createdAt: now,
        updatedAt: now,
    });

    // Add domain to the SMTP server (generates DKIM key)
    try {
        await addDomainToSmtp(normalizedDomain);
    } catch (err) {
        console.error(`[domain-service] Failed to add domain to SMTP server:`, err);
        // Domain is created in DB but SMTP setup failed -- mark for retry
    }

    // Get the DKIM public key that was generated
    let dkimValue = "";
    try {
        const rawDkim = await getDkimPublicKey(normalizedDomain);
        dkimValue = parseDkimPublicKey(rawDkim);
    } catch {
        dkimValue = "DKIM key will be available after SMTP server processes the domain";
    }

    // Generate the DNS records the user needs to configure
    const mailHostname = env.SMTP_HOST === "localhost"
        ? `mail.${env.SHARED_DOMAIN}`
        : env.SMTP_HOST;

    const dnsRecords = [
        {
            id: generateId("dns"),
            domainId,
            type: "MX",
            name: "@",
            value: mailHostname,
            ttl: 3600,
            priority: 10,
            verified: false,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: generateId("dns"),
            domainId,
            type: "TXT",
            name: "@",
            value: `v=spf1 mx a:${mailHostname} ~all`,
            ttl: 3600,
            priority: null,
            verified: false,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: generateId("dns"),
            domainId,
            type: "TXT",
            name: "default._domainkey",
            value: dkimValue || "pending",
            ttl: 3600,
            priority: null,
            verified: false,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: generateId("dns"),
            domainId,
            type: "TXT",
            name: "_dmarc",
            value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${normalizedDomain}`,
            ttl: 3600,
            priority: null,
            verified: false,
            createdAt: now,
            updatedAt: now,
        },
    ];

    // Insert all DNS records
    for (const record of dnsRecords) {
        await db.insert(dnsRecord).values(record);
    }

    // Fetch and return the complete domain with DNS records
    return getDomain(orgId, domainId);
}

/**
 * Get a domain by ID with its DNS records.
 * Scoped to organization.
 */
export async function getDomain(orgId: string, domainId: string) {
    const domains = await db
        .select()
        .from(domain)
        .where(and(eq(domain.id, domainId), eq(domain.organizationId, orgId)))
        .limit(1);

    if (domains.length === 0) {
        throw new NotFoundError("Domain");
    }

    const domainRow = domains[0]!;

    const records = await db
        .select()
        .from(dnsRecord)
        .where(eq(dnsRecord.domainId, domainId));

    return {
        ...domainRow,
        dnsRecords: records,
    };
}

/**
 * List all domains for an organization.
 */
export async function listDomains(orgId: string) {
    const domains = await db
        .select()
        .from(domain)
        .where(eq(domain.organizationId, orgId));

    return domains;
}

/**
 * Delete a domain and its DNS records.
 * Also removes it from the SMTP server.
 */
export async function deleteDomain(orgId: string, domainId: string) {
    const domains = await db
        .select()
        .from(domain)
        .where(and(eq(domain.id, domainId), eq(domain.organizationId, orgId)))
        .limit(1);

    if (domains.length === 0) {
        throw new NotFoundError("Domain");
    }

    const domainRow = domains[0]!;

    // Remove from SMTP server
    try {
        await removeDomainFromSmtp(domainRow.name);
    } catch (err) {
        console.error(`[domain-service] Failed to remove domain from SMTP:`, err);
    }

    // Delete DNS records first (foreign key)
    await db.delete(dnsRecord).where(eq(dnsRecord.domainId, domainId));

    // Delete the domain
    await db.delete(domain).where(eq(domain.id, domainId));

    return { deleted: true, domain: domainRow.name };
}

/**
 * Trigger DNS verification for a domain.
 * Checks all DNS records and updates their verified status.
 */
export async function verifyDomain(orgId: string, domainId: string) {
    // Ensure domain belongs to org
    const domains = await db
        .select()
        .from(domain)
        .where(and(eq(domain.id, domainId), eq(domain.organizationId, orgId)))
        .limit(1);

    if (domains.length === 0) {
        throw new NotFoundError("Domain");
    }

    // Run DNS verification
    const result = await verifyAllRecords(domainId);

    // If all verified, also try to update the DKIM key in DNS records
    // (in case it was "pending" during domain creation)
    if (!result.allVerified) {
        const domainRow = domains[0]!;
        try {
            const rawDkim = await getDkimPublicKey(domainRow.name);
            const dkimValue = parseDkimPublicKey(rawDkim);
            if (dkimValue) {
                // Update the DKIM DNS record value if it was "pending"
                const dkimRecords = await db
                    .select()
                    .from(dnsRecord)
                    .where(
                        and(
                            eq(dnsRecord.domainId, domainId),
                            eq(dnsRecord.name, "default._domainkey")
                        )
                    )
                    .limit(1);

                if (dkimRecords.length > 0 && dkimRecords[0]!.value === "pending") {
                    await db
                        .update(dnsRecord)
                        .set({ value: dkimValue, updatedAt: new Date() })
                        .where(eq(dnsRecord.id, dkimRecords[0]!.id));
                }
            }
        } catch {
            // DKIM key not ready yet
        }
    }

    // Return the updated domain with DNS records
    return getDomain(orgId, domainId);
}
