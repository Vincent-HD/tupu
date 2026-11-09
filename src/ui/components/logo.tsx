export const LogoMark = ({ className = "size-10" }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <rect
      x="4"
      y="4"
      width="28"
      height="28"
      rx="6"
      fill="#4ea8ff"
      stroke="var(--ink)"
      strokeWidth="3"
    />
    <rect
      x="16"
      y="16"
      width="28"
      height="28"
      rx="6"
      fill="#ffd23f"
      stroke="var(--ink)"
      strokeWidth="3"
    />
    <g fill="#1b1813">
      <ellipse cx="30" cy="35" rx="5.2" ry="4.2" />
      <circle cx="23.6" cy="28.4" r="2.1" />
      <circle cx="27.6" cy="24.6" r="2.2" />
      <circle cx="32.6" cy="24.6" r="2.2" />
      <circle cx="36.6" cy="28.4" r="2.1" />
    </g>
  </svg>
);

export const Wordmark = () => (
  <span className="flex items-center gap-2.5">
    <LogoMark />
    <span className="font-display text-2xl font-extrabold tracking-tight">Tupu</span>
  </span>
);
