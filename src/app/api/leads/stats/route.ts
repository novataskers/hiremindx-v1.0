import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { leads } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Authenticate user using better-auth session
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Calculate statistics using SQL aggregation in a single query
    const statsResult = await db
      .select({
        total: sql<number>`COUNT(*)`,
        new: sql<number>`SUM(CASE WHEN ${leads.status} = 'new' THEN 1 ELSE 0 END)`,
        contacted: sql<number>`SUM(CASE WHEN ${leads.status} = 'contacted' THEN 1 ELSE 0 END)`,
        replied: sql<number>`SUM(CASE WHEN ${leads.status} = 'replied' THEN 1 ELSE 0 END)`,
        qualified: sql<number>`SUM(CASE WHEN ${leads.status} = 'qualified' THEN 1 ELSE 0 END)`,
        rejected: sql<number>`SUM(CASE WHEN ${leads.status} = 'rejected' THEN 1 ELSE 0 END)`,
      })
      .from(leads)
      .where(eq(leads.userId, session.user.id));

    // Handle empty results (return all zeros)
    if (!statsResult || statsResult.length === 0) {
      return NextResponse.json({
        total: 0,
        new: 0,
        contacted: 0,
        replied: 0,
        qualified: 0,
        rejected: 0,
      });
    }

    // Convert results to numbers and return as JSON
    const stats = statsResult[0];
    return NextResponse.json({
      total: Number(stats.total) || 0,
      new: Number(stats.new) || 0,
      contacted: Number(stats.contacted) || 0,
      replied: Number(stats.replied) || 0,
      qualified: Number(stats.qualified) || 0,
      rejected: Number(stats.rejected) || 0,
    });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}