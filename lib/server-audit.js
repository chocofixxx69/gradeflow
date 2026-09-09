import { getAdminClient } from './analytics-data';

/**
 * Log a high-privilege administrative or system security action to audit_logs.
 * 
 * @param {object} params
 * @param {string} params.action - e.g. 'ADMIN_DELETE_STUDENT', 'ADMIN_PASSWORD_RESET', 'SETTINGS_UPDATE'
 * @param {string} [params.actor] - Email or identifier of actor (defaults to 'admin@anjuman.com')
 * @param {string} [params.actorRole] - 'admin' | 'system' | 'faculty'
 * @param {string} [params.severity] - 'INFO' | 'WARNING' | 'CRITICAL'
 * @param {string} [params.entityType] - 'student' | 'faculty' | 'settings' | 'ticket' | 'system'
 * @param {string} [params.entityId] - Target identifier (USN, email, ticket #)
 * @param {string} [params.description] - Human-readable summary
 * @param {object} [params.oldValues] - State before mutation
 * @param {object} [params.newValues] - State after mutation
 * @param {object} [params.metadata] - Additional contextual data
 * @param {string} [params.ipAddress] - Request IP
 * @param {string} [params.userId] - Optional UUID
 */
export async function logServerAudit({
    action,
    actor = 'admin@anjuman.com',
    actorRole = 'admin',
    severity = 'INFO',
    entityType = 'system',
    entityId = null,
    description = '',
    oldValues = null,
    newValues = null,
    metadata = {},
    ipAddress = null,
    userId = null,
}) {
    if (!action) return null;

    try {
        const supabase = getAdminClient();
        const details = {
            actor,
            actor_role: actorRole,
            severity,
            entity_type: entityType,
            entity_id: entityId,
            description,
            old_values: oldValues,
            new_values: newValues,
            metadata,
            timestamp: new Date().toISOString(),
        };

        const { data, error } = await supabase.from('audit_logs').insert({
            action,
            details,
            user_id: userId || null,
            ip_address: ipAddress || null,
        }).select();

        if (error) {
            console.error('[server-audit] Error inserting audit log:', error);
            return null;
        }

        return data?.[0] || null;
    } catch (err) {
        console.error('[server-audit] Exception while logging audit action:', err);
        return null;
    }
}

/**
 * Log a pedagogical, academic, or administrative action to `faculty_activity`
 * with complete 5W1H (Who, What, Where, When, Why, How) governance intelligence
 * and real-time faculty presence tracking.
 * 
 * @param {Request} [req] - Next.js HTTP Request object (for IP, User-Agent, and Session)
 * @param {object} options
 * @param {string} [options.faculty_id] - Explicit UUID of faculty
 * @param {string} [options.faculty_name] - Name of faculty
 * @param {string} options.action_type - e.g. 'CLASS_CREATE', 'CLASS_EDIT', 'CLASS_DELETE', 'CLASS_ADD_STUDENT', 'FACULTY_LOGIN', 'FACULTY_LOGOUT'
 * @param {string} [options.target_usn] - Student USN if target is a student
 * @param {string} [options.reason] - Pedagogical or institutional justification
 * @param {string} [options.context_module] - Module path where action occurred
 * @param {string} [options.method] - Execution pipeline (e.g. 'Interactive Web UI (Next.js)')
 * @param {string} [options.details] - Specific human-readable description of change
 * @param {object} [options.metadata] - Structured payload of changes/entities
 * @param {string} [options.sync_status] - 'SUCCESS' | 'ERROR' | 'PENDING'
 */
export async function logFacultyActivityServer(req, {
    faculty_id = null,
    faculty_name = null,
    action_type = 'VIEW_RECORD',
    target_usn = null,
    reason = null,
    context_module = null,
    method = 'Interactive Web UI (Next.js)',
    details = null,
    metadata = {},
    sync_status = 'SUCCESS',
} = {}) {
    if (!action_type) return null;

    try {
        const supabaseAdmin = getAdminClient();
        let staffSession = null;

        if (req) {
            try {
                const { getStaffSession } = await import('./server-session');
                staffSession = getStaffSession(req, 'faculty') || getStaffSession(req, 'admin') || getStaffSession(req);
            } catch {
                // Session lookup failed, continue with parameters
            }
        }

        // Resolve faculty ID & Name
        let resolvedFacId = faculty_id || staffSession?.sub || staffSession?.id || null;
        let resolvedFacName = faculty_name || staffSession?.name || staffSession?.full_name || staffSession?.email || null;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        let validFacId = (resolvedFacId && uuidRegex.test(String(resolvedFacId).trim())) ? String(resolvedFacId).trim() : null;

        // If no valid UUID yet, lookup faculty record by email
        if (!validFacId && staffSession?.email) {
            try {
                const { data: facRow } = await supabaseAdmin
                    .from('faculty_onboarding')
                    .select('id, full_name, department')
                    .eq('email', staffSession.email.toLowerCase().trim())
                    .maybeSingle();
                if (facRow?.id) {
                    validFacId = facRow.id;
                    if (!resolvedFacName) resolvedFacName = facRow.full_name;
                }
            } catch {}
        }

        const ipAddress = req?.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim() || req?.headers?.get?.('x-real-ip') || '127.0.0.1';
        const userAgent = req?.headers?.get?.('user-agent') || 'Interactive Web Client';

        const { data, error } = await supabaseAdmin.from('faculty_activity').insert({
            faculty_id: validFacId,
            faculty_name: resolvedFacName || 'Faculty Member',
            action_type,
            target_usn: target_usn ? String(target_usn).trim().toUpperCase() : null,
            reason: reason || 'Standard institutional academic administration and compliance monitoring.',
            context_module: context_module || 'Faculty Portal > Academic Operations',
            method: method || 'Interactive Web UI (Next.js)',
            details: details || `Recorded action ${action_type}`,
            metadata: metadata || {},
            sync_status,
            ip_address: ipAddress,
            user_agent: userAgent,
        }).select().single();

        if (error) {
            console.warn('[server-audit] faculty_activity insert notice:', error.message);
            return null;
        }

        // Real-time presence state synchronization
        if (validFacId) {
            try {
                const {
                    recordFacultyLogin,
                    recordFacultyLogout,
                    recordFacultyOffline,
                    recordFacultyHeartbeat,
                } = await import('./presence-tracker');

                if (action_type === 'FACULTY_LOGIN' || action_type === 'FACULTY_CHECKIN') {
                    recordFacultyLogin({
                        faculty_id: validFacId,
                        faculty_name: resolvedFacName,
                        ip_address: ipAddress,
                        user_agent: userAgent,
                    });
                } else if (action_type === 'FACULTY_LOGOUT' || action_type === 'FACULTY_CHECKOUT') {
                    recordFacultyLogout({
                        faculty_id: validFacId,
                        faculty_name: resolvedFacName,
                        ip_address: ipAddress,
                        user_agent: userAgent,
                    });
                } else if (action_type === 'FACULTY_OFFLINE') {
                    await recordFacultyOffline({
                        faculty_id: validFacId,
                        faculty_name: resolvedFacName,
                        ip_address: ipAddress,
                        user_agent: userAgent,
                    });
                } else {
                    await recordFacultyHeartbeat({
                        faculty_id: validFacId,
                        faculty_name: resolvedFacName,
                        ip_address: ipAddress,
                        user_agent: userAgent,
                    });
                }
            } catch (presErr) {
                // non-fatal
            }
        }

        return data;
    } catch (err) {
        console.warn('[server-audit] Exception logging faculty_activity:', err?.message || err);
        return null;
    }
}
