import { useAppLocale, useLocaleTranslation } from "~/lib/i18n/client";
import { getPickBadgeAppearance, getPickBadgeLabel } from "~/lib/pick-order";
import { cn } from "~/lib/utils";

type PickOrderBadgeVariant = "public" | "overlay" | "panel";

const variantClassNames: Record<PickOrderBadgeVariant, string> = {
  public:
    "inline-flex items-center border border-transparent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white",
  overlay:
    "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white",
  panel:
    "inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] leading-none font-semibold uppercase tracking-[0.12em] text-white",
};

export function PickOrderBadge(props: {
  pickNumber: number;
  variant?: PickOrderBadgeVariant;
  className?: string;
}) {
  const { locale } = useAppLocale();
  const { t } = useLocaleTranslation("playlist");
  const label = getPickBadgeLabel({
    locale,
    pickNumber: props.pickNumber,
    translate: (key, options) => t(key, options),
  });
  const appearance = getPickBadgeAppearance(props.pickNumber);
  const variant = props.variant ?? "public";

  return (
    <span
      className={cn(variantClassNames[variant], props.className)}
      style={{ background: appearance.background }}
    >
      {label}
    </span>
  );
}
