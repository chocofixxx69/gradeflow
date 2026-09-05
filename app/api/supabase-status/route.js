import { NextResponse } from 'next/server';
import { supabase, SUPABASE_READY } from '@/lib/supabase';
import { isUsingServiceRole } from '@/lib/analytics-data';

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

    // Without a service-role key every server route runs as anon, which the RLS
    // lockdown denies on results, subject_marks, academic_remarks, classes,
    // class_students and faculty_onboarding. Surfaced here so a misconfigured
    // deployment is one request away from being identified, instead of showing
    // up as empty analytics.
    const serviceRole = isUsingServiceRole();

    return NextResponse.json({
      status: error ? 'connected_pending_tables' : 'success',
      ready: SUPABASE_READY,
      supabaseUrl,
      dbStatus: error ? error.message : 'connected',
      serviceRoleConfigured: serviceRole,
      serviceRoleWarning: serviceRole
        ? null
        : 'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) is not set in this environment. Server routes are falling back to the anon key, which cannot read results, subject_marks, academic_remarks, classes, class_students or faculty_onboarding. Analytics and class rosters will be empty until it is set.',
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
