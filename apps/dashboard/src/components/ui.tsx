"use client";

import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { IconAlert, IconCheck, IconX } from "./icons";
import styles from "./ui.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerSolid";
type ButtonSize = "sm" | "md" | "lg";

const sizeClass: Record<ButtonSize, string> = {
  sm: styles.sizeSm,
  md: "",
  lg: styles.sizeLg,
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  fullWidth,
  loading,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[styles.button, styles[variant], sizeClass[size], fullWidth ? styles.fullWidth : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size={15} /> : null}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export function IconButton({ label, children, className, ...props }: IconButtonProps) {
  return (
    <button className={[styles.iconButton, className ?? ""].join(" ")} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return <span className={styles.spinner} style={{ width: size, height: size }} aria-hidden />;
}

export function Skeleton({
  width,
  height = 14,
  radius = 6,
  className,
}: {
  width?: string | number;
  height?: string | number;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      className={[styles.skeleton, className ?? ""].join(" ")}
      style={{ width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}

export function SkeletonTable({ rows = 5, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div className={styles.skeletonTable} aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div className={styles.skeletonRow} key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={13} width={c === 0 ? "42%" : c === cols - 1 ? "12%" : "20%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className={styles.skeletonCards} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div className={styles.skeletonCard} key={i}>
          <Skeleton width="55%" height={12} />
          <Skeleton width="45%" height={26} radius={8} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonLines({ count = 4 }: { count?: number }) {
  return (
    <div className={styles.skeletonLines} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === count - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[styles.card, className ?? ""].join(" ")}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.cardHeader}>
      <div>
        <div className={styles.cardTitle}>{title}</div>
        {subtitle ? <div className={styles.cardSubtitle}>{subtitle}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[styles.cardPad, className ?? ""].join(" ")}>{children}</div>;
}

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const badgeToneClass: Record<BadgeTone, string> = {
  neutral: styles.badgeNeutral,
  accent: styles.badgeAccent,
  success: styles.badgeSuccess,
  warning: styles.badgeWarning,
  danger: styles.badgeDanger,
  info: styles.badgeInfo,
};

export function Badge({ tone = "neutral", dot, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={[styles.badge, badgeToneClass[tone]].join(" ")}>
      {dot ? <span className={styles.dot} /> : null}
      {children}
    </span>
  );
}

export function Field({
  label,
  htmlFor,
  optional,
  hint,
  error,
  children,
}: {
  label?: ReactNode;
  htmlFor?: string;
  optional?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      {label ? (
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
          {optional ? <span className={styles.optional}>{optional}</span> : null}
        </label>
      ) : null}
      {children}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
      {error ? <span className={styles.fieldError}>{error}</span> : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={[styles.input, className ?? ""].join(" ")} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={[styles.textarea, className ?? ""].join(" ")} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={[styles.select, className ?? ""].join(" ")} {...props}>
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
}) {
  return (
    <button type="button" className={styles.toggle} onClick={() => onChange(!checked)} role="switch" aria-checked={checked}>
      <span className={[styles.toggleTrack, checked ? styles.toggleOn : ""].join(" ")}>
        <span className={[styles.toggleThumb, checked ? styles.toggleThumbOn : ""].join(" ")} />
      </span>
      {label}
    </button>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className={styles.tabs} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          className={[styles.tab, value === option.value ? styles.tabActive : ""].join(" ")}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function StateBlock({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.state}>
      {icon ? <span className={styles.stateIcon}>{icon}</span> : null}
      {title ? <div className={styles.stateTitle}>{title}</div> : null}
      {text ? <div className={styles.stateText}>{text}</div> : null}
      {action}
    </div>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className={styles.state}>
      <Spinner />
      <div className={styles.stateText}>{label}</div>
    </div>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div className={styles.inlineError} role="alert">
      <IconAlert size={16} />
      <span>{children}</span>
    </div>
  );
}

export function InlineNotice({ children }: { children: ReactNode }) {
  return (
    <div className={styles.inlineNotice}>
      <IconAlert size={16} />
      <span>{children}</span>
    </div>
  );
}

export function InlineSuccess({ children }: { children: ReactNode }) {
  return (
    <div className={styles.inlineSuccess}>
      <IconCheck size={16} />
      <span>{children}</span>
    </div>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
  closeLabel,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  closeLabel: string;
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        className={[styles.dialog, wide ? styles.dialogWide : ""].join(" ")}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.dialogHeader}>
          <h2 className={styles.dialogTitle}>{title}</h2>
          <IconButton label={closeLabel} onClick={onClose}>
            <IconX size={18} />
          </IconButton>
        </div>
        <div className={styles.dialogBody}>{children}</div>
        {footer ? <div className={styles.dialogFooter}>{footer}</div> : null}
      </div>
    </div>
  );
}
