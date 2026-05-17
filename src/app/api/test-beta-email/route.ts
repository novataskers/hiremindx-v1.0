import { NextRequest, NextResponse } from "next/server";
import { renderBetaWelcomeEmailTemplate } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rendered = renderBetaWelcomeEmailTemplate({
      to: "test@example.com",
      subject: "You're In! Welcome to HireMindX Founding Beta",
      title: "You're One of the First 100",
      summary: "Congratulations Test User, you've been selected as Founding Member #42 of HireMindX! As one of only 100 founding beta members, you've secured exclusive lifetime benefits: 50% discount (£9.99/month vs £19.99), 14-day free trial of Elite features, and priority access to new features.",
      previewText: "You're in! Welcome to HireMindX Founding Beta as Founding Member #42",
      ctaLabel: "Start Your Elite Trial",
      ctaUrl: "/assist",
      recipientName: "Test User",
      metadata: [
        { label: "Founder Number", value: "#42" },
        { label: "Plan", value: "Elite (Founding Member)" },
        { label: "Price", value: "£9.99/month (50% off for life)" },
        { label: "Free Trial", value: "14 days" },
        { label: "Trial Ends On", value: "30 May 2026" },
        { label: "Referral Link", value: "https://www.hiremindx.com/premium?ref=ABC123XYZ" },
        { label: "Referral Rewards", value: "Refer 1 = 1 free month | 5 = 3 more | 10 = 6 more + Badge + VIP Access" },
      ],
    });

    return new NextResponse(rendered.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error) {
    console.error("[test-beta-email] Error rendering template:", error);
    return NextResponse.json(
      { error: "Failed to render template", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
