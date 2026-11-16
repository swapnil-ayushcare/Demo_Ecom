import { NextResponse } from 'next/server';
import { query } from '@/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    await query('SELECT 1');
    return NextResponse.json({ status: 'ok', service: 'demo-ecom', database: 'up' });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'degraded',
        service: 'demo-ecom',
        database: 'down',
        message: error instanceof Error ? error.message : 'database unavailable',
      },
      { status: 503 },
    );
  }
}
