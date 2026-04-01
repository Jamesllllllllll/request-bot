import { Languages } from "lucide-react";
import { useAppLocale, useLocaleTranslation } from "~/lib/i18n/client";
import { type AppLocale, localeOptions } from "~/lib/i18n/locales";
import { cn } from "~/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";

export function LanguagePicker(props: { className?: string }) {
  const { locale, setLocale, isSavingLocale } = useAppLocale();
  const { t } = useLocaleTranslation("common");
  const selectedLocaleLabel =
    localeOptions.find((option) => option.value === locale)?.nativeLabel ??
    localeOptions[0].nativeLabel;

  return (
    <div className={cn("shrink-0", props.className)}>
      <Select
        value={locale}
        onValueChange={(value) => void setLocale(value as AppLocale)}
        disabled={isSavingLocale}
      >
        <SelectTrigger
          aria-label={t("language.label")}
          className="h-[34px] w-auto min-w-0 gap-2 px-3 py-1.5 text-sm whitespace-nowrap"
        >
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 shrink-0" />
            <span>{selectedLocaleLabel}</span>
          </div>
        </SelectTrigger>
        <SelectContent>
          {localeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.nativeLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
