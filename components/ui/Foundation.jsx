'use client';

import { cloneElement, forwardRef, isValidElement, useId, useState, useRef, useEffect, useMemo } from 'react';
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
    showPasswordToggle = true,
    ...props
}, ref) {
    const generatedId = useId();
    const inputId = id || generatedId;
    const message = getValidationMessage({ error, helperText, successText });
    const messageId = message ? `${inputId}-${message.idSuffix}` : undefined;
    const [passwordVisible, setPasswordVisible] = useState(false);

    const isPassword = type === 'password';
    const effectiveType = isPassword && passwordVisible ? 'text' : type;
    const canTogglePassword = isPassword && showPasswordToggle;

    const inputControl = (
        <input
            ref={ref}
            id={inputId}
            className={cx(
                styles.fieldControl,
                density === 'compact' && styles.fieldControlCompact,
                canTogglePassword && (density === 'compact' ? styles.passwordInputCompact : styles.passwordInput),
                error && styles.fieldInvalid
            )}
            type={effectiveType}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={getDescribedBy({ messageId, ariaDescribedBy, describedBy })}
            {...props}
        />
    );

    return (
        <div className={cx(styles.field, density === 'compact' && styles.fieldCompact, className)}>
            {label && (
                <label className={cx(styles.fieldLabel, hideLabel && styles.visuallyHidden)} htmlFor={inputId}>
                    {label} {required && <span className={styles.fieldRequired}>*</span>}
                </label>
            )}
            {canTogglePassword ? (
                <div className={styles.passwordWrap}>
                    {inputControl}
                    <button
                        type="button"
                        className={cx(styles.passwordToggle, density === 'compact' && styles.passwordToggleCompact)}
                        onClick={() => setPasswordVisible(prev => !prev)}
                        onMouseDown={(e) => e.preventDefault()}
                        title={passwordVisible ? 'Hide password' : 'Show password'}
                        aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                        tabIndex={-1}
                    >
                        <span className={cx('material-icons-round', styles.passwordToggleIcon)}>
                            {passwordVisible ? 'visibility_off' : 'visibility'}
                        </span>
                    </button>
                </div>
            ) : (
                inputControl
            )}
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

export const SearchableSelect = forwardRef(function SearchableSelect({
    'aria-describedby': ariaDescribedBy,
    className,
    density = 'regular',
    describedBy,
    disabled = false,
    error,
    helperText,
    hideLabel = false,
    id,
    label,
    onChange,
    options = [],
    placeholder = 'Select an option',
    required = false,
    searchPlaceholder = 'Type to search...',
    successText,
    value = '',
    allowClear = true,
    style,
    ...props
}, ref) {
    const generatedId = useId();
    const selectId = id || generatedId;
    const containerRef = useRef(null);
    const searchInputRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const message = getValidationMessage({ error, helperText, successText });
    const messageId = message ? `${selectId}-${message.idSuffix}` : undefined;

    const selectedOption = useMemo(() => {
        if (value === undefined || value === null || value === '') return null;
        return options.find(opt => String(opt.value) === String(value)) || null;
    }, [options, value]);

    const filteredOptions = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return options;
        const tokens = q.split(/\s+/).filter(Boolean);
        return options.filter(opt => {
            const val = String(opt.value || '').toLowerCase();
            const lbl = String(opt.label || '').toLowerCase();
            const sub = String(opt.subtitle || '').toLowerCase();
            const bdg = String(opt.badge || '').toLowerCase();
            const target = `${val} ${lbl} ${sub} ${bdg}`;
            return tokens.every(t => target.includes(t));
        });
    }, [options, searchQuery]);

    // Handle click outside & Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleMouseDown = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    // Auto-focus search input when dropdown opens
    useEffect(() => {
        if (isOpen) {
            setHighlightedIndex(-1);
            const timer = setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        } else {
            setSearchQuery('');
        }
    }, [isOpen]);

    const handleSelectOption = (opt) => {
        if (opt.disabled) return;
        onChange?.({ target: { value: opt.value } });
        setIsOpen(false);
        setSearchQuery('');
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onChange?.({ target: { value: '' } });
        setSearchQuery('');
    };

    const handleTriggerClick = () => {
        if (disabled) return;
        setIsOpen(prev => !prev);
    };

    const handleKeyDown = (e) => {
        if (disabled) return;
        if (!isOpen) {
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                handleSelectOption(filteredOptions[highlightedIndex]);
            }
        }
    };

    return (
        <div
            ref={containerRef}
            className={cx(styles.field, density === 'compact' && styles.fieldCompact, className)}
            style={{ position: 'relative', zIndex: isOpen ? 1000 : 1, ...style }}
        >
            {label && (
                <label className={cx(styles.fieldLabel, hideLabel && styles.visuallyHidden)} htmlFor={selectId}>
                    {label} {required && <span className={styles.fieldRequired}>*</span>}
                </label>
            )}

            {/* Select Trigger */}
            <div
                ref={ref}
                id={selectId}
                tabIndex={disabled ? -1 : 0}
                role="combobox"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-disabled={disabled}
                onClick={handleTriggerClick}
                onKeyDown={handleKeyDown}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: density === 'compact' ? '34px' : '42px',
                    padding: density === 'compact' ? '0 10px' : '0 14px',
                    background: disabled ? 'var(--surface-low, #f8fafc)' : '#FFFFFF',
                    border: isOpen ? '1.5px solid var(--primary, #174b4d)' : error ? '1.5px solid var(--red, #ef4444)' : '1px solid var(--border, #cbd5e1)',
                    borderRadius: 'var(--radius-2, 8px)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1,
                    boxShadow: isOpen ? '0 0 0 3px rgba(23, 75, 77, 0.12)' : '0 1px 2px rgba(0, 0, 0, 0.04)',
                    transition: 'all 0.18s ease',
                    userSelect: 'none',
                    boxSizing: 'border-box',
                    width: '100%',
                }}
                {...props}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1, minWidth: 0 }}>
                    {selectedOption ? (
                        <>
                            {selectedOption.badge && (
                                <span style={{
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: 'rgba(23, 75, 77, 0.1)',
                                    color: 'var(--primary, #174b4d)',
                                    flexShrink: 0,
                                }}>
                                    {selectedOption.badge}
                                </span>
                            )}
                            <span style={{
                                fontSize: density === 'compact' ? '13px' : '14px',
                                fontWeight: 600,
                                color: 'var(--tx-main, #0f172a)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {selectedOption.label}
                            </span>
                        </>
                    ) : (
                        <span style={{
                            fontSize: density === 'compact' ? '13px' : '14px',
                            color: 'var(--tx-dim, #94a3b8)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {placeholder}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {allowClear && selectedOption && !disabled && (
                        <button
                            type="button"
                            onClick={handleClear}
                            title="Clear selection"
                            style={{
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--tx-muted, #64748b)',
                                borderRadius: '4px',
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--tx-main, #0f172a)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--tx-muted, #64748b)'}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>close</span>
                        </button>
                    )}
                    <span
                        className="material-icons-round"
                        style={{
                            fontSize: '18px',
                            color: 'var(--tx-muted, #64748b)',
                            transition: 'transform 0.2s ease',
                            transform: isOpen ? 'rotate(180deg)' : 'none',
                        }}
                    >
                        expand_more
                    </span>
                </div>
            </div>

            {/* Floating Dropdown Panel */}
            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        minWidth: '320px',
                        maxWidth: '540px',
                        background: '#FFFFFF',
                        border: '1px solid var(--border, #cbd5e1)',
                        borderRadius: '12px',
                        boxShadow: '0 16px 40px rgba(10, 24, 28, 0.18), 0 3px 10px rgba(10, 24, 28, 0.08)',
                        zIndex: 99999,
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}
                >
                    {/* Search Input Bar */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'var(--surface-low, #f8fafc)',
                        border: '1px solid var(--border, #e2e8f0)',
                        borderRadius: '8px',
                        padding: '6px 10px',
                    }}>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary, #174b4d)' }}>
                            search
                        </span>
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder={searchPlaceholder}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                outline: 'none',
                                width: '100%',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'var(--tx-main, #0f172a)',
                                fontFamily: 'inherit',
                            }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    color: 'var(--tx-dim, #94a3b8)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '2px',
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>close</span>
                            </button>
                        )}
                    </div>

                    {/* Results Count & Filter Info */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0 4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--tx-muted, #64748b)',
                    }}>
                        <span>
                            {filteredOptions.length === options.length
                                ? `${options.length} subjects available`
                                : `Showing ${filteredOptions.length} of ${options.length} subjects`}
                        </span>
                        {searchQuery && (
                            <span style={{ color: 'var(--primary, #174b4d)' }}>
                                Filtered by "{searchQuery}"
                            </span>
                        )}
                    </div>

                    {/* Options List */}
                    <div
                        role="listbox"
                        style={{
                            maxHeight: '260px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                        }}
                    >
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt, idx) => {
                                const isSelected = String(opt.value) === String(value);
                                const isHighlighted = idx === highlightedIndex;
                                return (
                                    <div
                                        key={opt.value}
                                        role="option"
                                        aria-selected={isSelected}
                                        onClick={() => handleSelectOption(opt)}
                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                        style={{
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            cursor: opt.disabled ? 'not-allowed' : 'pointer',
                                            opacity: opt.disabled ? 0.5 : 1,
                                            background: isSelected
                                                ? 'rgba(23, 75, 77, 0.1)'
                                                : isHighlighted
                                                    ? 'var(--surface-low, #f1f5f9)'
                                                    : 'transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px',
                                            transition: 'background 0.12s ease',
                                        }}
                                    >
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                {opt.badge && (
                                                    <span style={{
                                                        fontSize: '10px',
                                                        fontWeight: 800,
                                                        padding: '2px 5px',
                                                        borderRadius: '4px',
                                                        background: isSelected ? 'var(--primary, #174b4d)' : 'rgba(23, 75, 77, 0.08)',
                                                        color: isSelected ? '#FFFFFF' : 'var(--primary, #174b4d)',
                                                        fontFamily: 'monospace',
                                                        flexShrink: 0,
                                                    }}>
                                                        {opt.badge}
                                                    </span>
                                                )}
                                                <span style={{
                                                    fontSize: '13px',
                                                    fontWeight: isSelected ? 800 : 600,
                                                    color: isSelected ? 'var(--primary, #174b4d)' : 'var(--tx-main, #0f172a)',
                                                }}>
                                                    {opt.label}
                                                </span>
                                            </div>
                                            {opt.subtitle && (
                                                <div style={{ fontSize: '11px', color: 'var(--tx-muted, #64748b)', marginTop: '2px' }}>
                                                    {opt.subtitle}
                                                </div>
                                            )}
                                        </div>

                                        {isSelected && (
                                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary, #174b4d)' }}>
                                                check
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{
                                padding: '24px 16px',
                                textAlign: 'center',
                                color: 'var(--tx-muted, #64748b)',
                                fontSize: '12px',
                            }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main, #0f172a)', marginBottom: '4px' }}>
                                    No subjects match "{searchQuery}"
                                </div>
                                <div>Try checking your spelling, or select "All Semesters" above.</div>
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    style={{
                                        marginTop: '10px',
                                        padding: '4px 10px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        border: '1px solid var(--border, #cbd5e1)',
                                        borderRadius: '6px',
                                        background: '#FFFFFF',
                                        cursor: 'pointer',
                                        color: 'var(--primary, #174b4d)',
                                    }}
                                >
                                    Clear search
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

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
