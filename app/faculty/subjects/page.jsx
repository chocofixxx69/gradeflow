'use client';
import dynamic from 'next/dynamic';
import AuthGuard from '../../../components/AuthGuard';
import { LoadingState } from '../../../components/ui';

// SubjectsContent pulls in recharts (a large charting library) for its usage
// graphs. Loading it on demand instead of statically keeps that weight off
// every other page that happens to share this route's webpack chunk group.
const SubjectsContent = dynamic(
    () => import('../../../components/SubjectsContent').then(m => m.SubjectsContent || m.default || m),
    { loading: () => <LoadingState block label="Loading..." />, ssr: false }
);

export default function SubjectsPage() {
  return (
    <AuthGuard role="faculty">
      <SubjectsContent />
    </AuthGuard>
  );
}
