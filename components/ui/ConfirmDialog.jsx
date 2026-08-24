'use client';

import { useEffect, useRef } from 'react';
import { Button } from './Foundation';
import styles from './ConfirmDialog.module.css';

export function ConfirmDialog({ description, onCancel, onConfirm, open, title, busy = false }) {
    const cancelRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        cancelRef.current?.focus();
        const onKeyDown = (event) => { if (event.key === 'Escape' && !busy) onCancel(); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, busy, onCancel]);

    if (!open) return null;
    return (
        <div className={styles.backdrop} role="presentation">
            <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description">
                <h2 id="confirm-dialog-title" className={styles.title}>{title}</h2>
                <p id="confirm-dialog-description" className={styles.description}>{description}</p>
                <div className={styles.actions}>
                    <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
                    <Button variant="danger" loading={busy} onClick={onConfirm}>Delete</Button>
                </div>
            </div>
        </div>
    );
}
