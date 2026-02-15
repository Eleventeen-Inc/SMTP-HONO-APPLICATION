import { execSync } from "node:child_process";
import { env } from "../config/env.js";

const CONTAINER = env.SMTP_CONTAINER_NAME;

/**
 * Execute a command inside the SMTP server Docker container.
 * Wraps docker exec with error handling.
 */
function dockerExec(command: string): string {
    try {
        const result = execSync(`docker exec ${CONTAINER} bash -c '${command}'`, {
            encoding: "utf-8",
            timeout: 30000, // 30 second timeout
        });
        return result.trim();
    } catch (err: any) {
        console.error(`[smtp-manager] docker exec failed: ${command}`, err.message);
        throw new Error(`SMTP server command failed: ${err.message}`);
    }
}

/**
 * Add a domain to the SMTP server (Postfix + OpenDKIM).
 * This adds the domain to virtual_domains, generates DKIM keys,
 * and reloads all relevant services.
 */
export async function addDomainToSmtp(domainName: string): Promise<void> {
    // 1. Add to Postfix virtual_domains
    dockerExec(
        `echo "${domainName} OK" >> /etc/postfix/virtual_domains && postmap /etc/postfix/virtual_domains`
    );

    // 2. Create mail directory
    dockerExec(
        `mkdir -p /var/mail/vhosts/${domainName} && chown -R vmail:vmail /var/mail/vhosts/${domainName}`
    );

    // 3. Add to OpenDKIM TrustedHosts
    dockerExec(
        `echo "${domainName}" >> /etc/opendkim/TrustedHosts && echo "*.${domainName}" >> /etc/opendkim/TrustedHosts`
    );

    // 4. Add to OpenDKIM KeyTable
    dockerExec(
        `echo "default._domainkey.${domainName} ${domainName}:default:/etc/opendkim/keys/${domainName}/default.private" >> /etc/opendkim/KeyTable`
    );

    // 5. Add to OpenDKIM SigningTable
    dockerExec(
        `echo "*@${domainName} default._domainkey.${domainName}" >> /etc/opendkim/SigningTable`
    );

    // 6. Generate DKIM key
    dockerExec(
        `mkdir -p /etc/opendkim/keys/${domainName} && ` +
        `opendkim-genkey -b 2048 -s default -d ${domainName} -D /etc/opendkim/keys/${domainName}/ && ` +
        `chown -R opendkim:opendkim /etc/opendkim/keys/${domainName} && ` +
        `chmod 600 /etc/opendkim/keys/${domainName}/default.private`
    );

    // 7. Reload services
    reloadPostfix();
    reloadDkim();
}

/**
 * Remove a domain from the SMTP server.
 */
export async function removeDomainFromSmtp(domainName: string): Promise<void> {
    // Remove from virtual_domains
    dockerExec(
        `sed -i '/^${domainName} /d' /etc/postfix/virtual_domains && postmap /etc/postfix/virtual_domains`
    );

    // Remove from TrustedHosts
    dockerExec(
        `sed -i '/^${domainName}$/d' /etc/opendkim/TrustedHosts && ` +
        `sed -i '/^\\*.${domainName}$/d' /etc/opendkim/TrustedHosts`
    );

    // Remove from KeyTable
    dockerExec(
        `sed -i '/default._domainkey.${domainName}/d' /etc/opendkim/KeyTable`
    );

    // Remove from SigningTable
    dockerExec(
        `sed -i '/*@${domainName}/d' /etc/opendkim/SigningTable`
    );

    // Remove DKIM keys directory
    dockerExec(`rm -rf /etc/opendkim/keys/${domainName}`);

    // Remove mail directory (optional - keep if you want to preserve emails)
    // dockerExec(`rm -rf /var/mail/vhosts/${domainName}`);

    // Reload services
    reloadPostfix();
    reloadDkim();
}

/**
 * Get the DKIM public key for a domain from the SMTP server.
 * Returns the raw content of the DKIM TXT record.
 */
export async function getDkimPublicKey(domainName: string): Promise<string> {
    try {
        const output = dockerExec(
            `cat /etc/opendkim/keys/${domainName}/default.txt`
        );
        return output;
    } catch {
        return "";
    }
}

/**
 * Parse the DKIM public key value from the default.txt file.
 * Extracts just the p=... value for DNS record insertion.
 */
export function parseDkimPublicKey(rawDkimTxt: string): string {
    // The file looks like:
    // default._domainkey  IN  TXT  ( "v=DKIM1; h=sha256; k=rsa; "
    //     "p=MIIBIjANBgkqh..." )
    // We need to extract everything between the quotes and join them.
    const matches = rawDkimTxt.match(/"([^"]+)"/g);
    if (!matches) return "";

    return matches.map((m) => m.replace(/"/g, "")).join("");
}

/**
 * Reload Postfix configuration.
 */
export function reloadPostfix(): void {
    try {
        execSync(`docker exec ${CONTAINER} postfix reload`, {
            encoding: "utf-8",
            timeout: 10000,
        });
    } catch (err: any) {
        console.error("[smtp-manager] Failed to reload Postfix:", err.message);
    }
}

/**
 * Reload OpenDKIM service.
 */
export function reloadDkim(): void {
    try {
        execSync(`docker exec ${CONTAINER} supervisorctl restart opendkim`, {
            encoding: "utf-8",
            timeout: 10000,
        });
    } catch (err: any) {
        console.error("[smtp-manager] Failed to reload OpenDKIM:", err.message);
    }
}
