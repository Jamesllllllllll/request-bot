import type { RequesterChatBadge } from "~/lib/twitch/chat-badges";
import { cn } from "~/lib/utils";

export function RequesterChatBadges(props: {
  badges?: RequesterChatBadge[] | null;
  className?: string;
  badgeClassName?: string;
}) {
  const badges = props.badges ?? [];
  if (!badges.length) {
    return null;
  }

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1", props.className)}
    >
      {badges.map((badge) => (
        <img
          key={`${badge.setId}:${badge.versionId}:${badge.imageUrl2x}`}
          src={badge.imageUrl2x}
          alt={badge.title}
          title={badge.description ?? badge.title}
          className={cn(
            "h-[18px] w-[18px] shrink-0 object-contain",
            props.badgeClassName
          )}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      ))}
    </span>
  );
}
