import { NextResponse } from 'next/server';
import { supabase, SUPABASE_READY } from '@/lib/supabase';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isConfigured = Boolean(supabaseUrl && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    if (!isConfigured) {
      return NextResponse.json({
        status: 'error',
        message: 'Supabase credentials missing in environment variables.',
        ready: false
      }, { status: 500 });
    }

    // Ping Supabase
    const { data, error } = await supabase.from('vtu_result_urls').select('count', { count: 'exact', head: true });

    return NextResponse.json({
      status: error ? 'connected_pending_tables' : 'success',
      ready: SUPABASE_READY,
      supabaseUrl,
      dbStatus: error ? error.message : 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      message: err.message,
      ready: false
    }, { status: 500 });
  }
}
