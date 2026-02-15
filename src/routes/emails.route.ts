import { Hono } from "hono";
import { emailsController } from "../controllers/emails.controller.js";

const emailRoute = new Hono();

/**
 * POST /emails       - Send an email
 * GET  /emails       - List sent emails (paginated)
 * GET  /emails/:id   - Get email details
 * PATCH /emails/:id/cancel - Cancel a queued email
 */
emailRoute.post("/", emailsController.send);
emailRoute.get("/", emailsController.list);
emailRoute.get("/:id", emailsController.getOne);
emailRoute.patch("/:id/cancel", emailsController.cancel);

export default emailRoute;
