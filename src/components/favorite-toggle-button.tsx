import { Heart } from "lucide-react";
import type { MouseEvent } from "react";
import { Button } from "~/components/ui/button";
import { useLocaleTranslation } from "~/lib/i18n/client";
import { cn } from "~/lib/utils";

export function FavoriteToggleButton(props: {
  favorited: boolean;
  pending?: boolean;
  onToggle?: () => void;
  className?: string;
  iconClassName?: string;
}) {
  const { t } = useLocaleTranslation("playlist");
  const label = t(
    props.favorited ? "favorites.unfavoriteAria" : "favorites.favoriteAria"
  );

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "h-8 w-8 shrink-0 px-0 text-(--muted) shadow-none hover:bg-transparent hover:text-(--text)",
        props.favorited ? "text-rose-300 hover:text-rose-200" : null,
        props.className
      )}
      aria-label={label}
      aria-pressed={props.favorited}
      title={label}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        props.onToggle?.();
      }}
      disabled={props.pending || !props.onToggle}
    >
      <Heart
        className={cn(
          "h-4 w-4",
          props.favorited ? "fill-current text-rose-300" : "text-(--muted)",
          props.iconClassName
        )}
      />
    </Button>
  );
}
