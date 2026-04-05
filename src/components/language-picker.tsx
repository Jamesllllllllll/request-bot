import { Languages } from "lucide-react";
import { useAppLocale, useLocaleTranslation } from "~/lib/i18n/client";
import { type AppLocale, localeOptions } from "~/lib/i18n/locales";
import { cn } from "~/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";

export function LanguagePicker(props: { className?: string }) {
  const { locale, setLocale, isSavingLocale } = useAppLocale();
  const { t } = useLocaleTranslation("common");
  const selectedLocale =
    localeOptions.find((option) => option.value === locale) ?? localeOptions[0];

  return (
    <div className={cn("shrink-0", props.className)}>
      <Select
        value={locale}
        onValueChange={(value) => void setLocale(value as AppLocale)}
        disabled={isSavingLocale}
      >
        <SelectTrigger
          aria-label={t("language.label")}
          title={selectedLocale.nativeLabel}
          className="h-[34px] w-auto min-w-0 gap-2 px-3 py-1.5 text-sm whitespace-nowrap max-[960px]:gap-1.5 max-[960px]:px-2.5"
        >
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 shrink-0" />
            <span className="max-[960px]:hidden">
              {selectedLocale.nativeLabel}
            </span>
            <span className="min-[961px]:hidden">
              {selectedLocale.shortLabel}
            </span>
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
