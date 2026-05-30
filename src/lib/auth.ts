import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { NextRequest } from 'next/server';
import { headers } from "next/headers"
import { db } from "@/db";
import { user, session, account, verification } from "@/db/schema";
 
export const getBaseURL = () => {
	let url = "";
	if (process.env.BETTER_AUTH_URL && !process.env.BETTER_AUTH_URL.includes("localhost")) {
		url = process.env.BETTER_AUTH_URL;
	} else if (process.env.VERCEL === "1") {
		url = "https://hiremindx.com";
	} else if (process.env.VERCEL_URL) {
		url = "https://hiremindx.com";
	} else {
		url = process.env.BETTER_AUTH_URL || "http://localhost:3000";
	}
	return url.trim();
};

export const auth = betterAuth({
	baseURL: getBaseURL(),
	trustedOrigins: [
		"http://localhost:3000",
		"http://192.168.1.102:3000",
		"https://hiremindx.com",
		"https://www.hiremindx.com"
	],
	database: drizzleAdapter(db, {
		provider: "sqlite",
		schema: { user, session, account, verification },
	}),
	emailAndPassword: {    
		enabled: true
	},
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
			scope: [
				"https://www.googleapis.com/auth/userinfo.email",
				"https://www.googleapis.com/auth/userinfo.profile",
				"https://www.googleapis.com/auth/gmail.send",
				"https://www.googleapis.com/auth/gmail.readonly",
				"https://www.googleapis.com/auth/gmail.modify",
				"https://www.googleapis.com/auth/calendar",
				"https://www.googleapis.com/auth/tasks",
				"https://www.googleapis.com/auth/contacts.readonly"
			],
			accessType: "offline",
			prompt: "consent",
		},
		microsoft: {
			clientId: process.env.MICROSOFT_CLIENT_ID || "",
			clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
			tenantId: process.env.MICROSOFT_TENANT_ID || "common",
			scope: [
				"openid",
				"profile",
				"email",
				"offline_access",
				"https://graph.microsoft.com/Mail.Send",
				"https://graph.microsoft.com/Mail.Read",
				"https://graph.microsoft.com/Mail.ReadWrite",
				"https://graph.microsoft.com/Calendars.ReadWrite",
				"https://graph.microsoft.com/Contacts.Read",
				"https://graph.microsoft.com/Tasks.ReadWrite",
			],
			prompt: "consent",
		},
	},
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google", "microsoft"],
		},
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					// IMPORTANT: This hook runs INSIDE the createOAuthUser transaction.
					// Any DB writes via the global `db` will deadlock (blocked by tx write lock).
					// So we fire-and-forget all post-creation work to avoid blocking the transaction.
					const doPostCreateWork = async () => {
						try {
							const { linkBetaSignup } = await import("@/lib/beta-link");
							if (user.email) {
								await linkBetaSignup(user.id, user.email);
							}
						} catch (e) {
							console.error("[auth-hook] beta link failed:", e);
						}

						try {
							if (!user.email) return;
							const { eq } = await import("drizzle-orm");
							const { betaSignups } = await import("@/db/schema");
							const { db } = await import("@/db");
							const { sendBetaWelcomeEmail } = await import("@/lib/email");
							const { randomUUID } = await import("crypto");
							const betaEmail = user.email.trim().toLowerCase();
							const betaRows = await db
								.select()
								.from(betaSignups)
								.where(eq(betaSignups.email, betaEmail))
								.limit(1);
							const betaRow = betaRows[0];
							if (betaRow && !betaRow.welcomeEmailSent && betaRow.name && (betaRow.status === "trialing" || betaRow.status === "active")) {
								let referralCode = betaRow.referralCode;
								if (!referralCode) {
									referralCode = randomUUID().replace(/-/g, "").slice(0, 12);
									await db.update(betaSignups).set({ referralCode }).where(eq(betaSignups.email, betaEmail));
								}
								const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "https://www.hiremindx.com";
								console.log(`[auth-hook] Sending delayed welcome email to: ${betaEmail}, founder #${betaRow.signupOrder}`);
								const emailResult = await sendBetaWelcomeEmail({
									to: betaEmail,
									subject: `You're In! Welcome to HireMindX Founding Beta`,
									title: "You're One of the First 100",
									summary: `Congratulations ${betaRow.name}, you've been selected as Founding Member #${betaRow.signupOrder} of HireMindX! As one of only 100 founding beta members, you've secured exclusive lifetime benefits: 50% discount (£9.99/month vs £19.99), 14-day free trial of Elite features, and priority access to new features.`,
									previewText: `You're in! Welcome to HireMindX Founding Beta as Founding Member #${betaRow.signupOrder}`,
									ctaLabel: "Start Your Elite Trial",
									ctaUrl: "/assist",
									recipientName: betaRow.name,
									metadata: [
										{ label: "Founder Number", value: `#${betaRow.signupOrder}` },
										{ label: "Plan", value: "Elite (Founding Member)" },
										{ label: "Price", value: "£9.99/month (50% off for life)" },
										{ label: "Free Trial", value: "14 days" },
										{ label: "Referral Link", value: `${siteUrl.replace(/\/$/, "")}/premium?ref=${referralCode}` },
										{ label: "Referral Rewards", value: "Refer 1 = 1 free month | 5 = 3 more | 10 = 6 more + Badge + VIP Access" },
									],
								});
								console.log(`[auth-hook] Welcome email result: success=${emailResult.success}, skipped=${emailResult.skipped}, messageId=${emailResult.messageId}, error=${emailResult.error}`);
								if (emailResult.success) {
									await db.update(betaSignups).set({ welcomeEmailSent: true }).where(eq(betaSignups.email, betaEmail));
									console.log("[auth-hook] welcomeEmailSent set to true");
								} else {
									console.warn("[auth-hook] Email did not send successfully, keeping welcomeEmailSent=false for retry");
								}
							}
						} catch (emailError) {
							console.error("[auth-hook] Delayed welcome email failed:", emailError);
						}
					};

					// Fire-and-forget: don't await, so the transaction can commit immediately
					doPostCreateWork().catch((e) =>
						console.error("[auth-hook] post-create work failed:", e)
					);
				},
			},
		},
	},
	plugins: [bearer()]
});

// Session validation helper
export async function getCurrentUser(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user || null;
}