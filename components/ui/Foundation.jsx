'use client';

import { cloneElement, forwardRef, isValidElement, useId } from 'react';
import styles from './Foundation.module.css';

function cx(...classes) {
    return classes.filter(Boolean).join(' ');
}

function capitalize(value) {
    return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function mergeIds(...ids) {
    return ids.filter(Boolean).join(' ') || undefined;
}

export const VALIDATION_MESSAGE_PRIORITY = ['error', 'success', 'helper'];

export const LOADING_STATE_USAGE = {
    loadingState: 'Use LoadingState when a region or action is actively waiting and users need a live status announcement.',
    skeleton: 'Use Skeleton when preserving layout during content loading and the placeholder should stay out of the accessibility tree.',
};

function Icon({ name, className, children }) {
    if (children) return <span className={className}>{children}</span>;
    if (!name) return null;

    return (
        <span className={cx('material-icons-round', className)} aria-hidden="true">
            {name}
        </span>
    );
}

export const Button = forwardRef(function Button({
    as: Component = 'button',
    children,
    className,
    density = 'regular',
    disabled = false,
    fullWidth = false,
    iconEnd,
    iconStart,
    loading = false,
    onClick,
    size = 'md',
    type = 'button',
    variant = 'primary',
    ...props
}, ref) {
    const isButton = Component === 'button';
    const isDisabled = disabled || loading;

    function handleClick(event) {
        if (!isButton && isDisabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        onClick?.(event);
    }

    return (
        <Component
            ref={ref}
            className={cx(
                styles.button,
                styles[`button${capitalize(size)}`],
                styles[`button${capitalize(variant)}`],
                density === 'compact' && styles.buttonCompact,
                fullWidth && styles.buttonFull,
                isDisabled && styles.buttonDisabled,
                className
            )}
            disabled={isButton ? isDisabled : undefined}
            {...props}
            aria-busy={loading || undefined}
            aria-disabled={!isButton && isDisabled ? true : undefined}
            tabIndex={!isButton && isDisabled ? -1 : props.tabIndex}
            type={isButton ? type : undefined}
            onClick={handleClick}
        >
            {loading ? <span className={styles.spinner} aria-hidden="true" /> : <Icon name={iconStart} className={styles.buttonIcon} />}
            <span className={styles.buttonText}>{children}</span>
            {!loading && <Icon name={iconEnd} className={styles.buttonIcon} />}
        </Component>
    );
});

export function Stack({
    as: Component = 'div',
    children,
    className,
    size = 'md',
    ...props
}) {
    return (
        <Component
            className={cx(
                styles.stack,
                styles[`stack${capitalize(size)}`],
                className
            )}
            {...props}
        >
            {children}
        </Component>
    );
}

export function Inline({
    align = 'center',
    as: Component = 'div',
    children,
    className,
    stackMobile = false,
    wrap = true,
    ...props
}) {
    return (
        <Component
            className={cx(
                styles.inline,
                wrap ? styles.inlineWrap : styles.inlineNoWrap,
                styles[`inline${capitalize(align)}`],
                stackMobile && styles.inlineStackMobile,
                className
            )}
            {...props}
        >
            {children}
        </Component>
    );
}

export function ResponsiveGrid({
    as: Component = 'div',
    children,
    className,
    size = 'md',
    ...props
}) {
    return (
        <Component
            className={cx(
                styles.responsiveGrid,
                styles[`responsiveGrid${capitalize(size)}`],
                className
            )}
            {...props}
        >
            {children}
        </Component>
    );
}

export const IconButton = forwardRef(function IconButton({
    'aria-label': ariaLabel,
    children,
    className,
    density = 'regular',
    disabled = false,
    icon,
    size = 'md',
    title,
    type = 'button',
    variant = 'default',
    ...props
}, ref) {
    return (
        <button
            ref={ref}
            className={cx(
                styles.iconButton,
                styles[`iconButton${capitalize(size)}`],
                styles[`iconButton${capitalize(variant)}`],
                density === 'compact' && styles.iconButtonCompact,
                className
            )}
            disabled={disabled}
            type={type}
            aria-label={ariaLabel || title}
            title={title}
            {...props}
        >
            <Icon name={icon}>{children}</Icon>
        </button>
    );
});

export function Badge({
    children,
    className,
    icon,
    size = 'md',
    tone = 'neutral',
    ...props
}) {
    return (
        <span
            className={cx(
                styles.badge,
                styles[`badge${capitalize(size)}`],
                tone !== 'neutral' && styles[`badge${capitalize(tone)}`],
                className
            )}
            {...props}
        >
            <Icon name={icon} />
            {children}
        </span>
    );
}

export function Avatar({
    alt,
    className,
    name = '',
    size = 'md',
    src,
    ...props
}) {
    const initials = name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join('') || '?';

    return (
        <span
            className={cx(
                styles.avatar,
                styles[`avatar${capitalize(size)}`],
                className
            )}
            aria-label={alt || name || 'User'}
            role="img"
            {...props}
        >
            {src ? <img className={styles.avatarImage} src={src} alt="" /> : initials}
        </span>
    );
}

export function Divider({ className, orientation = 'horizontal', ...props }) {
    return (
        <div
            className={cx(
                styles.divider,
                orientation === 'vertical' ? styles.dividerVertical : styles.dividerHorizontal,
                className
            )}
            role="separator"
            aria-orientation={orientation}
            {...props}
        />
    );
}

export function Tooltip({
    children,
    className,
    content,
    id,
    side = 'top',
    ...props
}) {
    const generatedId = useId();
    const tooltipId = id || generatedId;
    const trigger = content && isValidElement(children)
        ? cloneElement(children, {
            'aria-describedby': mergeIds(children.props['aria-describedby'], tooltipId),
        })
        : children;

    return (
        <span className={cx(styles.tooltipWrap, className)} {...props}>
            {trigger}
            {content && (
                <span
                    className={cx(styles.tooltipContent, styles[`tooltip${capitalize(side)}`])}
                    id={tooltipId}
                    role="tooltip"
                >
                    {content}
                </span>
            )}
        </span>
    );
}

function FieldMessage({ id, type, children }) {
    if (!children) return null;

    return (
        <div
            id={id}
            className={styles[`field${capitalize(type)}`]}
            role={type === 'error' ? 'alert' : undefined}
            aria-live={type === 'success' ? 'polite' : undefined}
        >
            {children}
        </div>
    );
}

function getValidationMessage({ error, helperText, successText }) {
    const messages = {
        error: error && { idSuffix: 'error', type: 'error', content: error },
        success: successText && { idSuffix: 'success', type: 'success', content: successText },
        helper: helperText && { idSuffix: 'help', type: 'help', content: helperText },
    };

    for (const type of VALIDATION_MESSAGE_PRIORITY) {
        if (messages[type]) return messages[type];
    }

    return null;
}

function getDescribedBy({ messageId, ariaDescribedBy, describedBy }) {
    return mergeIds(
        ariaDescribedBy,
        describedBy,
        messageId,
    );
}

export const Input = forwardRef(function Input({
    'aria-describedby': ariaDescribedBy,
    className,
    density = 'regular',
    describedBy,
    error,
    hideLabel = false,
    helperText,
    id,
    label,
    required = false,
    successText,
    type = 'text',
    ...props
}, ref) {
    const generatedId = useId();
    const inputId = id || generatedId;
    const message = getValidationMessage({ error, helperText, successText });
    const messageId = message ? `${inputId}-${message.idSuffix}` : undefined;

    return (
        <div className={cx(styles.field, density === 'compact' && styles.fieldCompact, className)}>
            {label && (
                <label className={cx(styles.fieldLabel, hideLabel && styles.visuallyHidden)} htmlFor={inputId}>
                    {label} {required && <span className={styles.fieldRequired}>*</span>}
                </label>
            )}
            <input
                ref={ref}
                id={inputId}
                className={cx(styles.fieldControl, density === 'compact' && styles.fieldControlCompact, error && styles.fieldInvalid)}
                type={type}
                required={required}
                aria-invalid={error ? true : undefined}
                aria-describedby={getDescribedBy({ messageId, ariaDescribedBy, describedBy })}
                {...props}
            />
            {message && <FieldMessage id={messageId} type={message.type}>{message.content}</FieldMessage>}
        </div>
    );
});

export const Textarea = forwardRef(function Textarea({
    'aria-describedby': ariaDescribedBy,
    className,
    density = 'regular',
    describedBy,
    error,
    hideLabel = false,
    helperText,
    id,
    label,
    required = false,
    successText,
    ...props
}, ref) {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const message = getValidationMessage({ error, helperText, successText });
    const messageId = message ? `${textareaId}-${message.idSuffix}` : undefined;

    return (
        <div className={cx(styles.field, density === 'compact' && styles.fieldCompact, className)}>
            {label && (
                <label className={cx(styles.fieldLabel, hideLabel && styles.visuallyHidden)} htmlFor={textareaId}>
                    {label} {required && <span className={styles.fieldRequired}>*</span>}
                </label>
            )}
            <textarea
                ref={ref}
                id={textareaId}
                className={cx(styles.fieldControl, styles.textareaControl, density === 'compact' && styles.fieldControlCompact, density === 'compact' && styles.textareaCompact, error && styles.fieldInvalid)}
                required={required}
                aria-invalid={error ? true : undefined}
                aria-describedby={getDescribedBy({ messageId, ariaDescribedBy, describedBy })}
                {...props}
            />
            {message && <FieldMessage id={messageId} type={message.type}>{message.content}</FieldMessage>}
        </div>
    );
});

export const Select = forwardRef(function Select({
    'aria-describedby': ariaDescribedBy,
    children,
    className,
    density = 'regular',
    describedBy,
    error,
    hideLabel = false,
    helperText,
    id,
    label,
    options,
    placeholder,
    required = false,
    successText,
    ...props
}, ref) {
    const generatedId = useId();
    const selectId = id || generatedId;
    const message = getValidationMessage({ error, helperText, successText });
    const messageId = message ? `${selectId}-${message.idSuffix}` : undefined;

    return (
        <div className={cx(styles.field, density === 'compact' && styles.fieldCompact, className)}>
            {label && (
                <label className={cx(styles.fieldLabel, hideLabel && styles.visuallyHidden)} htmlFor={selectId}>
                    {label} {required && <span className={styles.fieldRequired}>*</span>}
                </label>
            )}
            <select
                ref={ref}
                id={selectId}
                className={cx(styles.selectControl, density === 'compact' && styles.selectControlCompact, error && styles.fieldInvalid)}
                required={required}
                aria-invalid={error ? true : undefined}
                aria-describedby={getDescribedBy({ messageId, ariaDescribedBy, describedBy })}
                {...props}
            >
                {placeholder && <option value="">{placeholder}</option>}
                {options?.map(option => (
                    <option key={option.value} value={option.value} disabled={option.disabled}>
                        {option.label}
                    </option>
                ))}
                {children}
            </select>
            {message && <FieldMessage id={messageId} type={message.type}>{message.content}</FieldMessage>}
        </div>
    );
});

export const SearchInput = forwardRef(function SearchInput({
    'aria-describedby': ariaDescribedBy,
    className,
    clearLabel = 'Clear search',
    density = 'regular',
    describedBy,
    error,
    hideLabel = false,
    helperText,
    id,
    label,
    onClear,
    placeholder = 'Search',
    required = false,
    successText,
    value,
    ...props
}, ref) {
    const generatedId = useId();
    const searchId = id || generatedId;
    const message = getValidationMessage({ error, helperText, successText });
    const messageId = message ? `${searchId}-${message.idSuffix}` : undefined;
    const hasValue = value !== undefined && String(value).length > 0;

    return (
        <div className={cx(styles.field, density === 'compact' && styles.fieldCompact, className)}>
            {label && (
                <label className={cx(styles.fieldLabel, hideLabel && styles.visuallyHidden)} htmlFor={searchId}>
                    {label} {required && <span className={styles.fieldRequired}>*</span>}
                </label>
            )}
            <div className={cx(styles.searchWrap, density === 'compact' && styles.searchWrapCompact)}>
                <span className={cx('material-icons-round', styles.searchIcon)} aria-hidden="true">search</span>
                <input
                    ref={ref}
                    id={searchId}
                    className={cx(styles.fieldControl, styles.searchInput, density === 'compact' && styles.fieldControlCompact, error && styles.fieldInvalid)}
                    type="search"
                    placeholder={placeholder}
                    required={required}
                    value={value}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={getDescribedBy({ messageId, ariaDescribedBy, describedBy })}
                    {...props}
                />
                {onClear && hasValue && (
                    <button className={cx(styles.searchClear, density === 'compact' && styles.searchClearCompact)} type="button" aria-label={clearLabel} onClick={onClear}>
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                )}
            </div>
            {message && <FieldMessage id={messageId} type={message.type}>{message.content}</FieldMessage>}
        </div>
    );
});

export function EmptyState({
    actions,
    children,
    className,
    description,
    density = 'regular',
    icon = 'inbox',
    title,
    variant = 'panel',
    ...props
}) {
    const generatedId = useId();
    const titleId = title ? `${generatedId}-title` : undefined;
    const descriptionId = description ? `${generatedId}-description` : undefined;

    return (
        <section
            className={cx(
                styles.emptyState,
                styles[`emptyState${capitalize(variant)}`],
                density === 'compact' && styles.emptyStateCompact,
                className
            )}
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            {...props}
        >
            {icon && (
                <div className={styles.emptyIcon} aria-hidden="true">
                    <span className="material-icons-round">{icon}</span>
                </div>
            )}
            {title && <h2 id={titleId} className={styles.emptyTitle}>{title}</h2>}
            {description && <p id={descriptionId} className={styles.emptyDescription}>{description}</p>}
            {children}
            {actions && <div className={styles.emptyActions}>{actions}</div>}
        </section>
    );
}

export function LoadingState({
    block = false,
    className,
    density = 'regular',
    label = 'Loading',
    ...props
}) {
    return (
        <div
            className={cx(styles.loadingState, density === 'compact' && styles.loadingCompact, block && styles.loadingBlock, className)}
            role="status"
            aria-live="polite"
            {...props}
        >
            <span className={styles.spinner} aria-hidden="true" />
            <span>{label}</span>
        </div>
    );
}

export function Skeleton({
    className,
    height = '1rem',
    radius,
    width = '100%',
    ...props
}) {
    return (
        <span
            className={cx(styles.skeleton, className)}
            style={{ width, height, borderRadius: radius }}
            aria-hidden="true"
            {...props}
        />
    );
}
