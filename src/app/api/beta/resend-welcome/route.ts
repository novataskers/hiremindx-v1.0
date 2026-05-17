import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { betaSignups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendBetaWelcomeEmail } from "@/lib/email";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const betaEmail = session.user.email.trim().toLowerCase();

    const betaRows = await db
      .select()
      .from(betaSignups)
      .where(eq(betaSignups.email, betaEmail))
      .limit(1);

    const betaRow = betaRows[0];
    if (!betaRow) {
      return NextResponse.json({ error: "No beta signup found for your email" }, { status: 404 });
    }

    if (!betaRow.name) {
      return NextResponse.json({ error: "Beta signup has no name set" }, { status: 400 });
    }

    // Generate referral code if missing
    let referralCode = betaRow.referralCode;
    if (!referralCode) {
      referralCode = randomUUID().replace(/-/g, "").slice(0, 12);
      await db.update(betaSignups).set({ referralCode }).where(eq(betaSignups.email, betaEmail));
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "https://www.hiremindx.com";

    console.log(`[resend-welcome] Sending welcome email to: ${betaEmail}, founder #${betaRow.signupOrder}`);

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

    console.log(`[resend-welcome] Email result: success=${emailResult.success}, skipped=${emailResult.skipped}, messageId=${emailResult.messageId}, error=${emailResult.error}`);

    if (emailResult.success) {
      await db.update(betaSignups).set({ welcomeEmailSent: true }).where(eq(betaSignups.email, betaEmail));
      return NextResponse.json({ success: true, messageId: emailResult.messageId });
    }

    return NextResponse.json({
      success: false,
      error: emailResult.error || "Email failed to send",
      skipped: emailResult.skipped,
    }, { status: 500 });

  } catch (error) {
    console.error("[resend-welcome] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
