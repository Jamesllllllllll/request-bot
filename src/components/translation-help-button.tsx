import { useAppLocale, useLocaleTranslation } from "~/lib/i18n/client";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./ui/popover";

export function TranslationHelpButton(props: {
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const { locale } = useAppLocale();
  const { t } = useLocaleTranslation("common");

  if (locale === "en") {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={cn("shrink-0", props.className)}
        >
          {t("translationHelp.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={props.align ?? "end"}
        className="w-80 border-(--border) bg-(--panel) p-4 text-(--text)"
      >
        <PopoverHeader>
          <PopoverTitle className="text-(--text)">
            {t("translationHelp.title")}
          </PopoverTitle>
          <PopoverDescription className="text-sm leading-6 text-(--muted)">
            {t("translationHelp.messageLead")}{" "}
            <a
              href="mailto:support@rocklist.live"
              className="font-medium text-(--brand-deep) underline underline-offset-4"
            >
              support@rocklist.live
            </a>
            .
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}
