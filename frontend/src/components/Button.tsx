import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "outline" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

const baseStyles =
  "inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide-600 disabled:opacity-60 disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-ink-900 text-sand-50 shadow-lift hover:bg-ink-800 active:bg-ink-700",
  outline:
    "border border-ink-700 text-ink-900 hover:bg-sand-100 active:bg-sand-200",
  ghost: "text-ink-700 hover:text-ink-900 hover:bg-sand-100",
};

export function Button({
  variant = "primary",
  fullWidth,
  className,
  ...props
}: ButtonProps) {
  const widthClass = fullWidth ? "w-full" : "";
  const classes = [baseStyles, variants[variant], widthClass, className]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} {...props} />;
}
