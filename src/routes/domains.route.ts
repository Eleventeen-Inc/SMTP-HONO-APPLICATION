import { Hono } from "hono";
import { domainsController } from "../controllers/domains.controller.js";

const domainRoute = new Hono();

/**
 * POST   /domains            - Add a custom domain
 * GET    /domains            - List all domains
 * GET    /domains/:id        - Get domain with DNS records
 * DELETE /domains/:id        - Remove a domain
 * POST   /domains/:id/verify - Verify domain DNS records
 */
domainRoute.post("/", domainsController.add);
domainRoute.get("/", domainsController.list);
domainRoute.get("/:id", domainsController.getOne);
domainRoute.delete("/:id", domainsController.remove);
domainRoute.post("/:id/verify", domainsController.verify);

export default domainRoute;
