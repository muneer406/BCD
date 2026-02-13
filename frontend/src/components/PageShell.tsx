import type { HTMLAttributes } from "react";

export function PageShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const classes =
    `mx-auto w-full max-w-6xl px-6 py-10 ${className ?? ""}`.trim();
  return <div className={classes} {...props} />;
}
