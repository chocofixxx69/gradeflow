import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAdmin } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function generateAccessKey() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const randPart1 = Array.from(crypto.randomBytes(6)).map(b => chars[b % chars.length]).join('');
    const randPart2 = Array.from(crypto.randomBytes(6)).map(b => chars[b % chars.length]).join('');
    return `GF-${randPart1}-${randPart2}`;
}

export async function POST(req) {
    try {
        const { session, error: authError } = requireAdmin(req);
        if (authError && process.env.NODE_ENV === 'production') {
            return authError;
        }

        const body = await req.json().catch(() => ({}));
        const { action, id, ids, reason } = body || {};

        if (!action) {
            return NextResponse.json({ error: 'Action parameter is required.' }, { status: 400 });
        }

        // 1. Create / Onboard Faculty Member directly
        if (action === 'create_faculty') {
            const { full_name, email, department, designation, employee_id, phone } = body || {};
            const cleanEmail = String(email || '').toLowerCase().trim();
            const cleanName = String(full_name || '').trim();

            if (!cleanEmail || !cleanName) {
                return NextResponse.json({ error: 'Full Name and Email are required.' }, { status: 400 });
            }

            // Check duplicate email
            const { data: existing } = await supabaseAdmin
                .from('faculty_onboarding')
                .select('id, email')
                .eq('email', cleanEmail)
                .maybeSingle();

            if (existing) {
                return NextResponse.json({ error: `A faculty account with email "${cleanEmail}" already exists.` }, { status: 409 });
            }

            const newAccessKey = generateAccessKey();

            const { data: newFaculty, error: insertErr } = await supabaseAdmin
                .from('faculty_onboarding')
                .insert({
                    full_name: cleanName,
                    email: cleanEmail,
                    department: department || 'General Engineering',
                    designation: designation || 'Assistant Professor',
                    employee_id: employee_id || null,
                    phone: phone || null,
                    status: 'approved',
                    generated_access_key: newAccessKey,
                    approved_at: new Date().toISOString()
                })
                .select()
                .single();

            if (insertErr) throw insertErr;

            return NextResponse.json({
                success: true,
                faculty: newFaculty,
                access_key: newAccessKey,
                message: `Faculty member "${cleanName}" onboarded successfully with Access Key ${newAccessKey}.`
            });
        }

        // 2. Suspend / Restore (Toggle) Single Faculty Account
        if (action === 'toggle_suspend' || action === 'suspend' || action === 'restore') {
            if (!id) return NextResponse.json({ error: 'Faculty ID is required.' }, { status: 400 });

            const { data: faculty } = await supabaseAdmin
                .from('faculty_onboarding')
                .select('id, full_name, email, status')
                .eq('id', id)
                .maybeSingle();

            if (!faculty) return NextResponse.json({ error: 'Faculty member not found.' }, { status: 404 });

            let newStatus;
            if (action === 'suspend') newStatus = 'suspended';
            else if (action === 'restore') newStatus = 'approved';
            else newStatus = faculty.status === 'suspended' ? 'approved' : 'suspended';

            const isSuspending = newStatus === 'suspended';

            const { error: updErr } = await supabaseAdmin
                .from('faculty_onboarding')
                .update({
                    status: newStatus,
                    suspended_at: isSuspending ? new Date().toISOString() : null,
                    suspended_reason: isSuspending ? (reason || 'Account suspended by Institution Administrator.') : null
                })
                .eq('id', id);

            if (updErr) throw updErr;

            return NextResponse.json({
                success: true,
                status: newStatus,
                message: isSuspending
                    ? `Faculty "${faculty.full_name}" access has been suspended.`
                    : `Faculty "${faculty.full_name}" access has been restored.`
            });
        }

        // 3. Regenerate Access Key
        if (action === 'regenerate_key') {
            if (!id) return NextResponse.json({ error: 'Faculty ID is required.' }, { status: 400 });

            const newAccessKey = generateAccessKey();
            const { error: updErr } = await supabaseAdmin
                .from('faculty_onboarding')
                .update({
                    generated_access_key: newAccessKey,
                    password: null,
                    password_hash: null,
                    status: 'approved'
                })
                .eq('id', id);

            if (updErr) throw updErr;

            return NextResponse.json({
                success: true,
                generated_access_key: newAccessKey,
                message: `New Access Key ${newAccessKey} generated. Existing password has been reset.`
            });
        }

        // 4. Edit Faculty Details
        if (action === 'edit_faculty') {
            if (!id) return NextResponse.json({ error: 'Faculty ID is required.' }, { status: 400 });
            const { full_name, email, department, designation, employee_id, phone } = body || {};

            const updateData = {};
            if (full_name !== undefined) updateData.full_name = String(full_name).trim();
            if (email !== undefined) updateData.email = String(email).toLowerCase().trim();
            if (department !== undefined) updateData.department = String(department).trim();
            if (designation !== undefined) updateData.designation = String(designation).trim();
            if (employee_id !== undefined) updateData.employee_id = String(employee_id).trim() || null;
            if (phone !== undefined) updateData.phone = String(phone).trim() || null;

            const { error: updErr } = await supabaseAdmin
                .from('faculty_onboarding')
                .update(updateData)
                .eq('id', id);

            if (updErr) throw updErr;

            return NextResponse.json({
                success: true,
                message: 'Faculty profile updated successfully.'
            });
        }

        // 5. Bulk Suspend Faculty
        if (action === 'bulk_suspend') {
            const targetIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
            if (targetIds.length === 0) return NextResponse.json({ error: 'No IDs provided.' }, { status: 400 });

            const { error: updErr } = await supabaseAdmin
                .from('faculty_onboarding')
                .update({
                    status: 'suspended',
                    suspended_at: new Date().toISOString(),
                    suspended_reason: reason || 'Batch suspension by Administrator.'
                })
                .in('id', targetIds);

            if (updErr) throw updErr;

            return NextResponse.json({
                success: true,
                count: targetIds.length,
                message: `Suspended ${targetIds.length} faculty account(s).`
            });
        }

        // 6. Bulk Restore / Approve Faculty
        if (action === 'bulk_restore' || action === 'bulk_approve') {
            const targetIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
            if (targetIds.length === 0) return NextResponse.json({ error: 'No IDs provided.' }, { status: 400 });

            const { error: updErr } = await supabaseAdmin
                .from('faculty_onboarding')
                .update({
                    status: 'approved',
                    suspended_at: null,
                    suspended_reason: null,
                    approved_at: new Date().toISOString()
                })
                .in('id', targetIds);

            if (updErr) throw updErr;

            return NextResponse.json({
                success: true,
                count: targetIds.length,
                message: `Approved / Restored ${targetIds.length} faculty account(s).`
            });
        }

        // 7. Delete Faculty Member
        if (action === 'delete_faculty' || action === 'bulk_delete') {
            const targetIds = Array.isArray(ids) ? ids.filter(Boolean) : (id ? [id] : []);
            if (targetIds.length === 0) return NextResponse.json({ error: 'No IDs provided.' }, { status: 400 });

            // Unlink classes assigned to this faculty to prevent foreign key errors
            await supabaseAdmin
                .from('classes')
                .update({ faculty_id: null })
                .in('faculty_id', targetIds);

            // Remove subject assignments
            try {
                await supabaseAdmin
                    .from('faculty_subject_assignments')
                    .delete()
                    .in('faculty_id', targetIds);
            } catch (e) {}

            const { error: delErr } = await supabaseAdmin
                .from('faculty_onboarding')
                .delete()
                .in('id', targetIds);

            if (delErr) throw delErr;

            return NextResponse.json({
                success: true,
                count: targetIds.length,
                message: `Permanently removed ${targetIds.length} faculty record(s).`
            });
        }

        return NextResponse.json({ error: 'Unknown action specified.' }, { status: 400 });
    } catch (err) {
        console.error('[POST /api/admin/faculty-action]', err);
        return NextResponse.json({ error: 'Failed to process faculty administrative action: ' + (err.message || '') }, { status: 500 });
    }
}
