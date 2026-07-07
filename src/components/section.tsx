interface SectionProps {
  index: string;
  label: string;
  children: React.ReactNode;
}

// Numbered eyebrows are justified here: the flow really is sequential (no
// question without data loaded, no result without a question) — not
// decoration layered onto unordered content.
export function Section({ index, label, children }: SectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2 font-mono text-xs tracking-[0.15em] text-muted-foreground">
        <span className="text-primary">{index}</span>
        <span>{label}</span>
      </div>
      {children}
    </section>
  );
}
