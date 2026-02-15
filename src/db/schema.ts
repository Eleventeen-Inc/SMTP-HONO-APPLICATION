import { relations } from "drizzle-orm";
import {
    pgTable,
    text,
    timestamp,
    boolean,
    integer,
    index,
    uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
    twoFactorEnabled: boolean("two_factor_enabled").default(false),
});

export const session = pgTable(
    "session",
    {
        id: text("id").primaryKey(),
        expiresAt: timestamp("expires_at").notNull(),
        token: text("token").notNull().unique(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
        ipAddress: text("ip_address"),
        userAgent: text("user_agent"),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        activeOrganizationId: text("active_organization_id"),
    },
    (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
    "account",
    {
        id: text("id").primaryKey(),
        accountId: text("account_id").notNull(),
        providerId: text("provider_id").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        idToken: text("id_token"),
        accessTokenExpiresAt: timestamp("access_token_expires_at"),
        refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
        scope: text("scope"),
        password: text("password"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
        sallaAccessToken: text("salla_access_token"),
        sallaRefreshToken: text("salla_refresh_token"),
        sallaAccessTokenExpireAt: timestamp('salla_access_token_expire_at'),
        sallaRefreshTokenExpireAt: timestamp('salla_refresh_token_expire_at'),
    },
    (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
    "verification",
    {
        id: text("id").primaryKey(),
        identifier: text("identifier").notNull(),
        value: text("value").notNull(),
        expiresAt: timestamp("expires_at").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
    },
    (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const twoFactor = pgTable(
    "two_factor",
    {
        id: text("id").primaryKey(),
        secret: text("secret").notNull(),
        backupCodes: text("backup_codes").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
    },
    (table) => [
        index("twoFactor_secret_idx").on(table.secret),
        index("twoFactor_userId_idx").on(table.userId),
    ],
);

export const apikey = pgTable(
    "apikey",
    {
        id: text("id").primaryKey(),
        name: text("name"),
        start: text("start"),
        prefix: text("prefix"),
        key: text("key").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        refillInterval: integer("refill_interval"),
        refillAmount: integer("refill_amount"),
        lastRefillAt: timestamp("last_refill_at"),
        enabled: boolean("enabled").default(true),
        rateLimitEnabled: boolean("rate_limit_enabled").default(true),
        rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
        rateLimitMax: integer("rate_limit_max").default(10),
        requestCount: integer("request_count").default(0),
        remaining: integer("remaining"),
        lastRequest: timestamp("last_request"),
        expiresAt: timestamp("expires_at"),
        createdAt: timestamp("created_at").notNull(),
        updatedAt: timestamp("updated_at").notNull(),
        permissions: text("permissions"),
        metadata: text("metadata"),
    },
    (table) => [
        index("apikey_key_idx").on(table.key),
        index("apikey_userId_idx").on(table.userId),
    ],
);

export const organization = pgTable(
    "organization",
    {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        slug: text("slug").notNull().unique(),
        logo: text("logo"),
        createdAt: timestamp("created_at").notNull(),
        metadata: text("metadata"),
    },
    (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const member = pgTable(
    "member",
    {
        id: text("id").primaryKey(),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        role: text("role").default("member").notNull(),
        createdAt: timestamp("created_at").notNull(),
    },
    (table) => [
        index("member_organizationId_idx").on(table.organizationId),
        index("member_userId_idx").on(table.userId),
    ],
);

export const invitation = pgTable(
    "invitation",
    {
        id: text("id").primaryKey(),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        email: text("email").notNull(),
        role: text("role"),
        status: text("status").default("pending").notNull(),
        expiresAt: timestamp("expires_at").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        inviterId: text("inviter_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
    },
    (table) => [
        index("invitation_organizationId_idx").on(table.organizationId),
        index("invitation_email_idx").on(table.email),
    ],
);

export const domain = pgTable(
    "domain",
    {
        id: text("id").primaryKey(),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        region: text("region").notNull().default("eu-north-1"),
        publicKey: text("public_key"), // BYODKIM public key (base64)
        dkimSelector: text("dkim_selector").notNull().default("eleventyeleven"),
        verified: boolean("verified").default(false),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
    },
    (table) => [
        index("domain_organizationId_idx").on(table.organizationId),
        index("domain_name_idx").on(table.name),
        index("domain_verified_idx").on(table.verified),
    ]
);

export const dnsRecord = pgTable(
    "dns_record",
    {
        id: text("id").primaryKey(),
        domainId: text("domain_id")
            .notNull()
            .references(() => domain.id, { onDelete: "cascade" }),
        type: text("type").notNull(), // e.g., "MX", "TXT", "CNAME", "A", "AAAA"
        name: text("name").notNull(), // record name (e.g., "@", "mail", "_dmarc")
        value: text("value").notNull(), // record value
        ttl: integer("ttl").default(3600), // Time to live in seconds
        priority: integer("priority"), // For MX records
        verified: boolean("verified").default(false), // Whether DNS record is verified
        lastCheckedAt: timestamp("last_checked_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
    },
    (table) => [
        index("dns_record_domainId_idx").on(table.domainId),
        index("dns_record_type_idx").on(table.type),
        index("dns_record_name_idx").on(table.name),
        index("dns_record_verified_idx").on(table.verified),
        index("dns_record_domainId_type_idx").on(table.domainId, table.type),
    ]
);

export const alias = pgTable(
    "alias",
    {
        id: text("id").primaryKey(),
        domainId: text("domain_id")
            .notNull()
            .references(() => domain.id, { onDelete: "cascade" }),
        name: text("name"), // alias name (e.g., "support", "info")
        forwardTo: text("forward_to").notNull(), // email address to forward to
        description: text("description"),
        enabled: boolean("enabled").default(true),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
    },
    (table) => [
        index("alias_domainId_idx").on(table.domainId),
        index("alias_forwardTo_idx").on(table.forwardTo),
        index("alias_enabled_idx").on(table.enabled),
    ]
);

export const emailAddress = pgTable(
    "email_address",
    {
        id: text("id").primaryKey(),
        domainId: text("domain_id")
            .notNull()
            .references(() => domain.id, { onDelete: "cascade" }),
        userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
        value: text("value").notNull(), // full email address
        isDefault: boolean("is_default").default(false),
        isVerified: boolean("is_verified").default(false),
        verificationToken: text("verification_token"),
        forwardTo: text("forward_to"), // if this email forwards to another address
        enabled: boolean("enabled").default(true),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
    },
    (table) => [
        index("email_address_domainId_idx").on(table.domainId),
        index("email_address_userId_idx").on(table.userId),
        index("email_address_value_idx").on(table.value),
        index("email_address_isDefault_idx").on(table.isDefault),
    ]
);

export const emailSent = pgTable(
    "email_sent",
    {
        id: text("id").primaryKey(),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        from: text("from").notNull(), // sender email address
        to: text("to").notNull(), // recipient email address
        subject: text("subject").notNull(),
        body: text("body"),
        htmlBody: text("html_body"),
        status: text("status").notNull(), // "sent", "delivered", "failed", "bounced"
        providerId: text("provider_id"), // ID from email service provider
        error: text("error"), // error message if failed
        metadata: text("metadata"), // additional metadata as JSON
        scheduledAt: timestamp("scheduled_at"),
        sentAt: timestamp("sent_at"),
        deliveredAt: timestamp("delivered_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => [
        index("email_sent_organizationId_idx").on(table.organizationId),
        index("email_sent_status_idx").on(table.status),
        index("email_sent_createdAt_idx").on(table.createdAt),
        index("email_sent_to_idx").on(table.to),
        index("email_sent_from_idx").on(table.from),
    ]
);

export const logs = pgTable(
    "logs",
    {
        id: text("id").primaryKey(),
        organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
        userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
        apiKeyId: text("api_key_id").references(() => apikey.id, { onDelete: "cascade" }),
        action: text("action").notNull(), // e.g., "email_sent", "user_login", "api_call"
        resourceType: text("resource_type"), // e.g., "email", "user", "domain"
        resourceId: text("resource_id"), // ID of the affected resource
        ipAddress: text("ip_address"),
        userAgent: text("user_agent"),
        method: text("method"), // HTTP method if applicable
        path: text("path"), // request path if applicable
        statusCode: integer("status_code"), // HTTP status code
        details: text("details"), // JSON string with additional details
        error: text("error"), // error message if applicable
        duration: integer("duration"), // duration in milliseconds
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => [
        index("logs_organizationId_idx").on(table.organizationId),
        index("logs_userId_idx").on(table.userId),
        index("logs_action_idx").on(table.action),
        index("logs_createdAt_idx").on(table.createdAt),
        index("logs_apiKeyId_idx").on(table.apiKeyId),
        index("logs_resourceType_resourceId_idx").on(table.resourceType, table.resourceId),
    ]
);

export const creditPlan = pgTable(
    "credit_plan",
    {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        description: text("description"),
        credits: integer("credits").notNull(),
        priceCents: integer("price_cents").notNull(), // price in cents ($0.90 = 90 cents)
        isRecurring: boolean("is_recurring").default(false),
        intervalMonths: integer("interval_months").default(1), // 1 for monthly, 12 for yearly
        isActive: boolean("is_active").default(true),
        isDefaultMonthly: boolean("is_default_monthly").default(false), // marks the 3000 monthly free credits
        features: text("features"), // JSON array of features
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
    },
    (table) => [
        index("credit_plan_isActive_idx").on(table.isActive),
        index("credit_plan_isDefaultMonthly_idx").on(table.isDefaultMonthly),
    ]
);

export const organizationCredits = pgTable(
    "organization_credits",
    {
        id: text("id").primaryKey(),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" })
            .unique(),
        balance: integer("balance").default(0).notNull(),
        monthlyFreeCredits: integer("monthly_free_credits").default(3000).notNull(),
        monthlyFreeCreditsUsed: integer("monthly_free_credits_used").default(0).notNull(),
        purchasedCredits: integer("purchased_credits").default(0).notNull(), // Total purchased credits ever
        purchasedCreditsUsed: integer("purchased_credits_used").default(0).notNull(),
        totalCreditsUsed: integer("total_credits_used").default(0).notNull(), // All credits used (free + purchased)
        lastMonthlyReset: timestamp("last_monthly_reset").notNull(), // When monthly credits were last reset
        nextMonthlyReset: timestamp("next_monthly_reset").notNull(), // When monthly credits will reset next
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => /* @__PURE__ */ new Date())
            .notNull(),
    },
    (table) => [
        index("organization_credits_organizationId_idx").on(table.organizationId),
        index("organization_credits_balance_idx").on(table.balance),
        index("organization_credits_nextMonthlyReset_idx").on(table.nextMonthlyReset),
    ]
);

export const creditPurchase = pgTable(
    "credit_purchase",
    {
        id: text("id").primaryKey(),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        planId: text("plan_id").references(() => creditPlan.id),
        creditsPurchased: integer("credits_purchased").notNull(),
        priceCents: integer("price_cents").notNull(),
        paymentId: text("payment_id"), // External payment system ID
        paymentStatus: text("payment_status").default("pending"), // pending, completed, failed, refunded
        paymentMethod: text("payment_method"),
        metadata: text("metadata"), // JSON with additional details
        previousBalance: integer("previous_balance").notNull(),
        newBalance: integer("new_balance").notNull(),
        previousPurchasedCredits: integer("previous_purchased_credits").notNull(),
        newPurchasedCredits: integer("new_purchased_credits").notNull(),
        purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
        expiresAt: timestamp("expires_at"), // If purchased credits expire
    },
    (table) => [
        index("credit_purchase_organizationId_idx").on(table.organizationId),
        index("credit_purchase_paymentStatus_idx").on(table.paymentStatus),
        index("credit_purchase_purchasedAt_idx").on(table.purchasedAt),
        index("credit_purchase_expiresAt_idx").on(table.expiresAt),
    ]
);

export const creditUsage = pgTable(
    "credit_usage",
    {
        id: text("id").primaryKey(),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        emailSentId: text("email_sent_id").references(() => emailSent.id, { onDelete: "set null" }),
        creditsUsed: integer("credits_used").default(1).notNull(), // 1 credit per email
        creditType: text("credit_type").notNull(), // "monthly_free", "purchased"
        previousBalance: integer("previous_balance").notNull(),
        newBalance: integer("new_balance").notNull(),
        previousMonthlyFreeUsed: integer("previous_monthly_free_used").notNull(),
        newMonthlyFreeUsed: integer("new_monthly_free_used").notNull(),
        previousPurchasedUsed: integer("previous_purchased_used").notNull(),
        newPurchasedUsed: integer("new_purchased_used").notNull(),
        description: text("description"),
        metadata: text("metadata"),
        usedAt: timestamp("used_at").defaultNow().notNull(),
    },
    (table) => [
        index("credit_usage_organizationId_idx").on(table.organizationId),
        index("credit_usage_emailSentId_idx").on(table.emailSentId),
        index("credit_usage_usedAt_idx").on(table.usedAt),
        index("credit_usage_creditType_idx").on(table.creditType),
    ]
);

export const creditPlanRelations = relations(creditPlan, ({ many }) => ({
    purchases: many(creditPurchase),
}));

export const organizationCreditsRelations = relations(organizationCredits, ({ one, many }) => ({
    organization: one(organization, {
        fields: [organizationCredits.organizationId],
        references: [organization.id],
    }),
    purchases: many(creditPurchase),
    usages: many(creditUsage),
}));

export const creditPurchaseRelations = relations(creditPurchase, ({ one }) => ({
    organization: one(organization, {
        fields: [creditPurchase.organizationId],
        references: [organization.id],
    }),
    plan: one(creditPlan, {
        fields: [creditPurchase.planId],
        references: [creditPlan.id],
    }),
    credits: one(organizationCredits, {
        fields: [creditPurchase.organizationId],
        references: [organizationCredits.organizationId],
    }),
}));

export const creditUsageRelations = relations(creditUsage, ({ one }) => ({
    organization: one(organization, {
        fields: [creditUsage.organizationId],
        references: [organization.id],
    }),
    emailSent: one(emailSent, {
        fields: [creditUsage.emailSentId],
        references: [emailSent.id],
    }),
    credits: one(organizationCredits, {
        fields: [creditUsage.organizationId],
        references: [organizationCredits.organizationId],
    }),
}));

export const userRelations = relations(user, ({ many }) => ({
    sessions: many(session),
    accounts: many(account),
    twoFactors: many(twoFactor),
    apikeys: many(apikey),
    members: many(member),
    invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
    user: one(user, {
        fields: [session.userId],
        references: [user.id],
    }),
}));

export const accountRelations = relations(account, ({ one }) => ({
    user: one(user, {
        fields: [account.userId],
        references: [user.id],
    }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
    user: one(user, {
        fields: [twoFactor.userId],
        references: [user.id],
    }),
}));

export const apikeyRelations = relations(apikey, ({ one }) => ({
    user: one(user, {
        fields: [apikey.userId],
        references: [user.id],
    }),
}));

export const organizationRelations = relations(organization, ({ many, one }) => ({
    members: many(member),
    invitations: many(invitation),
    domains: many(domain),
    emailsSent: many(emailSent),
    logs: many(logs),
    credits: one(organizationCredits),
    creditPurchases: many(creditPurchase),
    creditUsages: many(creditUsage),
}));

export const memberRelations = relations(member, ({ one }) => ({
    organization: one(organization, {
        fields: [member.organizationId],
        references: [organization.id],
    }),
    user: one(user, {
        fields: [member.userId],
        references: [user.id],
    }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
    organization: one(organization, {
        fields: [invitation.organizationId],
        references: [organization.id],
    }),
    user: one(user, {
        fields: [invitation.inviterId],
        references: [user.id],
    }),
}));

export const domainRelations = relations(domain, ({ one, many }) => ({
    organization: one(organization, {
        fields: [domain.organizationId],
        references: [organization.id],
    }),
    dnsRecords: many(dnsRecord),
    aliases: many(alias),
    emailAddresses: many(emailAddress),
}));

export const dnsRecordRelations = relations(dnsRecord, ({ one }) => ({
    domain: one(domain, {
        fields: [dnsRecord.domainId],
        references: [domain.id],
    }),
}));

export const aliasRelations = relations(alias, ({ one }) => ({
    domain: one(domain, {
        fields: [alias.domainId],
        references: [domain.id],
    }),
}));

export const emailAddressRelations = relations(emailAddress, ({ one }) => ({
    domain: one(domain, {
        fields: [emailAddress.domainId],
        references: [domain.id],
    }),
    user: one(user, {
        fields: [emailAddress.userId],
        references: [user.id],
    }),
}));

export const emailSentRelations = relations(emailSent, ({ one }) => ({
    organization: one(organization, {
        fields: [emailSent.organizationId],
        references: [organization.id],
    }),
    creditUsage: one(creditUsage, {
        fields: [emailSent.id],
        references: [creditUsage.emailSentId],
    }),
}));

export const logsRelations = relations(logs, ({ one }) => ({
    organization: one(organization, {
        fields: [logs.organizationId],
        references: [organization.id],
    }),
    user: one(user, {
        fields: [logs.userId],
        references: [user.id],
    }),
    apiKey: one(apikey, {
        fields: [logs.apiKeyId],
        references: [apikey.id],
    }),
}));

export const schema = {
    user,
    session,
    account,
    verification,
    twoFactor,
    apikey,
    organization,
    member,
    invitation,
    domain,
    dnsRecord,
    alias,
    emailAddress,
    emailSent,
    logs,
    creditPlan,
    organizationCredits,
    creditPurchase,
    creditUsage,
}