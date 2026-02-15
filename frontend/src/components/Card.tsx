import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "soft";
};

export function Card({ tone = "default", className, ...props }: CardProps) {
  const toneClass =
    tone === "soft"
      ? "bg-sand-50/70 border border-sand-100"
      : "bg-white/90 border border-sand-100";

  const classes =
    `rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lift backdrop-blur ${toneClass} ${className ?? ""}`.trim();

  return <div className={classes} {...props} />;
}
