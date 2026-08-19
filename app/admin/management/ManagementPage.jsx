'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '../../../components/AuthGuard';
import { Button, ConfirmDialog, EmptyState, Input, LoadingState, SearchInput, Select } from '../../../components/ui';
import {
    createExamSession, createFacultyAssignment, deleteExamSession, deleteFacultyAssignment,
    getExamSessions, getFacultyAssignments, updateExamSession,
} from '../../../lib/api/admin-management';
import styles from './AdminManagement.module.css';

const EMPTY_ASSIGNMENT = { faculty_id: '', subject_code: '', branch: '', semester: '', scheme: '', class_id: '' };

function Message({ message }) {
    if (!message) return null;
    return <div className={`${styles.message} ${message.type === 'error' ? styles.error : styles.success}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</div>;
}

function ExamSessions() {
    const [sessions, setSessions] = useState([]); const [name, setName] = useState(''); const [editing, setEditing] = useState(null);
    const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(null); const [confirming, setConfirming] = useState(null);
    const load = async () => { setLoading(true); try { const data = await getExamSessions(); setSessions(data.sessions || []); } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setLoading(false); } };
    useEffect(() => { load(); }, []);
    const visible = useMemo(() => sessions.filter(s => (s.name || '').toLowerCase().includes(query.toLowerCase())), [sessions, query]);
    const submit = async (event) => { event.preventDefault(); setSaving(true); setMessage(null); try { if (editing) { const data = await updateExamSession(editing.id, name); setSessions(current => current.map(s => s.id === editing.id ? data.session : s)); setMessage({ type: 'success', text: 'Exam session updated.' }); } else { const data = await createExamSession(name); setSessions(current => [...current, data.session]); setMessage({ type: 'success', text: 'Exam session created.' }); } setName(''); setEditing(null); } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setSaving(false); } };
    const remove = async () => { setSaving(true); try { await deleteExamSession(confirming.id); setSessions(current => current.filter(s => s.id !== confirming.id)); setMessage({ type: 'success', text: 'Exam session deleted.' }); setConfirming(null); } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setSaving(false); } };
    return <>
        <header className={styles.header}><div><div className={styles.eyebrow}>Academic management</div><h1 className={styles.title}>Exam Sessions</h1><p className={styles.description}>Maintain the sessions available for result analysis and reporting.</p></div></header>
        <Message message={message} />
        <form className={`${styles.panel} ${styles.form}`} onSubmit={submit}><Input label={editing ? 'Edit session name' : 'Session name'} value={name} onChange={e => setName(e.target.value)} required /><div className={styles.formActions}><Button type="submit" loading={saving}>{editing ? 'Save changes' : 'Create session'}</Button>{editing && <Button variant="secondary" onClick={() => { setEditing(null); setName(''); }}>Cancel</Button>}</div></form>
        <section className={styles.panel} aria-busy={loading}><div className={styles.toolbar}><SearchInput value={query} onChange={setQuery} aria-label="Search exam sessions" placeholder="Search sessions" /><Button variant="secondary" onClick={load} loading={loading} iconStart="refresh">Refresh</Button></div>{loading ? <LoadingState label="Loading exam sessions" /> : visible.length === 0 ? <EmptyState variant="inline" icon="event" title="No exam sessions found" description="Create an exam session to use it in result analysis." /> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">Session</th><th scope="col">Actions</th></tr></thead><tbody>{visible.map(session => <tr key={session.id}><td>{session.name}</td><td><div className={styles.actions}><Button size="sm" variant="ghost" onClick={() => { setEditing(session); setName(session.name || ''); }}>Edit</Button><Button size="sm" variant="danger" onClick={() => setConfirming(session)}>Delete</Button></div></td></tr>)}</tbody></table></div>}</section>
        <ConfirmDialog open={Boolean(confirming)} title="Delete exam session?" description={`This will permanently delete ${confirming?.name || 'this exam session'}.`} busy={saving} onCancel={() => setConfirming(null)} onConfirm={remove} />
    </>;
}

function FacultyAssignments() {
    const [data, setData] = useState({ assignments: [], faculty: [], classes: [], subjects: [] }); const [form, setForm] = useState(EMPTY_ASSIGNMENT); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(null); const [confirming, setConfirming] = useState(null);
    const load = async () => { setLoading(true); try { setData(await getFacultyAssignments()); } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setLoading(false); } };
    useEffect(() => { load(); }, []);
    const facultyById = useMemo(() => new Map(data.faculty.map(item => [item.id, item])), [data.faculty]); const classById = useMemo(() => new Map(data.classes.map(item => [item.id, item])), [data.classes]);
    const filteredSubjects = useMemo(() => data.subjects.filter(s => (!form.branch || s.branch === form.branch) && (!form.semester || String(s.semester) === String(form.semester)) && (!form.scheme || s.scheme === form.scheme)), [data.subjects, form]);
    const visible = useMemo(() => data.assignments.filter(a => `${a.subject_code} ${a.branch} ${facultyById.get(a.faculty_id)?.full_name || ''}`.toLowerCase().includes(query.toLowerCase())), [data.assignments, facultyById, query]);
    const setField = (field) => (event) => setForm(current => ({ ...current, [field]: event.target.value }));
    const submit = async (event) => { event.preventDefault(); setSaving(true); setMessage(null); try { const result = await createFacultyAssignment(form); setData(current => ({ ...current, assignments: [...current.assignments, result.assignment] })); setForm(EMPTY_ASSIGNMENT); setMessage({ type: 'success', text: 'Faculty assignment created.' }); } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setSaving(false); } };
    const remove = async () => { setSaving(true); try { await deleteFacultyAssignment(confirming.id); setData(current => ({ ...current, assignments: current.assignments.filter(a => a.id !== confirming.id) })); setMessage({ type: 'success', text: 'Faculty assignment deleted.' }); setConfirming(null); } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setSaving(false); } };
    return <>
        <header className={styles.header}><div><div className={styles.eyebrow}>Academic management</div><h1 className={styles.title}>Faculty Assignments</h1><p className={styles.description}>Assign faculty members to subjects using the approved academic catalog.</p></div></header>
        <Message message={message} />
        <form className={`${styles.panel} ${styles.form}`} onSubmit={submit}>
            <Select label="Faculty" value={form.faculty_id} onChange={setField('faculty_id')} required options={[{ value: '', label: 'Select faculty' }, ...data.faculty.map(f => ({ value: f.id, label: f.full_name || f.email || f.id }))]} />
            <Input label="Branch" value={form.branch} onChange={setField('branch')} required />
            <Input label="Semester" type="number" min="1" value={form.semester} onChange={setField('semester')} required />
            <Input label="Scheme" value={form.scheme} onChange={setField('scheme')} required />
            <Select label="Subject" value={form.subject_code} onChange={setField('subject_code')} required options={[{ value: '', label: 'Select subject' }, ...filteredSubjects.map(s => ({ value: s.subject_code, label: `${s.subject_code} — ${s.subject_name}` }))]} />
            <Select label="Class (optional)" value={form.class_id} onChange={setField('class_id')} options={[{ value: '', label: 'No class restriction' }, ...data.classes.map(c => ({ value: c.id, label: c.name }))]} />
            <div className={styles.formActions}><Button type="submit" loading={saving}>Create assignment</Button></div>
        </form>
        <section className={styles.panel} aria-busy={loading}><div className={styles.toolbar}><SearchInput value={query} onChange={setQuery} aria-label="Search faculty assignments" placeholder="Search faculty, subject, or branch" /><Button variant="secondary" onClick={load} loading={loading} iconStart="refresh">Refresh</Button></div>{loading ? <LoadingState label="Loading faculty assignments" /> : visible.length === 0 ? <EmptyState variant="inline" icon="assignment_ind" title="No assignments found" description="Create an assignment to connect faculty and subjects." /> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">Faculty</th><th scope="col">Subject</th><th scope="col">Branch</th><th scope="col">Semester</th><th scope="col">Scheme</th><th scope="col">Class</th><th scope="col">Actions</th></tr></thead><tbody>{visible.map(a => <tr key={a.id}><td>{facultyById.get(a.faculty_id)?.full_name || 'Unknown faculty'}</td><td>{a.subject_code}</td><td>{a.branch}</td><td>{a.semester}</td><td>{a.scheme}</td><td>{classById.get(a.class_id)?.name || 'All classes'}</td><td><div className={styles.actions}><Button size="sm" variant="danger" onClick={() => setConfirming(a)}>Delete</Button></div></td></tr>)}</tbody></table></div>}</section>
        <ConfirmDialog open={Boolean(confirming)} title="Delete faculty assignment?" description="This removes the faculty-to-subject assignment." busy={saving} onCancel={() => setConfirming(null)} onConfirm={remove} />
    </>;
}

export default function AdminManagementPage({ type }) { return <AuthGuard role="admin"><main className={`${styles.page} gf-page gf-page-wide`}>{type === 'sessions' ? <ExamSessions /> : <FacultyAssignments />}</main></AuthGuard>; }
