import { Hono } from "hono";
import auth from "../lib/auth.js";

const authRoute = new Hono();

/**
 * Mount Better Auth handler.
 * This handles all authentication routes:
 *   - POST /api/auth/sign-up/email
 *   - POST /api/auth/sign-in/email
 *   - POST /api/auth/sign-out
 *   - GET  /api/auth/session
 *   - POST /api/auth/callback/github
 *   - POST /api/auth/callback/google
 *   - POST /api/auth/magic-link/send
 *   - POST /api/auth/two-factor/*
 *   - POST /api/auth/organization/*
 *   - And all other Better Auth endpoints
 */
authRoute.all("/api/auth/*", (c) => {
    return auth.handler(c.req.raw);
});

export default authRoute;
