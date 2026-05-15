import { NextRequest, NextResponse } from "next/server";

const pendingResponses = new Map<string, { response: string; timestamp: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pendingResponses.entries()) {
    if (now - value.timestamp > 5 * 60 * 1000) {
      pendingResponses.delete(key);
    }
  }
}, 60 * 1000);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, response } = body;

    if (!requestId) {
      const text = typeof body === 'string' ? body : body.response || body.output || body.message || JSON.stringify(body);
      return NextResponse.json({ received: true, note: "No requestId provided", text });
    }

    pendingResponses.set(requestId, {
      response: response || body.output || body.message || JSON.stringify(body),
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true, requestId });
  } catch (error) {
    console.error('Callback error:', error);
    return NextResponse.json({ error: "Failed to process callback" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get('requestId');
  
  if (!requestId) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }

  const pending = pendingResponses.get(requestId);
  
  if (pending) {
    pendingResponses.delete(requestId);
    return NextResponse.json({ found: true, response: pending.response });
  }

  return NextResponse.json({ found: false });
}
