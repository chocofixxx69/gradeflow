import { apiRequest } from './client';

export const getExamSessions = () => apiRequest('/api/admin/exam-sessions');
export const createExamSession = (name) => apiRequest('/api/admin/exam-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
export const updateExamSession = (id, name) => apiRequest('/api/admin/exam-sessions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name }) });
export const deleteExamSession = (id) => apiRequest('/api/admin/exam-sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });

export const getFacultyAssignments = () => apiRequest('/api/admin/faculty-assignments');
export const createFacultyAssignment = (assignment) => apiRequest('/api/admin/faculty-assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assignment) });
export const deleteFacultyAssignment = (id) => apiRequest('/api/admin/faculty-assignments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
