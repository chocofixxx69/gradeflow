'use client';
import AuthGuard from '../../../components/AuthGuard';
import { ClassesContent } from '../../../components/ClassesContent';

export default function ClassesPage() {
    return <AuthGuard role="faculty"><ClassesContent /></AuthGuard>;
}
