import { z } from "zod";

/**
 * Validation schema for adding a custom domain.
 * Domain must be a valid domain name (not a URL, not an email).
 */
export const addDomainSchema = z.object({
    name: z
        .string()
        .min(3, "Domain name too short")
        .max(253, "Domain name too long")
        .regex(
            /^(?!-)[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/,
            "Invalid domain name format (e.g., example.com or sub.example.com)"
        )
        .transform((v) => v.toLowerCase().trim()),
});

export type AddDomainInput = z.infer<typeof addDomainSchema>;
