import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { user } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { like, ne, and, or } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';

  try {
    const users = await db.select({
      id: user.id,
      name: user.name,
      image: user.image,
      email: user.email,
    })
    .from(user)
    .where(
      and(
        ne(user.id, currentUser.id),
        or(
          like(user.name, `%${q}%`),
          like(user.email, `%${q}%`)
        )
      )
    )
    .limit(20);

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
