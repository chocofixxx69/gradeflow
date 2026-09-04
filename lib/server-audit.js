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
