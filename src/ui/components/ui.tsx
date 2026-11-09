import { HotkeysProvider, useHotkey } from "@tanstack/react-hotkeys";
import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icons.tsx";

export const toneClasses = {
  paper: "bg-card text-ink",
  ink: "bg-ink text-paper",
  marker: "bg-marker text-ink",
  sky: "bg-sky text-ink",
  rose: "bg-rose text-ink",
  mint: "bg-mint text-ink",
  lilac: "bg-lilac text-ink",
  tangerine: "bg-tangerine text-ink",
  danger: "bg-danger text-white",
} as const;

export type Tone = keyof typeof toneClasses;

export const Button = ({
  tone = "paper",
  icon,
  size = "md",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  icon?: IconName;
  size?: "sm" | "md" | "lg";
}) => {
  const sizes = {
    sm: "h-9 px-3 text-sm gap-1.5 rounded-lg",
    md: "h-11 px-4 text-base gap-2 rounded-xl",
    lg: "h-14 px-6 text-lg gap-2.5 rounded-2xl",
  };
  return (
    <button
      type="button"
      className={`press inline-flex shrink-0 cursor-pointer items-center justify-center border-[2.5px] border-ink font-bold shadow-hard select-none disabled:cursor-not-allowed disabled:opacity-45 ${sizes[size]} ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} className="text-[1.15em]" />}
      {children}
    </button>
  );
};

export const IconButton = ({
  icon,
  label,
  tone = "paper",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; tone?: Tone }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={`press inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border-[2.5px] border-ink text-xl shadow-hard disabled:cursor-not-allowed disabled:opacity-45 ${toneClasses[tone]} ${className}`}
    {...props}
  >
    <Icon name={icon} />
  </button>
);

export const Card = ({
  children,
  className = "",
  tone = "paper",
  tilt,
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
  tilt?: "left" | "right";
}) => (
  <div
    className={`relative rounded-2xl border-[2.5px] border-ink shadow-hard-lg ${toneClasses[tone]} ${tilt === "left" ? "-rotate-[0.6deg]" : tilt === "right" ? "rotate-[0.6deg]" : ""} ${className}`}
  >
    {children}
  </div>
);

export const Chip = ({
  children,
  tone = "paper",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase ${toneClasses[tone]} ${className}`}
  >
    {children}
  </span>
);

export const Toggle = ({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) => (
  <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
    <span>
      <span className="block font-bold">{label}</span>
      {description && <span className="block text-sm text-ink-soft">{description}</span>}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 cursor-pointer rounded-full border-[2.5px] border-ink shadow-hard-sm transition-colors ${checked ? "bg-good" : "bg-paper-deep"}`}
    >
      <span
        className={`absolute top-0.5 size-5.5 rounded-full border-[2.5px] border-ink bg-card transition-all ${checked ? "left-6.5" : "left-0.5"}`}
      />
    </button>
  </label>
);

export const Segmented = <A extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{
    readonly value: A;
    readonly label: ReactNode;
    readonly disabled?: boolean;
  }>;
  value: A;
  onChange: (value: A) => void;
  label: string;
}) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
    {options.map((option) => (
      <button
        key={String(option.value)}
        type="button"
        role="radio"
        aria-checked={option.value === value}
        disabled={option.disabled}
        onClick={() => onChange(option.value)}
        data-pressed={option.value === value}
        className={`press min-w-11 cursor-pointer rounded-xl border-[2.5px] border-ink px-3 py-2 font-bold shadow-hard-sm disabled:cursor-not-allowed disabled:opacity-35 ${option.value === value ? "bg-marker" : "bg-card"}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const ModalEscape = ({ onClose }: { onClose: () => void }) => {
  useHotkey("Escape", onClose);
  return null;
};

export const Modal = ({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
}) => {
  const scope = `dialog-${useId()}`;
  if (!open) return null;
  return (
    <HotkeysProvider scope={scope} exclusive>
      <ModalEscape onClose={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-[2px] sm:items-center"
        onClick={onClose}
      >
        <div
          className="max-h-[92dvh] w-full max-w-md animate-float-in overflow-y-auto pb-[env(safe-area-inset-bottom)]"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </HotkeysProvider>
  );
};

export const Spinner = ({ label = "Loading" }: { label?: string | undefined }) => (
  <div
    className="flex items-center justify-center gap-3 py-16 font-display text-xl font-bold"
    role="status"
  >
    <span className="inline-block size-6 animate-spin rounded-md border-[3px] border-ink border-t-marker" />
    {label}…
  </div>
);

export const RouteError = ({ error, reset }: ErrorComponentProps) => (
  <Card tone="rose" className="mx-auto max-w-2xl p-5">
    <p className="font-display text-xl font-extrabold">Something tore.</p>
    <pre className="mt-2 overflow-auto text-xs whitespace-pre-wrap">
      {error instanceof Error ? error.message : String(error)}
    </pre>
    <div className="mt-4 flex gap-2">
      <Button size="sm" onClick={reset}>
        Try again
      </Button>
      <Link to="/" className="font-bold underline">
        Back home
      </Link>
    </div>
  </Card>
);

export const NotFoundPage = () => (
  <Card className="ruled mx-auto max-w-xl p-8 text-center">
    <p className="font-display text-5xl font-extrabold">404</p>
    <p className="mt-2 text-lg">This sheet is not in the notebook.</p>
    <Link to="/" className="mt-5 inline-block font-bold underline">
      Back home
    </Link>
  </Card>
);

export const SectionTitle = ({ children, kicker }: { children: ReactNode; kicker?: string }) => (
  <div className="mb-4">
    {kicker && (
      <p className="text-xs font-bold tracking-[0.2em] text-ink-soft uppercase">{kicker}</p>
    )}
    <h2 className="font-display text-3xl font-extrabold tracking-tight">{children}</h2>
  </div>
);
