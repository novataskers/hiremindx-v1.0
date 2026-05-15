import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { applications } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Get session from Authorization header
    const session = await auth.api.getSession({ 
      headers: request.headers 
    });

    if (!session || !session.user) {
      return NextResponse.json({ 
        error: 'Unauthorized',
        code: 'UNAUTHORIZED' 
      }, { status: 401 });
    }

    const userId = session.user.id;

    // Calculate statistics using SQL aggregation
    const stats = await db
      .select({
        total: sql<number>`COUNT(*)`,
        pending: sql<number>`SUM(CASE WHEN ${applications.status} = 'pending' THEN 1 ELSE 0 END)`,
        applied: sql<number>`SUM(CASE WHEN ${applications.status} = 'applied' THEN 1 ELSE 0 END)`,
        interview: sql<number>`SUM(CASE WHEN ${applications.status} = 'interview' THEN 1 ELSE 0 END)`,
        accepted: sql<number>`SUM(CASE WHEN ${applications.status} = 'accepted' THEN 1 ELSE 0 END)`,
        rejected: sql<number>`SUM(CASE WHEN ${applications.status} = 'rejected' THEN 1 ELSE 0 END)`,
      })
      .from(applications)
      .where(eq(applications.userId, userId));

    const statistics = stats[0] || {
      total: 0,
      pending: 0,
      applied: 0,
      interview: 0,
      accepted: 0,
      rejected: 0,
    };

    return NextResponse.json({
      total: Number(statistics.total) || 0,
      pending: Number(statistics.pending) || 0,
      applied: Number(statistics.applied) || 0,
      interview: Number(statistics.interview) || 0,
      accepted: Number(statistics.accepted) || 0,
      rejected: Number(statistics.rejected) || 0,
    }, { status: 200 });

  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error))
    }, { status: 500 });
  }
}