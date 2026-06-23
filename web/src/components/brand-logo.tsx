import Image from "next/image";

export function BrandLogo({
  compact = false,
  className = "",
  size = "md",
  logoUrl,
  label = "Mentriq360",
  subtitle = "School ERP",
  animated = false,
}: {
  compact?: boolean;
  className?: string;
  size?: "md" | "lg";
  logoUrl?: string;
  label?: string;
  subtitle?: string;
  animated?: boolean;
}) {
  const customLogo = logoUrl?.trim();
  const boxSize = size === "lg" ? "h-14 w-14" : "h-9 w-9";
  const markSize = size === "lg" ? "h-16 w-16 transform -translate-y-[8px]" : "h-10 w-10 transform -translate-y-[6px]";
  const wordmarkSize = size === "lg" ? "h-14 w-64" : "h-9 w-44";
  const logoSource = customLogo || "/erp-logo-mark.png";

  if (!customLogo) {
    return (
      <div className={`brand-lockup ${animated ? "brand-lockup-animated" : ""} ${className}`} aria-label={`${label} logo`}>
        <span className={`brand-lockup-mark ${markSize}`} aria-hidden="true">
          <Image src="/erp-logo-mark.png" alt="" width={512} height={512} priority />
        </span>
        {!compact && (
          <span className={`brand-lockup-wordmark ${wordmarkSize}`}>
            <Image
              src="/erp-logo-wordmark.png"
              alt={label}
              width={810}
              height={210}
              priority
              sizes={size === "lg" ? "16rem" : "11rem"}
            />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span
        role="img"
        aria-label={`${label} logo`}
        className={`brand-logo-tile block ${boxSize} shrink-0 rounded-md bg-white bg-contain bg-center bg-no-repeat shadow-sm ring-1 ring-line/70`}
        style={{ backgroundImage: `url(${JSON.stringify(logoSource)})` }}
      />
      {!compact && (
        <div className="min-w-0">
          <p className="display-font truncate text-base font-semibold leading-tight text-ink">{label}</p>
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{subtitle}</p>
        </div>
      )}
    </div>
  );
}
