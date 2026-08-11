import styles from './Card.module.css';

export function Card({ children, className, ...props }) {
    return (
        <div className={[styles.card, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </div>
    );
}

export function CardHeader({ children, className, ...props }) {
    return (
        <div className={[styles.header, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </div>
    );
}

export function CardTitle({ children, className, ...props }) {
    return (
        <h3 className={[styles.title, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </h3>
    );
}

export function CardContent({ children, className, ...props }) {
    return (
        <div className={[styles.content, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </div>
    );
}
