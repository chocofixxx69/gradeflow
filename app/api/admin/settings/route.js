import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/analytics-data';
import { requireStaff } from '../../../../lib/server-session';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req);
        if (authError && process.env.NODE_ENV === 'production') {
            return authError;
        }

        const { data: rows, error } = await supabaseAdmin
            .from('system_settings')
            .select('key, value, updated_at, updated_by');

        const map = new Map((rows || []).map(r => [r.key, r.value]));

        const defaultProfile = {
            institution_name: 'Anjuman Institute of Technology and Management',
            institution_code: 'AITM',
            affiliation: 'Visvesvaraya Technological University (VTU)',
            environment: 'GradeFlow Intelligence Suite',
            primary_region: 'South Asia (VTU-HQ)',
            academic_year: '2024-2025',
            default_scheme: '2022'
        };

        const defaultSecurity = {
            system_access_token: process.env.NEXT_PUBLIC_ADMIN_GATEKEEPER || 'GF-ADMIN-PROD',
            session_expiry_hours: 24,
            require_gatekeeper: true
        };

        const profile = map.get('institutional_profile') || defaultProfile;
        const security = map.get('security_auth') || defaultSecurity;

        return NextResponse.json({
            success: true,
            settings: {
                profile,
                security
            }
        });
    } catch (err) {
        console.error('[GET /api/admin/settings]', err);
        return NextResponse.json({ error: 'Failed to load system settings.' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { session, error: authError } = requireStaff(req);
        if (authError && process.env.NODE_ENV === 'production') {
            return authError;
        }

        const body = await req.json().catch(() => ({}));
        const { profile, security } = body || {};

        if (profile) {
            const cleanProfile = {
                institution_name: String(profile.institution_name || '').trim(),
                institution_code: String(profile.institution_code || '').trim(),
                affiliation: String(profile.affiliation || '').trim(),
                environment: String(profile.environment || 'GradeFlow Intelligence Suite').trim(),
                primary_region: String(profile.primary_region || 'South Asia (VTU-HQ)').trim(),
                academic_year: String(profile.academic_year || '2024-2025').trim(),
                default_scheme: String(profile.default_scheme || '2022').trim(),
            };

            await supabaseAdmin.from('system_settings').upsert({
                key: 'institutional_profile',
                value: cleanProfile,
                updated_at: new Date().toISOString(),
                updated_by: session?.email || 'admin'
            });
        }

        if (security) {
            const rawToken = String(security.system_access_token || '').trim();
            if (!rawToken) {
                return NextResponse.json({ error: 'System Access Token cannot be empty.' }, { status: 400 });
            }

            const cleanSecurity = {
                system_access_token: rawToken,
                session_expiry_hours: Number(security.session_expiry_hours) || 24,
                require_gatekeeper: security.require_gatekeeper !== false
            };

            await supabaseAdmin.from('system_settings').upsert({
                key: 'security_auth',
                value: cleanSecurity,
                updated_at: new Date().toISOString(),
                updated_by: session?.email || 'admin'
            });
        }

        return NextResponse.json({
            success: true,
            message: 'System settings saved successfully.'
        });
    } catch (err) {
        console.error('[POST /api/admin/settings]', err);
        return NextResponse.json({ error: 'Failed to update system settings.' }, { status: 500 });
    }
}
