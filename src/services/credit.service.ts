import { eq, and, lte } from "drizzle-orm";
import db from "../db/index.js";
import { organizationCredits, creditUsage } from "../db/schema.js";
import { generateId } from "../utils/id.js";
import { InsufficientCreditsError, NotFoundError } from "../utils/errors.js";

/**
 * Initialize credits for a newly created organization.
 * Gives 3000 free monthly credits.
 */
export async function initializeCredits(orgId: string): Promise<void> {
    const now = new Date();
    const nextReset = new Date(now);
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1);
    nextReset.setHours(0, 0, 0, 0);

    await db.insert(organizationCredits).values({
        id: generateId("cred"),
        organizationId: orgId,
        balance: 3000,
        monthlyFreeCredits: 3000,
        monthlyFreeCreditsUsed: 0,
        purchasedCredits: 0,
        purchasedCreditsUsed: 0,
        totalCreditsUsed: 0,
        lastMonthlyReset: now,
        nextMonthlyReset: nextReset,
        createdAt: now,
        updatedAt: now,
    });
}

/**
 * Get the current credit balance for an organization.
 */
export async function checkBalance(orgId: string) {
    const rows = await db
        .select()
        .from(organizationCredits)
        .where(eq(organizationCredits.organizationId, orgId))
        .limit(1);

    if (rows.length === 0) {
        throw new NotFoundError("Organization credits");
    }

    return rows[0]!;
}

/**
 * Atomically check and deduct credits from an organization.
 * Uses monthly free credits first, then purchased credits.
 * Throws InsufficientCreditsError if not enough credits.
 */
export async function checkAndDeduct(
    orgId: string,
    amount: number,
    emailSentId?: string
): Promise<void> {
    const credits = await checkBalance(orgId);

    // Check if monthly reset is needed
    if (new Date() >= credits.nextMonthlyReset) {
        await resetOrgMonthlyCredits(orgId, credits);
        // Re-fetch after reset
        const refreshed = await checkBalance(orgId);
        Object.assign(credits, refreshed);
    }

    const totalAvailable = credits.balance;

    if (totalAvailable < amount) {
        throw new InsufficientCreditsError(
            `Insufficient credits. Available: ${totalAvailable}, Required: ${amount}`
        );
    }

    // Calculate how credits are consumed: monthly free first, then purchased
    const freeRemaining = credits.monthlyFreeCredits - credits.monthlyFreeCreditsUsed;
    let freeToUse = Math.min(freeRemaining, amount);
    let purchasedToUse = amount - freeToUse;

    const newMonthlyFreeUsed = credits.monthlyFreeCreditsUsed + freeToUse;
    const newPurchasedUsed = credits.purchasedCreditsUsed + purchasedToUse;
    const newBalance = credits.balance - amount;
    const newTotalUsed = credits.totalCreditsUsed + amount;

    // Update organization credits
    await db
        .update(organizationCredits)
        .set({
            balance: newBalance,
            monthlyFreeCreditsUsed: newMonthlyFreeUsed,
            purchasedCreditsUsed: newPurchasedUsed,
            totalCreditsUsed: newTotalUsed,
            updatedAt: new Date(),
        })
        .where(eq(organizationCredits.organizationId, orgId));

    // Record credit usage
    await db.insert(creditUsage).values({
        id: generateId("cusage"),
        organizationId: orgId,
        emailSentId: emailSentId || null,
        creditsUsed: amount,
        creditType: freeToUse > 0 ? "monthly_free" : "purchased",
        previousBalance: credits.balance,
        newBalance,
        previousMonthlyFreeUsed: credits.monthlyFreeCreditsUsed,
        newMonthlyFreeUsed,
        previousPurchasedUsed: credits.purchasedCreditsUsed,
        newPurchasedUsed,
        description: `Deducted ${amount} credit(s) for email sending`,
        usedAt: new Date(),
    });
}

/**
 * Reset monthly free credits for a specific organization.
 */
async function resetOrgMonthlyCredits(
    orgId: string,
    credits: typeof organizationCredits.$inferSelect
): Promise<void> {
    const now = new Date();
    const nextReset = new Date(now);
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1);
    nextReset.setHours(0, 0, 0, 0);

    // Calculate new balance: remove old unused free credits, add fresh free credits
    const oldFreeRemaining = credits.monthlyFreeCredits - credits.monthlyFreeCreditsUsed;
    const purchasedRemaining = credits.purchasedCredits - credits.purchasedCreditsUsed;
    const newBalance = credits.monthlyFreeCredits + purchasedRemaining;

    await db
        .update(organizationCredits)
        .set({
            balance: newBalance,
            monthlyFreeCreditsUsed: 0,
            lastMonthlyReset: now,
            nextMonthlyReset: nextReset,
            updatedAt: now,
        })
        .where(eq(organizationCredits.organizationId, orgId));
}

/**
 * Reset monthly credits for all organizations whose reset date has passed.
 * This should be called by a cron job (e.g., daily).
 */
export async function resetAllMonthlyCredits(): Promise<number> {
    const now = new Date();

    // Find all orgs needing reset
    const orgsToReset = await db
        .select()
        .from(organizationCredits)
        .where(lte(organizationCredits.nextMonthlyReset, now));

    for (const credits of orgsToReset) {
        await resetOrgMonthlyCredits(credits.organizationId, credits);
    }

    return orgsToReset.length;
}
