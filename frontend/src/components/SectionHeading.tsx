type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
}: SectionHeadingProps) {
  return (
    <div className="space-y-3">
      {eyebrow ? (
        <p className="text-xs uppercase tracking-[0.2em] text-ink-700">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-3xl font-heading font-semibold text-ink-900">
        {title}
      </h2>
      {description ? <p className="text-ink-700">{description}</p> : null}
    </div>
  );
}
