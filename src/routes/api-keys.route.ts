import { Hono } from "hono";
import { apiKeysController } from "../controllers/api-keys.controller.js";
import { requireSession } from "../middleware/auth.middleware.js";

const apiKeyRoute = new Hono();

/**
 * API key management routes.
 * These use session-based auth (cookies), NOT API key auth.
 * This is because you need to be logged in via the dashboard
 * to create/manage your API keys.
 *
 * POST   /api-keys      - Create a new API key
 * GET    /api-keys      - List all API keys
 * DELETE /api-keys/:id  - Revoke an API key
 */
apiKeyRoute.use("*", requireSession);
apiKeyRoute.post("/", apiKeysController.create);
apiKeyRoute.get("/", apiKeysController.list);
apiKeyRoute.delete("/:id", apiKeysController.revoke);

export default apiKeyRoute;
