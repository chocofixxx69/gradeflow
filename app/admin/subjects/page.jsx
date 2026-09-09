'use client';
import AuthGuard from '../../../components/AuthGuard';
import { SubjectsContent } from '../../../components/SubjectsContent';

export default function AdminSubjectsPage() {
  return (
    <AuthGuard role="admin">
      <SubjectsContent />
    </AuthGuard>
  );
}
