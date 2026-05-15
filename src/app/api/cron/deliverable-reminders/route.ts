import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deliverables, communityDMs, user } from "@/db/schema";
import { and, eq, lt } from "drizzle-orm";
import sendHireMindXEmailNotification from "@/lib/email";

export async function GET(req: NextRequest) {
  // Security: Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find deliverables that need 24h reminders
    const pendingDeliverables = await db
      .select()
      .from(deliverables)
      .where(
        and(
          eq(deliverables.status, "pending_review"),
          eq(deliverables.reminder24hSent, false),
          lt(deliverables.submittedAt, twentyFourHoursAgo.toISOString())
        )
      );

    let remindersSent = 0;
    let errors = 0;

    for (const deliverable of pendingDeliverables) {
      try {
        // Determine recipient based on deliverable type
        let recipientId: string;
        let recipientType: string;

        if (deliverable.type === "revision") {
          // Revision: freelancer needs to submit revision
          recipientId = deliverable.submittedBy;
          recipientType = "freelancer";
        } else {
          // Deliverable: client needs to review
          // Find the client from the contract message
          const [message] = await db
            .select()
            .from(communityDMs)
            .where(eq(communityDMs.id, deliverable.messageId));

          if (!message) {
            console.error(`[reminder] Message not found for deliverable ${deliverable.id}`);
            errors++;
            continue;
          }

          // Client is the receiver of the deliverable message
          recipientId = message.receiverId;
          recipientType = "client";
        }

        // Get recipient email
        const [recipient] = await db
          .select()
          .from(user)
          .where(eq(user.id, recipientId));

        if (!recipient || !recipient.email) {
          console.error(`[reminder] User or email not found for ${recipientId}`);
          errors++;
          continue;
        }

        // Skip demo users
        if (recipient.email.includes("demo") || recipient.email.includes("@hiremindx.demo")) {
          console.log(`[reminder] Skipping demo user: ${recipient.email}`);
          continue;
        }

        // Send reminder email
        const emailResult = await sendHireMindXEmailNotification({
          to: recipient.email,
          subject: "Reminder: Action Required",
          title: "24 Hours Remaining",
          summary:
            deliverable.type === "revision"
              ? "You have 24 hours remaining to submit your revision."
              : "You have 24 hours remaining to review this deliverable.",
          ctaLabel: "View Contract",
          ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.hiremindx.com"}/community`,
          recipientName: recipient.name || "User",
        });

        if (emailResult.success) {
          console.log(`[reminder] Email sent to ${recipient.email} for deliverable ${deliverable.id}`);
          remindersSent++;

          // Mark reminder as sent
          await db
            .update(deliverables)
            .set({ reminder24hSent: true })
            .where(eq(deliverables.id, deliverable.id));
        } else {
          console.error(`[reminder] Email failed for ${recipient.email}:`, emailResult.error);
          errors++;
        }
      } catch (err) {
        console.error(`[reminder] Error processing deliverable ${deliverable.id}:`, err);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      remindersSent,
      errors,
      totalProcessed: pendingDeliverables.length,
    });
  } catch (error: any) {
    console.error("[reminder] Cron job failed:", error);
    return NextResponse.json(
      { error: "Cron job failed", details: error.message },
      { status: 500 }
    );
  }
}
