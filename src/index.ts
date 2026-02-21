import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./config/env.js";

// Import routes
import authRoute from "./routes/auth.route.js";
// import emailRoute from "./routes/emails.route.js";
import domainRoute from "./routes/domains.route.js";
import apiKeyRoute from "./routes/api-keys.route.js";

// Import middleware
import { requireApiKey } from "./middleware/auth.middleware.js";
// import { rateLimiter } from "./middleware/rate-limit.middleware.js";
import { requestLogger } from "./middleware/logger.middleware.js";
import { orgContext } from "./middleware/org-context.middleware.js";

// Import and start the mail worker (side-effect import)
// import "./utils/mail-consumer.js";

const app = new Hono();
const envCorsOrigins =
    env.AUTH_TRUSTED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];
const devCorsOrigins =
    env.NODE_ENV === "development" ? ["http://localhost:3000"] : [];
const appOrigin = env.CLIENT_APP_URL ? [env.CLIENT_APP_URL] : [];
const allowedCorsOrigins = new Set([...envCorsOrigins, ...devCorsOrigins, ...appOrigin]);

// ============================================================
// Global Middleware
// ============================================================
app.use(
    "*",
    cors({
        origin: (origin) => {
            if (!origin) return "";
            return allowedCorsOrigins.has(origin) ? origin : "";
        },
        credentials: true,
    })
);

// ============================================================
// Health Check (no auth required)
// ============================================================
app.get("/health", (c) => {
    return c.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
    });
});

// ============================================================
// Auth Routes (session/cookie-based, handled by Better Auth)
// ============================================================
app.route("/", authRoute);

// ============================================================
// API Key Management Routes (session-based auth)
// The requireSession middleware is applied inside the route file.
// ============================================================
app.route("/api/v1/api-keys", apiKeyRoute);

// ============================================================
// API v1 Routes (all require API key + org context)
// ============================================================
const api = new Hono();

// Middleware chain for API routes:
// 1. requireApiKey - verify the Bearer token
// 2. orgContext    - resolve which org the request is for
// 3. requestLogger - log the request (non-blocking)
api.use("*", requireApiKey);
api.use("*", orgContext);
// api.use("*", rateLimiter);
api.use("*", requestLogger);

// Mount route handlers
// api.route("/emails", emailRoute);
api.route("/domains", domainRoute);

app.route("/api/v1", api);

// ============================================================
// Global Error Handler
// ============================================================
app.onError((err, c) => {
    console.error("[global-error]", err);
    return c.json(
        {
            success: false,
            error: {
                message: env.NODE_ENV === "production"
                    ? "Internal server error"
                    : err.message,
                code: "INTERNAL_ERROR",
            },
        },
        500
    );
});

// ============================================================
// 404 Handler
// ============================================================
app.notFound((c) => {
    return c.json(
        {
            success: false,
            error: {
                message: `Route ${c.req.method} ${c.req.path} not found`,
                code: "NOT_FOUND",
            },
        },
        404
    );
});

// ============================================================
// Start Server
// ============================================================
serve(
    {
        fetch: app.fetch,
        port: env.HONO_PORT,
    },
    (info) => {
        console.log("============================================================");
        console.log(`  SMTP API Server - Running`);
        console.log("============================================================");
        console.log(`  URL:         http://localhost:${info.port}`);
        console.log(`  Environment: ${env.NODE_ENV}`);
        console.log(`  Auth:        ${env.BETTER_AUTH_URL}/api/auth`);
        console.log(`  API:         http://localhost:${info.port}/api/v1`);
        console.log(`  Health:      http://localhost:${info.port}/health`);
        console.log("============================================================");
    }
);
