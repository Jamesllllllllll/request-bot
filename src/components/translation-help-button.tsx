import { Languages } from "lucide-react";
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
  compactOnMobile?: boolean;
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
          aria-label={t("translationHelp.button")}
          title={
            props.compactOnMobile ? t("translationHelp.button") : undefined
          }
          className={cn(
            "h-8 shrink-0 px-2.5 text-[11px] font-normal normal-case tracking-normal [font-family:var(--font-body)]",
            props.compactOnMobile
              ? "max-[960px]:h-[34px] max-[960px]:w-[34px] max-[960px]:min-w-[34px] max-[960px]:border-transparent max-[960px]:bg-(--brand) max-[960px]:px-0 max-[960px]:text-white max-[960px]:shadow-(--glow) max-[960px]:hover:bg-(--brand-strong)"
              : null,
            props.className
          )}
        >
          {props.compactOnMobile ? (
            <>
              <Languages className="h-4 w-4 min-[961px]:hidden" />
              <span className="max-[960px]:sr-only">
                {t("translationHelp.button")}
              </span>
            </>
          ) : null}
          <span className={props.compactOnMobile ? "max-[960px]:hidden" : ""}>
            {t("translationHelp.button")}
          </span>
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
