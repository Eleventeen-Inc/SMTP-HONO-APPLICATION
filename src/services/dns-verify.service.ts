import dns from "node:dns";
import { eq, and } from "drizzle-orm";
import db from "../db/index.js";
import { dnsRecord, domain } from "../db/schema.js";

const resolver = new dns.promises.Resolver();
// Use Google and Cloudflare DNS for reliable lookups
resolver.setServers(["8.8.8.8", "1.1.1.1"]);

/**
 * Verify an MX record exists for a domain with the expected value.
 */
export async function verifyMxRecord(
    domainName: string,
    expectedValue: string
): Promise<boolean> {
    try {
        const records = await resolver.resolveMx(domainName);
        return records.some(
            (r) =>
                r.exchange.toLowerCase() === expectedValue.toLowerCase() ||
                r.exchange.toLowerCase() === `${expectedValue.toLowerCase()}.`
        );
    } catch {
        return false;
    }
}

/**
 * Verify a TXT record exists for a domain containing the expected value.
 * Used for SPF and DMARC verification.
 */
export async function verifyTxtRecord(
    name: string,
    expectedValue: string
): Promise<boolean> {
    try {
        const records = await resolver.resolveTxt(name);
        // TXT records are arrays of strings that get joined
        return records.some((r) => {
            const joined = r.join("");
            return joined.includes(expectedValue);
        });
    } catch {
        return false;
    }
}

/**
 * Verify a DKIM record exists for a domain.
 * Checks selector._domainkey.domain TXT record.
 */
export async function verifyDkimRecord(
    selector: string,
    domainName: string
): Promise<boolean> {
    try {
        const dkimDomain = `${selector}._domainkey.${domainName}`;
        const records = await resolver.resolveTxt(dkimDomain);
        // DKIM record should contain "v=DKIM1"
        return records.some((r) => {
            const joined = r.join("");
            return joined.includes("v=DKIM1");
        });
    } catch {
        return false;
    }
}

/**
 * Verify all DNS records for a domain.
 * Updates each dns_record row's verified flag.
 * If ALL required records pass, sets domain.verified = true.
 * Returns a summary of results.
 */
export async function verifyAllRecords(
    domainId: string
): Promise<{ allVerified: boolean; results: Array<{ id: string; type: string; name: string; verified: boolean }> }> {
    // Fetch all DNS records for this domain
    const records = await db
        .select()
        .from(dnsRecord)
        .where(eq(dnsRecord.domainId, domainId));

    // Fetch the domain itself
    const domains = await db
        .select()
        .from(domain)
        .where(eq(domain.id, domainId))
        .limit(1);

    if (domains.length === 0) {
        return { allVerified: false, results: [] };
    }

    const domainRow = domains[0]!;
    const results: Array<{ id: string; type: string; name: string; verified: boolean }> = [];

    for (const record of records) {
        let verified = false;

        switch (record.type) {
            case "MX":
                verified = await verifyMxRecord(domainRow.name, record.value);
                break;
            case "TXT": {
                // Determine which name to query based on the record name
                let queryName: string;
                if (record.name === "@" || record.name === domainRow.name) {
                    queryName = domainRow.name;
                } else if (record.name.startsWith("_")) {
                    // e.g., _dmarc -> _dmarc.domain.com
                    queryName = `${record.name}.${domainRow.name}`;
                } else if (record.name.includes("._domainkey")) {
                    // DKIM record
                    queryName = `${record.name}.${domainRow.name}`;
                    verified = await verifyDkimRecord(
                        record.name.split("._domainkey")[0]!,
                        domainRow.name
                    );
                    break;
                } else {
                    queryName = `${record.name}.${domainRow.name}`;
                }
                verified = await verifyTxtRecord(queryName, record.value);
                break;
            }
            case "CNAME": {
                try {
                    const cnames = await resolver.resolveCname(
                        `${record.name}.${domainRow.name}`
                    );
                    verified = cnames.some(
                        (c) => c.toLowerCase() === record.value.toLowerCase()
                    );
                } catch {
                    verified = false;
                }
                break;
            }
            default:
                // For record types we don't verify automatically, skip
                verified = false;
                break;
        }

        // Update the record's verified status
        await db
            .update(dnsRecord)
            .set({ verified, lastCheckedAt: new Date(), updatedAt: new Date() })
            .where(eq(dnsRecord.id, record.id));

        results.push({
            id: record.id,
            type: record.type,
            name: record.name,
            verified,
        });
    }

    // Domain is verified if ALL records are verified
    const allVerified = results.length > 0 && results.every((r) => r.verified);

    await db
        .update(domain)
        .set({ verified: allVerified, updatedAt: new Date() })
        .where(eq(domain.id, domainId));

    return { allVerified, results };
}
