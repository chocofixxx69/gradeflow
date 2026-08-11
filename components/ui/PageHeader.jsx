import styles from './PageHeader.module.css';

export function PageHeader({ children, className, ...props }) {
    return (
        <header className={[styles.header, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </header>
    );
}

export function PageHeaderEyebrow({ children, className, ...props }) {
    return (
        <div className={[styles.eyebrow, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </div>
    );
}

export function PageHeaderTitle({ children, className, ...props }) {
    return (
        <h1 className={[styles.title, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </h1>
    );
}

export function PageHeaderSubtitle({ children, className, ...props }) {
    return (
        <p className={[styles.subtitle, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </p>
    );
}

export function PageHeaderActions({ children, className, ...props }) {
    return (
        <div className={[styles.actions, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </div>
    );
}
