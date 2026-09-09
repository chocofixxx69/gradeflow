import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const supabase = getAdminClient();
        const facultyId = session?.sub || session?.id;
        const facultyEmail = session?.email?.toLowerCase()?.trim();

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(facultyId || '');

        // 1. Fetch faculty onboarding record
        let query = supabase.from('faculty_onboarding').select('id, full_name, email, department, designation, employee_id, phone, status, last_login_at, last_login_ip, created_at');
        if (isUuid) {
            query = query.eq('id', facultyId);
        } else if (facultyEmail) {
            query = query.eq('email', facultyEmail);
        } else {
            query = query.limit(1);
        }

        const { data: faculty, error: facultyErr } = await query.maybeSingle();
        if (facultyErr) {
            console.error('[GET /api/faculty/settings] Faculty fetch error:', facultyErr);
            return fail('Failed to fetch faculty profile record.', 'DATABASE_ERROR', 500);
        }

        if (!faculty) {
            if (session?.role === 'admin') {
                return ok({
                    profile: {
                        id: 'admin',
                        full_name: session?.name || 'Administrator',
                        email: session?.email || 'admin@anjuman.com',
                        department: 'Institutional Administration',
                        designation: 'System Administrator',
                        employee_id: 'ADMIN-01',
                        phone: '',
                        status: 'approved',
                        last_login_at: new Date().toISOString(),
                        last_login_ip: '127.0.0.1',
                        created_at: new Date().toISOString(),
                        photo_url: null,
                        office_location: 'Admin Directorate',
                        theme: 'system',
                        notifications: true,
                        compact_mode: false
                    },
                    stats: { assignedClasses: 0, assignedSubjects: 0, assignments: [] }
                });
            }
            return fail('Faculty account profile not found.', 'NOT_FOUND', 404);
        }

        // 2. Fetch persisted preferences & photo from system_settings
        const prefKey = `faculty_prefs_${faculty.id}`;
        const { data: prefRow } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', prefKey)
            .maybeSingle();

        const prefs = prefRow?.value || {};

        // 3. Aggregate teaching workload stats
        const [
            { count: assignedClassesCount },
            { count: assignedSubjectsCount },
            { data: assignmentList }
        ] = await Promise.all([
            supabase.from('classes').select('id', { count: 'exact', head: true }).eq('faculty_id', faculty.id),
            supabase.from('faculty_assignments').select('id', { count: 'exact', head: true }).eq('faculty_id', faculty.id),
            supabase.from('faculty_assignments').select('subject_code, branch, semester, scheme, classes(name, section, batch)').eq('faculty_id', faculty.id).limit(10)
        ]);

        const profile = {
            id: faculty.id,
            full_name: faculty.full_name,
            email: faculty.email,
            department: faculty.department,
            designation: faculty.designation || 'Faculty Member',
            employee_id: faculty.employee_id || '',
            phone: faculty.phone || '',
            status: faculty.status || 'approved',
            last_login_at: faculty.last_login_at,
            last_login_ip: faculty.last_login_ip,
            created_at: faculty.created_at,
            photo_url: prefs.photo_url || null,
            office_location: prefs.office_location || '',
            theme: prefs.theme || 'system',
            notifications: prefs.notifications ?? true,
            compact_mode: prefs.compact_mode ?? false,
        };

        const stats = {
            assignedClasses: assignedClassesCount || 0,
            assignedSubjects: assignedSubjectsCount || 0,
            assignments: (assignmentList || []).map(a => ({
                subject_code: a.subject_code,
                branch: a.branch,
                semester: a.semester,
                class_name: a.classes?.name || '',
                section: a.classes?.section || '',
                batch: a.classes?.batch || ''
            }))
        };

        return ok({ profile, stats });
    } catch (err) {
        console.error('[GET /api/faculty/settings]', err);
        return fail('Failed to load faculty settings.', 'SETTINGS_ERROR', 500);
    }
}

export async function PATCH(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const supabase = getAdminClient();
        const facultyId = session?.sub || session?.id;
        const facultyEmail = session?.email?.toLowerCase()?.trim();

        // 1. Locate existing faculty
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(facultyId || '');
        let query = supabase.from('faculty_onboarding').select('id, full_name, email, department, designation, employee_id, phone');
        if (isUuid) {
            query = query.eq('id', facultyId);
        } else if (facultyEmail) {
            query = query.eq('email', facultyEmail);
        }

        const { data: current, error: currentErr } = await query.maybeSingle();
        if (currentErr || !current) {
            return fail('Faculty account profile not found.', 'NOT_FOUND', 404);
        }

        const body = await req.json().catch(() => ({}));
        const {
            full_name,
            phone,
            department,
            designation,
            employee_id,
            photo_url,
            office_location,
            theme,
            notifications,
            compact_mode
        } = body;

        // 2. Prepare faculty_onboarding updates
        const onboardingUpdates = {};
        if (full_name !== undefined) onboardingUpdates.full_name = String(full_name).trim();
        if (phone !== undefined) onboardingUpdates.phone = String(phone).trim();
        if (department !== undefined) onboardingUpdates.department = String(department).trim();
        if (designation !== undefined) onboardingUpdates.designation = String(designation).trim();
        if (employee_id !== undefined) onboardingUpdates.employee_id = String(employee_id).trim();

        if (Object.keys(onboardingUpdates).length > 0) {
            const { error: updateErr } = await supabase
                .from('faculty_onboarding')
                .update(onboardingUpdates)
                .eq('id', current.id);

            if (updateErr) {
                console.error('[PATCH /api/faculty/settings] Update error:', updateErr);
                return fail('Failed to update faculty profile: ' + updateErr.message, 'DATABASE_ERROR', 500);
            }
        }

        // 3. Upsert extended preferences (photo, office, theme) into system_settings
        const prefKey = `faculty_prefs_${current.id}`;
        const { data: existingPrefRow } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', prefKey)
            .maybeSingle();

        const updatedPrefs = { ...(existingPrefRow?.value || {}) };
        if (photo_url !== undefined) updatedPrefs.photo_url = photo_url;
        if (office_location !== undefined) updatedPrefs.office_location = String(office_location).trim();
        if (theme !== undefined) updatedPrefs.theme = theme;
        if (notifications !== undefined) updatedPrefs.notifications = Boolean(notifications);
        if (compact_mode !== undefined) updatedPrefs.compact_mode = Boolean(compact_mode);

        await supabase.from('system_settings').upsert({
            key: prefKey,
            value: updatedPrefs,
            updated_at: new Date().toISOString(),
            updated_by: current.email
        });

        // 4. Audit activity log
        try {
            const clientIp = req ? getClientIp(req) : '127.0.0.1';
            const clientUa = req?.headers?.get ? (req.headers.get('user-agent') || 'Browser Client') : 'Browser Client';
            await supabase.from('faculty_activity').insert({
                faculty_id: current.id,
                faculty_name: onboardingUpdates.full_name || current.full_name,
                action_type: 'FACULTY_PROFILE_UPDATE',
                sync_status: 'SUCCESS',
                context_module: 'Faculty Portal > Profile Settings',
                reason: 'Faculty member updated personal and academic profile preferences.',
                method: 'Web Portal Form Submission',
                details: `${current.full_name} updated profile information.`,
                ip_address: clientIp,
                user_agent: clientUa,
                metadata: {
                    updated_fields: Object.keys(onboardingUpdates),
                    has_photo_update: photo_url !== undefined,
                }
            });
        } catch (auditErr) {
            console.warn('[PATCH /api/faculty/settings] Audit notice:', auditErr?.message);
        }

        return ok({
            message: 'Profile updated successfully!',
            profile: {
                ...current,
                ...onboardingUpdates,
                photo_url: updatedPrefs.photo_url || null,
                office_location: updatedPrefs.office_location || '',
                theme: updatedPrefs.theme || 'system',
                notifications: updatedPrefs.notifications ?? true,
                compact_mode: updatedPrefs.compact_mode ?? false
            }
        });
    } catch (err) {
        console.error('[PATCH /api/faculty/settings]', err);
        return fail('Failed to update faculty settings.', 'UPDATE_ERROR', 500);
    }
}
