import { supabase } from './supabase';

/**
 * Logs a faculty action to the audit_logs table.
 * 
 * @param {object} params - { action_type, entity_type, entity_id, old_values, new_values, metadata }
 */
export async function logAuditAction({ action_type, entity_type, entity_id, old_values = null, new_values = null, metadata = {} }) {
    try {
        const sessionStr = typeof window !== 'undefined' ? localStorage.getItem('faculty_session') : null;
        const faculty = sessionStr ? JSON.parse(sessionStr) : null;
        
        const { error } = await supabase.from('audit_logs').insert({
            faculty_id: faculty?.id || 'ANONYMOUS',
            faculty_name: faculty?.full_name || faculty?.name || 'Unknown',
            faculty_email: faculty?.email || 'Unknown',
            action_type,
            entity_type,
            entity_id,
            old_values,
            new_values,
            metadata: {
                ...metadata,
                url: typeof window !== 'undefined' ? window.location.href : '',
                timestamp: new Date().toISOString()
            }
        });

        if (error) console.error('Audit Log Error:', error);
    } catch (err) {
        console.error('Audit Log Exception:', err);
    }
}
