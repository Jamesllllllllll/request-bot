import { cn } from "~/lib/utils";

export function StatusToggleBadge(props: {
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
  toneClassName: string;
  className?: string;
  disabled?: boolean;
  onToggle?: () => void;
  toggleAriaLabel?: string;
  onLabelClick?: () => void;
}) {
  const label = props.enabled ? props.enabledLabel : props.disabledLabel;
  const badgeClassName = cn(
    "inline-flex min-h-[35px] items-center justify-self-start gap-3 border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] select-none",
    props.toneClassName,
    props.className,
    props.disabled && props.onToggle ? "opacity-60" : null
  );

  if (!props.onToggle) {
    if (props.onLabelClick) {
      return (
        <button
          type="button"
          className={cn(
            badgeClassName,
            "transition-opacity hover:opacity-85 uppercase"
          )}
          onClick={props.onLabelClick}
        >
          {label}
        </button>
      );
    }

    return <span className={badgeClassName}>{label}</span>;
  }

  return (
    <div className={badgeClassName}>
      {props.onLabelClick ? (
        <button
          type="button"
          className="transition-opacity hover:opacity-85 uppercase"
          onClick={props.onLabelClick}
        >
          {label}
        </button>
      ) : (
        <span>{label}</span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={props.enabled}
        aria-label={props.toggleAriaLabel}
        disabled={props.disabled}
        onClick={(event) => {
          event.stopPropagation();
          props.onToggle?.();
        }}
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
          props.enabled ? "bg-emerald-400/80" : "bg-slate-500/70",
          props.disabled ? "cursor-wait opacity-60" : "hover:opacity-90"
        )}
      >
        <span
          className={cn(
            "absolute h-3 w-3 rounded-full bg-white transition-transform",
            props.enabled ? "translate-x-3.5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}
