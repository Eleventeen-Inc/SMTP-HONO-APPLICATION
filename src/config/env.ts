import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
    // App
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    HONO_PORT: z.coerce.number().default(4000),

    // Auth
    BETTER_AUTH_SECRET: z.string().min(16),
    BETTER_AUTH_URL: z.string().url(),
    CLIENT_APP_URL: z.string().url().optional(),

    // Database
    DATABASE_URL: z.string().min(1),

    // Redis
    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.coerce.number().default(6379),

    // SMTP connection to the Postfix server on same VPS
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().min(1),
    SMTP_PASS: z.string().min(1),

    // Shared domain config (free tier like onboarding@resend.dev)
    SHARED_DOMAIN: z.string().min(1),
    SHARED_FROM_EMAIL: z.string().email(),
    SHARED_DAILY_LIMIT: z.coerce.number().default(100),

    // SMTP server management (Docker container name)
    SMTP_CONTAINER_NAME: z.string().default("mailserver"),

    // OAuth (optional in development)
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // Auth advanced settings
    AUTH_TRUSTED_ORIGINS: z.string().optional(),
    AUTH_COOKIE_DOMAIN: z.string().optional(),
    AUTH_SECURE_COOKIES: z.string().default("false"),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
