import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { emailCampaigns } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Calculate statistics using SQL aggregation in a single query
    const stats = await db
      .select({
        total: sql<number>`COUNT(*)`,
        sent: sql<number>`SUM(CASE WHEN ${emailCampaigns.status} IN ('sent', 'delivered', 'opened', 'replied') THEN 1 ELSE 0 END)`,
        opened: sql<number>`SUM(CASE WHEN ${emailCampaigns.status} IN ('opened', 'replied') THEN 1 ELSE 0 END)`,
        replied: sql<number>`SUM(CASE WHEN ${emailCampaigns.status} = 'replied' THEN 1 ELSE 0 END)`,
        bounced: sql<number>`SUM(CASE WHEN ${emailCampaigns.status} = 'bounced' THEN 1 ELSE 0 END)`,
        draft: sql<number>`SUM(CASE WHEN ${emailCampaigns.status} = 'draft' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${emailCampaigns.status} = 'failed' THEN 1 ELSE 0 END)`,
      })
      .from(emailCampaigns)
      .where(eq(emailCampaigns.userId, userId));

    // Ensure we have a result
    if (!stats || stats.length === 0) {
      return NextResponse.json({
        total: 0,
        sent: 0,
        opened: 0,
        replied: 0,
        bounced: 0,
        draft: 0,
        failed: 0,
      });
    }

    // Convert SQL aggregation results to numbers for type safety
    const statistics = {
      total: Number(stats[0].total) || 0,
      sent: Number(stats[0].sent) || 0,
      opened: Number(stats[0].opened) || 0,
      replied: Number(stats[0].replied) || 0,
      bounced: Number(stats[0].bounced) || 0,
      draft: Number(stats[0].draft) || 0,
      failed: Number(stats[0].failed) || 0,
    };

    return NextResponse.json(statistics);
  } catch (error) {
    console.error('GET email campaign statistics error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error'),
        code: 'INTERNAL_SERVER_ERROR',
      },
      { status: 500 }
    );
  }
}