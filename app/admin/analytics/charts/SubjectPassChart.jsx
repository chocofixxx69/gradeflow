'use client';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function SubjectPassChart({ rows }) {
    return (
        <div style={{ height: 320, minWidth: 0, marginBottom: 24 }} aria-label="Subject pass percentage chart">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 12, right: 12, left: -16, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="subject_code" />
                    <YAxis domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Bar dataKey="pass_percentage" name="Pass percentage" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
