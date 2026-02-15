import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
    apiKey,
    lastLoginMethod,
    magicLink,
    organization,
    twoFactor,
} from "better-auth/plugins";
import nodemailer from "nodemailer";
import db from "../db/index.js";
import { schema } from "../db/schema.js";
import { env } from "../config/env.js";
import { initializeCredits } from "../services/credit.service.js";

/**
 * Nodemailer transporter for sending auth-related emails
 * (password reset, verification, magic link, invitations).
 * Connects to the same Postfix SMTP server as the mail worker.
 */
const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: env.NODE_ENV === "production",
    },
});

/**
 * Helper to send an email via the SMTP server.
 */
async function sendAuthEmail(to: string, subject: string, html: string) {
    try {
        await transporter.sendMail({
            from: env.SHARED_FROM_EMAIL,
            to,
            subject,
            html,
        });
    } catch (err) {
        console.error(`[auth] Failed to send email to ${to}:`, err);
    }
}

const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: schema,
    }),
    emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, url }) => {
            await sendAuthEmail(
                user.email,
                "Reset Your Password",
                `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Reset Your Password</h2>
                    <p>Hi ${user.name},</p>
                    <p>You requested a password reset. Click the button below to set a new password:</p>
                    <p style="margin: 24px 0;">
                        <a href="${url}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                            Reset Password
                        </a>
                    </p>
                    <p>If you didn't request this, you can safely ignore this email.</p>
                    <p style="color: #666; font-size: 12px;">This link expires in 1 hour.</p>
                </div>
                `
            );
        },
    },
    socialProviders: {
        ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
            ? {
                  github: {
                      clientId: env.GITHUB_CLIENT_ID,
                      clientSecret: env.GITHUB_CLIENT_SECRET,
                      redirectURI: `${env.BETTER_AUTH_URL}/api/auth/callback/github`,
                  },
              }
            : {}),
        ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
            ? {
                  google: {
                      clientId: env.GOOGLE_CLIENT_ID,
                      clientSecret: env.GOOGLE_CLIENT_SECRET,
                      redirectURI: `${env.BETTER_AUTH_URL}/api/auth/callback/google`,
                  },
              }
            : {}),
    },
    emailVerification: {
        sendVerificationEmail: async ({ user, url, token }) => {
            await sendAuthEmail(
                user.email,
                "Verify Your Email Address",
                `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Verify Your Email</h2>
                    <p>Hi ${user.name},</p>
                    <p>Please verify your email address by clicking the button below:</p>
                    <p style="margin: 24px 0;">
                        <a href="${url}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                            Verify Email
                        </a>
                    </p>
                    <p style="color: #666; font-size: 12px;">This link expires in 24 hours.</p>
                </div>
                `
            );
        },
    },
    plugins: [
        twoFactor(),
        magicLink({
            sendMagicLink: async ({ email, url }) => {
                await sendAuthEmail(
                    email,
                    "Your Magic Link",
                    `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Sign In</h2>
                        <p>Click the button below to sign in to your account:</p>
                        <p style="margin: 24px 0;">
                            <a href="${url}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                                Sign In
                            </a>
                        </p>
                        <p>If you didn't request this, you can safely ignore this email.</p>
                        <p style="color: #666; font-size: 12px;">This link expires in 10 minutes.</p>
                    </div>
                    `
                );
            },
        }),
        apiKey(),
        organization({
            async sendInvitationEmail(data) {
                const inviteLink = `${env.BETTER_AUTH_URL}/auth/accept-invite?invitationId=${data.id}`;
                await sendAuthEmail(
                    data.email,
                    `You're Invited to Join ${data.organization.name}`,
                    `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Organization Invitation</h2>
                        <p>You've been invited to join <strong>${data.organization.name}</strong> as a ${data.role}.</p>
                        <p style="margin: 24px 0;">
                            <a href="${inviteLink}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                                Accept Invitation
                            </a>
                        </p>
                        <p style="color: #666; font-size: 12px;">This invitation expires in 48 hours.</p>
                    </div>
                    `
                );
            },
            membershipLimit: 20,
            // Hook: when a new org is created, initialize credits
            async createdOrganization(org: any) {
                try {
                    await initializeCredits(org.id);
                    console.log(`[auth] Credits initialized for org: ${org.id}`);
                } catch (err) {
                    console.error(`[auth] Failed to initialize credits for org ${org.id}:`, err);
                }
            },
        }),
        lastLoginMethod(),
    ],
});

export default auth;
