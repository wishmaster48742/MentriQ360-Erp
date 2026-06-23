type WorkspacePlaceholderProps = {
  title?: string;
  detail?: string;
  compact?: boolean;
  className?: string;
};

export function WorkspacePlaceholder({
  title = "Workspace is getting ready",
  detail = "Your ERP data will appear here shortly.",
  compact = false,
  className = "",
}: WorkspacePlaceholderProps) {
  const cardCount = compact ? 2 : 3;
  const rowCount = compact ? 3 : 5;

  return (
    <section className={`workspace-placeholder ${compact ? "workspace-placeholder--compact" : ""} ${className}`} aria-live="polite">
      <div className="workspace-placeholder-head">
        <div className="workspace-placeholder-mark" aria-hidden="true">
          <span />
        </div>
        <div className="min-w-0">
          <p className="workspace-placeholder-title">{title}</p>
          <p className="workspace-placeholder-detail">{detail}</p>
        </div>
      </div>

      <div className="workspace-placeholder-grid" aria-hidden="true">
        {Array.from({ length: cardCount }).map((_, index) => (
          <div className="workspace-placeholder-card" key={index}>
            <span className="workspace-placeholder-line workspace-placeholder-line--short" />
            <span className="workspace-placeholder-line" />
            <span className="workspace-placeholder-chip" />
          </div>
        ))}
      </div>

      <div className="workspace-placeholder-table" aria-hidden="true">
        {Array.from({ length: rowCount }).map((_, index) => (
          <div className="workspace-placeholder-row" key={index}>
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    </section>
  );
}
