import styles from './Table.module.css';

export function TableWrapper({ children, className, ...props }) {
    return (
        <div className={[styles.wrapper, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </div>
    );
}

export function Table({ children, className, ...props }) {
    return (
        <table className={[styles.table, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </table>
    );
}

export function TableHead({ children, className, ...props }) {
    return (
        <thead className={[styles.thead, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </thead>
    );
}

export function TableBody({ children, className, ...props }) {
    return (
        <tbody className={[styles.tbody, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </tbody>
    );
}

export function TableRow({ children, className, ...props }) {
    return (
        <tr className={[styles.tr, className].filter(Boolean).join(' ')} {...props}>
            {children}
        </tr>
    );
}

export function TableHeader({ children, className, align = 'left', ...props }) {
    return (
        <th 
            scope="col"
            className={[
                styles.th, 
                align === 'center' && styles.center, 
                align === 'right' && styles.right, 
                className
            ].filter(Boolean).join(' ')} 
            {...props}
        >
            {children}
        </th>
    );
}

export function TableCell({ children, className, align = 'left', ...props }) {
    return (
        <td 
            className={[
                styles.td, 
                align === 'center' && styles.center, 
                align === 'right' && styles.right, 
                className
            ].filter(Boolean).join(' ')} 
            {...props}
        >
            {children}
        </td>
    );
}
