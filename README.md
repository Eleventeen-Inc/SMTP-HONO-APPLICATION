# SMTP API

A production-ready email sending API built with **Hono**, **Better Auth**, **Drizzle ORM**, **BullMQ**, and **nodemailer**. Works as the HTTP interface for a self-hosted SMTP server (Postfix/Dovecot/OpenDKIM) running on the same VPS.

Think of it like a self-hosted [Resend](https://resend.com) -- users sign up, get API keys, add custom domains, and send emails programmatically.

## How It Works

```
Your App  -->  SMTP API (this project, port 3000)  -->  Postfix SMTP Server (port 587)  -->  Internet
                  |                                            |
                  |-- PostgreSQL (Neon)                        |-- OpenDKIM (signs emails)
                  |-- Redis (BullMQ queue)                     |-- Dovecot (IMAP)
                  |-- Better Auth (users, API keys)            |-- Fail2ban (security)
```

The API receives HTTP requests, validates them, checks credits, queues the email via BullMQ, and a background worker sends it through the Postfix SMTP server using nodemailer.

---

## Prerequisites

Before deploying this project, you need:

1. **A VPS** running **Ubuntu 24.04** with a public IP (e.g., Hetzner, DigitalOcean, AWS EC2)
2. **A domain name** with DNS access (e.g., `yourdomain.com`)
3. **Docker** and **Docker Compose** installed on the VPS
4. **A PostgreSQL database** (we recommend [Neon](https://neon.tech) -- free tier works)
5. **Port 25 unblocked** by your hosting provider (required for sending email)

---

## Step 1: Deploy the SMTP Server First

This API **requires** a running SMTP server on the same VPS. We use the open-source Dockerized mail server from:

> **https://github.com/Eleventeen-Inc/SMTP-SELFHOSTED**

Follow the full instructions in that repository. Here is a quick summary:

### 1.1 Install Docker on Ubuntu 24.04

```bash
# SSH into your VPS
ssh root@your-server-ip

# Install Docker
curl -fsSL https://get.docker.com | sh
```

### 1.2 Clone and configure the SMTP server

```bash
git clone https://github.com/Eleventeen-Inc/SMTP-SELFHOSTED.git /opt/smtp-server
cd /opt/smtp-server
cp .env.example .env
nano .env
```

Set at minimum these values in `/opt/smtp-server/.env`:

```env
MAIL_DOMAIN=yourdomain.com
MAIL_HOSTNAME=mail.yourdomain.com
SSL_MODE=letsencrypt
SSL_EMAIL=admin@yourdomain.com
MAIL_ACCOUNTS=admin@yourdomain.com:YourStrongPassword123|system@yourdomain.com:SystemAccountPassword
```

**Important:** You must add a `system@yourdomain.com` account. This is the account the API uses to relay emails through Postfix. Choose a strong password and save it -- you will need it later.

### 1.3 Set up DNS records

Before starting the SMTP server, configure these DNS records at your domain provider:

| Type | Name | Value | Priority |
|------|------|-------|----------|
| A | `mail` | `YOUR_SERVER_IP` | - |
| MX | `@` | `mail.yourdomain.com` | 10 |
| TXT | `@` | `v=spf1 mx a:mail.yourdomain.com ~all` | - |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:admin@yourdomain.com` | - |
| PTR | `YOUR_SERVER_IP` | `mail.yourdomain.com` (set via hosting provider) | - |

The DKIM TXT record will be added after the first start (Step 1.5).

### 1.4 Build and start the SMTP server

```bash
cd /opt/smtp-server
docker compose up -d --build
```

Wait 30 seconds, then verify all services are running:

```bash
docker compose exec mailserver supervisorctl status
```

You should see all services as `RUNNING`:

```
dovecot     RUNNING   pid 123, uptime 0:05:00
fail2ban    RUNNING   pid 124, uptime 0:05:00
opendkim    RUNNING   pid 125, uptime 0:05:00
postfix     RUNNING   pid 126, uptime 0:05:00
rsyslog     RUNNING   pid 127, uptime 0:05:00
```

### 1.5 Get the DKIM key and add it to DNS

```bash
docker compose exec mailserver cat /etc/opendkim/keys/yourdomain.com/default.txt
```

Add the output as a TXT record:

| Type | Name | Value |
|------|------|-------|
| TXT | `default._domainkey` | `v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqh...` (the full key) |

### 1.6 Test the SMTP server

```bash
docker compose exec mailserver bash -c '
echo -e "Subject: Test\nFrom: admin@yourdomain.com\nTo: your-personal-email@gmail.com\n\nHello" | sendmail -f admin@yourdomain.com -t
'
```

Check your inbox. If you receive the email, the SMTP server is working. Move on to Step 2.

---

## Step 2: Deploy the SMTP API

### 2.1 Clone this project

```bash
git clone https://github.com/YOUR_USERNAME/smtp-api-hono.git /opt/smtp-api
cd /opt/smtp-api
```

### 2.2 Create your environment file

```bash
cp .env.example .env
nano .env
```

Fill in **every** value. Here is a complete example:

```env
# App
NODE_ENV=production
HONO_PORT=3000

# Auth -- generate a random secret: openssl rand -base64 32
BETTER_AUTH_SECRET=your-random-secret-at-least-32-chars
BETTER_AUTH_URL=https://api.yourdomain.com

# Database -- get this from Neon (https://neon.tech)
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Redis -- the docker-compose file runs Redis automatically
REDIS_HOST=smtp-api-redis
REDIS_PORT=6379

# SMTP Server Connection
# SMTP_HOST must be the mailserver container name or the host IP.
# Since the API runs in Docker with bridge networking, use the host IP
# or the Docker host gateway.
SMTP_HOST=172.17.0.1
SMTP_PORT=587
SMTP_USER=system@yourdomain.com
SMTP_PASS=SystemAccountPassword
SMTP_CONTAINER_NAME=mailserver

# Shared Domain (free tier for users without a custom domain)
SHARED_DOMAIN=yourdomain.com
SHARED_FROM_EMAIL=onboarding@yourdomain.com
SHARED_DAILY_LIMIT=100

# OAuth (optional -- leave empty to disable)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Auth Advanced Settings
# Comma-separated list of origins allowed to make auth requests (CORS)
AUTH_TRUSTED_ORIGINS=https://app.yourdomain.com,https://dashboard.yourdomain.com
# Domain for cross-subdomain cookies (e.g., share sessions between api.yourdomain.com and app.yourdomain.com)
AUTH_COOKIE_DOMAIN=yourdomain.com
# Set to "true" in production (requires HTTPS)
AUTH_SECURE_COOKIES=true
```

**Key notes about `SMTP_HOST`:**

- The SMTP server container (`mailserver`) uses `network_mode: "host"`, so Postfix listens directly on the VPS host ports.
- The API container uses bridge networking, so `localhost` inside it does **not** reach the host.
- Use `172.17.0.1` (Docker's default host gateway on Linux) or your VPS public IP to reach Postfix from the API container.
- To find your Docker host gateway: `docker network inspect bridge | grep Gateway`

**Key notes about `AUTH_*` variables:**

- **`AUTH_TRUSTED_ORIGINS`** -- Comma-separated list of origins that are allowed to make authentication requests. Include every frontend domain that will interact with the API (e.g., your dashboard, your marketing site). This is required for cross-origin cookie-based auth to work.
- **`AUTH_COOKIE_DOMAIN`** -- Enables cross-subdomain cookie sharing. Set this to your root domain (e.g., `yourdomain.com`) so that a session created on `api.yourdomain.com` is also valid on `app.yourdomain.com`. In local development, use `localhost`.
- **`AUTH_SECURE_COOKIES`** -- Set to `true` in production (requires HTTPS). Set to `false` for local development over plain HTTP.

### 2.3 Set up the database

You need a PostgreSQL database. We recommend [Neon](https://neon.tech) (free tier):

1. Create an account at https://neon.tech
2. Create a new project and database
3. Copy the connection string into `DATABASE_URL` in your `.env`

Then push the database schema:

```bash
# Install dependencies first (needed for drizzle-kit)
npm install
npx drizzle-kit push
```

### 2.4 Build and start the API

```bash
cd /opt/smtp-api
docker compose up -d --build
```

Check the logs:

```bash
docker compose logs -f api
```

You should see:

```
============================================================
  SMTP API Server - Running
============================================================
  URL:         http://localhost:3000
  Environment: production
  Auth:        https://api.yourdomain.com/api/auth
  API:         http://localhost:3000/api/v1
  Health:      http://localhost:3000/health
============================================================
[mail-worker] Mail worker started and listening for jobs
[mail-worker] SMTP transporter connected and ready
```

### 2.5 Verify the health endpoint

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok","timestamp":"2026-02-15T12:00:00.000Z","version":"1.0.0"}
```

---

## Step 3: Set Up a Reverse Proxy (Production)

In production, you should put the API behind a reverse proxy (Nginx or Caddy) with HTTPS.

### Option A: Caddy (simplest -- auto HTTPS)

```bash
apt install caddy
```

Edit `/etc/caddy/Caddyfile`:

```
api.yourdomain.com {
    reverse_proxy localhost:3000
}
```

```bash
systemctl restart caddy
```

Caddy automatically obtains and renews Let's Encrypt certificates.

### Option B: Nginx

```bash
apt install nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/smtp-api`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/smtp-api /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
certbot --nginx -d api.yourdomain.com
```

**Don't forget** to add a DNS A record for `api.yourdomain.com` pointing to your server IP.

---

## API Usage

### Authentication Flow

1. **Sign up** -- Create an account via email/password, magic link, or a social provider (GitHub, Google)
2. **Create an organization** -- Every user needs an org (API keys and domains belong to orgs). Credits are automatically initialized when an organization is created.
3. **Create an API key** -- Used to authenticate API requests
4. **Add a domain** (optional) -- Or use the shared domain for testing

**Supported auth methods:** Email/password, magic link, GitHub OAuth, Google OAuth, two-factor authentication (2FA). The `lastLoginMethod` plugin tracks which method was used most recently.

### Auth Endpoints (Session/Cookie-based)

These are handled by Better Auth. Use them from a frontend or with cookies:

```bash
# Sign up with email/password
curl -X POST https://api.yourdomain.com/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name": "John", "email": "john@example.com", "password": "securepassword"}'

# Sign in with email/password
curl -X POST https://api.yourdomain.com/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email": "john@example.com", "password": "securepassword"}'

# Sign in with magic link (sends a link to the email)
curl -X POST https://api.yourdomain.com/api/auth/magic-link/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com"}'

# Sign in with GitHub (redirect the user to this URL in the browser)
# GET https://api.yourdomain.com/api/auth/callback/github

# Sign in with Google (redirect the user to this URL in the browser)
# GET https://api.yourdomain.com/api/auth/callback/google

# Create an organization (requires session cookie)
# Credits are automatically initialized for the new organization
curl -X POST https://api.yourdomain.com/api/auth/organization/create \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name": "My Company", "slug": "my-company"}'
```

### Create an API Key (Session-based)

```bash
curl -X POST https://api.yourdomain.com/api/v1/api-keys \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name": "Production Key"}'
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "apikey_abc123",
    "name": "Production Key",
    "key": "sk_live_xxxxxxxxxxxxxxxxxxxxxxxx",
    "createdAt": "2026-02-15T12:00:00.000Z"
  }
}
```

Save the `key` value. It is only shown once.

### API Endpoints (API Key-based)

All `/api/v1/*` endpoints (except `/api/v1/api-keys`) require the API key in the `Authorization` header:

```
Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

Optionally, specify which organization with:

```
X-Organization-Id: org_abc123
```

---

### Send an Email

```bash
curl -X POST https://api.yourdomain.com/api/v1/emails \
  -H "Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "onboarding@yourdomain.com",
    "to": "recipient@example.com",
    "subject": "Hello from my API",
    "html": "<h1>Welcome!</h1><p>This email was sent via my self-hosted email API.</p>"
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "email_abc123",
    "from": "onboarding@yourdomain.com",
    "to": ["recipient@example.com"],
    "subject": "Hello from my API",
    "status": "queued",
    "createdAt": "2026-02-15T12:00:00.000Z"
  }
}
```

### List Sent Emails

```bash
curl https://api.yourdomain.com/api/v1/emails?page=1&pageSize=20 \
  -H "Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
```

### Get Email Details

```bash
curl https://api.yourdomain.com/api/v1/emails/email_abc123 \
  -H "Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
```

### Cancel a Queued Email

```bash
curl -X PATCH https://api.yourdomain.com/api/v1/emails/email_abc123/cancel \
  -H "Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
```

### Add a Custom Domain

```bash
curl -X POST https://api.yourdomain.com/api/v1/domains \
  -H "Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"name": "notifications.example.com"}'
```

Response includes the DNS records you need to add:

```json
{
  "success": true,
  "data": {
    "id": "dom_abc123",
    "name": "notifications.example.com",
    "verified": false,
    "dnsRecords": [
      { "type": "MX", "name": "@", "value": "mail.yourdomain.com", "priority": 10, "verified": false },
      { "type": "TXT", "name": "@", "value": "v=spf1 mx a:mail.yourdomain.com ~all", "verified": false },
      { "type": "TXT", "name": "default._domainkey", "value": "v=DKIM1; h=sha256; ...", "verified": false },
      { "type": "TXT", "name": "_dmarc", "value": "v=DMARC1; p=quarantine; ...", "verified": false }
    ]
  }
}
```

### Verify Domain DNS

After adding all DNS records at your provider, trigger verification:

```bash
curl -X POST https://api.yourdomain.com/api/v1/domains/dom_abc123/verify \
  -H "Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
```

### List Domains

```bash
curl https://api.yourdomain.com/api/v1/domains \
  -H "Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
```

### Delete a Domain

```bash
curl -X DELETE https://api.yourdomain.com/api/v1/domains/dom_abc123 \
  -H "Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
```

---

## API Endpoints Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `ALL` | `/api/auth/*` | Session | Better Auth (signup, login, OAuth, 2FA, etc.) |
| `POST` | `/api/v1/emails` | API Key | Send an email |
| `GET` | `/api/v1/emails` | API Key | List sent emails (paginated) |
| `GET` | `/api/v1/emails/:id` | API Key | Get email details |
| `PATCH` | `/api/v1/emails/:id/cancel` | API Key | Cancel a queued email |
| `POST` | `/api/v1/domains` | API Key | Add a custom domain |
| `GET` | `/api/v1/domains` | API Key | List domains |
| `GET` | `/api/v1/domains/:id` | API Key | Get domain with DNS records |
| `DELETE` | `/api/v1/domains/:id` | API Key | Remove a domain |
| `POST` | `/api/v1/domains/:id/verify` | API Key | Verify domain DNS records |
| `POST` | `/api/v1/api-keys` | Session | Create an API key |
| `GET` | `/api/v1/api-keys` | Session | List API keys |
| `DELETE` | `/api/v1/api-keys/:id` | Session | Revoke an API key |
| `GET` | `/health` | None | Health check |

---

## Shared Domain vs Custom Domain

### Shared Domain (Free Tier)

Every user can immediately send emails using the shared domain (e.g., `onboarding@yourdomain.com`) without setting up DNS. However, there are restrictions:

- **From address** must be exactly `SHARED_FROM_EMAIL` (e.g., `onboarding@yourdomain.com`)
- **Recipients** are limited to the user's own verified email address (the email they registered with)
- **Daily limit** of 100 emails (configurable via `SHARED_DAILY_LIMIT`)

This is the same model as Resend's `onboarding@resend.dev`.

### Custom Domain (Full Access)

Users who add and verify their own domain get:

- Send from **any address** on that domain (e.g., `notifications@theirdomain.com`)
- Send to **any recipient** -- no restrictions
- DKIM signing with their domain's keys
- Full credit-based usage

---

## Credit System

Each organization starts with **3,000 free credits per month** (1 credit = 1 email). Credits reset on the 1st of each month.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| HTTP Framework | [Hono](https://hono.dev) |
| Authentication | [Better Auth](https://better-auth.com) (API keys, OAuth, 2FA, magic link, organizations, last login method) |
| Database | PostgreSQL via [Drizzle ORM](https://orm.drizzle.team) + [Neon](https://neon.tech) |
| Job Queue | [BullMQ](https://docs.bullmq.io) + Redis |
| Email Sending | [nodemailer](https://nodemailer.com) -> Postfix (localhost:587) |
| SMTP Server | [SMTP-SELFHOSTED](https://github.com/Eleventeen-Inc/SMTP-SELFHOSTED) (Postfix + Dovecot + OpenDKIM) |
| Validation | [Zod](https://zod.dev) |
| Language | TypeScript |
| Runtime | Node.js 20 |
| Deployment | Docker + Docker Compose |

---

## Project Structure

```
smtp-api-hono/
  src/
    index.ts                      # Entry point -- Hono server
    config/
      env.ts                      # Environment variable validation (Zod)
      constants.ts                # App-wide constants
      redis.ts                    # Redis connection config
    db/
      index.ts                    # Drizzle ORM database connection
      schema.ts                   # Full database schema (18 tables)
    lib/
      auth.ts                     # Better Auth configuration
    middleware/
      auth.middleware.ts           # API key + session authentication
      rate-limit.middleware.ts     # Redis-based rate limiting
      logger.middleware.ts         # Async request audit logging
      org-context.middleware.ts    # Organization resolver
    routes/
      auth.route.ts               # Better Auth handler
      emails.route.ts             # Email CRUD routes
      domains.route.ts            # Domain management routes
      api-keys.route.ts           # API key management routes
    controllers/
      emails.controller.ts        # Email request handlers
      domains.controller.ts       # Domain request handlers
      api-keys.controller.ts      # API key request handlers
    services/
      email.service.ts            # Email sending business logic
      domain.service.ts           # Domain management logic
      dns-verify.service.ts       # DNS record verification
      smtp-manager.service.ts     # SMTP server management (docker exec)
      credit.service.ts           # Credit system logic
      log.service.ts              # Audit log writer
    validations/
      emails.validator.ts         # Zod schemas for email endpoints
      domains.validator.ts        # Zod schemas for domain endpoints
      api-keys.validator.ts       # Zod schemas for API key endpoints
    utils/
      mail-queue.ts               # BullMQ queue instance
      mail-consumer.ts            # BullMQ worker (sends via nodemailer)
      id.ts                       # ID generation (nanoid)
      errors.ts                   # Custom error classes
      response.ts                 # Standardized API response helpers
    types/
      index.ts                    # Shared TypeScript types
  scripts/
    add-domain.sh                 # Add domain to SMTP server
    remove-domain.sh              # Remove domain from SMTP server
    get-dkim-key.sh               # Get DKIM key from SMTP server
  Dockerfile                      # Multi-stage Docker build
  docker-compose.yml              # API + Redis services
  .env.example                    # Environment variable template
  drizzle.config.ts               # Drizzle Kit config
  tsconfig.json                   # TypeScript config
  package.json                    # Dependencies
```

---

## Local Development

```bash
# Install dependencies
npm install

# Copy and edit environment file
cp .env.example .env
# Edit .env with your values (use localhost for SMTP_HOST, etc.)
# For local development, use these auth settings:
#   AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://localhost:8787
#   AUTH_COOKIE_DOMAIN=localhost
#   AUTH_SECURE_COOKIES=false

# Push database schema
npx drizzle-kit push

# Start Redis (requires Docker)
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Start the dev server (hot reload)
npm run dev
```

The server starts at `http://localhost:3000`.

---

## Troubleshooting

### API says "SMTP transporter connection failed"

- Verify the SMTP server is running: `docker exec mailserver supervisorctl status`
- Check `SMTP_HOST` -- from inside the API Docker container, `localhost` refers to the container itself, not the host. Use `172.17.0.1` or your VPS public IP.
- Check `SMTP_USER` and `SMTP_PASS` match an account in the SMTP server's `MAIL_ACCOUNTS` env var.
- Test the connection manually: `openssl s_client -starttls smtp -connect YOUR_SMTP_HOST:587`

### Emails going to spam

- Verify PTR (reverse DNS) record with your hosting provider.
- Check SPF, DKIM, and DMARC records: `dig TXT yourdomain.com +short`
- Test your email deliverability at [mail-tester.com](https://www.mail-tester.com).

### "No organization found" error

- After signing up, you must create an organization before using the API.
- Use `POST /api/auth/organization/create` with your session cookie.

### Rate limit errors (429)

- Default: 1000 requests per 24 hours per API key.
- Check your usage in the response headers: `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### Database migration issues

```bash
# Generate migration files
npx drizzle-kit generate

# Push schema directly (development)
npx drizzle-kit push
```

---

## License

MIT
