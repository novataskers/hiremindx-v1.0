import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { NextRequest } from 'next/server';
import { headers } from "next/headers"
import { db } from "@/db";
 
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
				"https://www.googleapis.com/auth/gmail.send"
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
					try {
						const { linkBetaSignup } = await import("@/lib/beta-link");
						if (user.email) {
							await linkBetaSignup(user.id, user.email);
						}
					} catch (e) {
						console.error("[auth-hook] beta link failed:", e);
					}

					// Fallback: send welcome email if webhook already fired but user wasn't linked yet
					try {
						if (!user.email) return;
						const { eq } = await import("drizzle-orm");
						const { betaSignups } = await import("@/db/schema");
						const { db } = await import("@/db");
						const { sendHireMindXEmailNotification } = await import("@/lib/email");
						const { randomUUID } = await import("crypto");
						const betaEmail = user.email.trim().toLowerCase();
						const betaRows = await db
							.select()
							.from(betaSignups)
							.where(eq(betaSignups.email, betaEmail))
							.limit(1);
						const betaRow = betaRows[0];
						if (betaRow && !betaRow.welcomeEmailSent && betaRow.name) {
							let referralCode = betaRow.referralCode;
							if (!referralCode) {
								referralCode = randomUUID().replace(/-/g, "").slice(0, 12);
								await db.update(betaSignups).set({ referralCode }).where(eq(betaSignups.email, betaEmail));
							}
							const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "https://www.hiremindx.com";
							console.log(`[auth-hook] Sending delayed welcome email to: ${betaEmail}, founder #${betaRow.signupOrder}`);
							const emailResult = await sendHireMindXEmailNotification({
								to: betaEmail,
								subject: `Welcome to HireMindX — You're Founding Member #${betaRow.signupOrder}!`,
								title: "You're One of the First 100",
								summary: `Congratulations ${betaRow.name}, you've secured your place as Founding Member #${betaRow.signupOrder} of HireMindX. Your 14-day free Elite trial has started, and you're locked in at £9.99/month (50% off) for life.`,
								previewText: `Welcome to HireMindX — You're Founding Member #${betaRow.signupOrder}!`,
								ctaLabel: "Start Using HireMindX",
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
							await db.update(betaSignups).set({ welcomeEmailSent: true }).where(eq(betaSignups.email, betaEmail));
						}
					} catch (emailError) {
						console.error("[auth-hook] Delayed welcome email failed:", emailError);
					}
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