import type { HTMLAttributes } from "react";

export function PageShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const classes =
    `mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10 ${className ?? ""}`.trim();
  return <div className={classes} {...props} />;
}
