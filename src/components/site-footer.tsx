import { BookOpenText, ExternalLink, Github } from "lucide-react";
import { TranslationHelpButton } from "~/components/translation-help-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { useAppLocale, useLocaleTranslation } from "~/lib/i18n/client";
import { cn } from "~/lib/utils";
import changelogMarkdown from "../../CHANGELOG.md?raw";

type ChangelogSection = {
  title: string;
  items: string[];
};

type ChangelogRelease = {
  version: string;
  date: string;
  sections: ChangelogSection[];
};

const REPOSITORY_URL = "https://github.com/Jamesllllllllll/request-bot";
const CUSTOMSFORGE_URL = "https://customsforge.com";
const RELEASES = parseChangelog(changelogMarkdown);

export function SiteFooter() {
  const { locale } = useAppLocale();
  const { t } = useLocaleTranslation("common");

  return (
    <footer className="mt-6 border border-(--border) bg-(--panel-soft) max-[960px]:mt-0 max-[960px]:border-x-0 max-[960px]:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 text-sm text-(--muted) min-[961px]:px-6 max-[720px]:px-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 leading-6">
          <div className="flex items-center gap-2">
            <span>{t("footer.openSource", { brand: t("brand.name") })}</span>
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-(--text) underline decoration-(--border-strong) underline-offset-4 transition-colors hover:text-(--brand)"
            >
              <Github className="h-3.5 w-3.5" />
              <span>{t("footer.repository")}</span>
            </a>
          </div>

          <div className="flex items-center gap-2">
            <span>{t("footer.poweredBy")}</span>
            <a
              href={CUSTOMSFORGE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-(--text) underline decoration-(--border-strong) underline-offset-4 transition-colors hover:text-(--brand)"
            >
              <span>CustomsForge</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <TranslationHelpButton
            align="end"
            className="h-auto border-(--border) bg-(--panel) px-3 py-2 text-[0.74rem] text-(--text) hover:border-(--brand) hover:bg-(--bg-elevated)"
          />
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-2 border border-(--border) bg-(--panel) px-3 py-2 text-[0.74rem] font-medium uppercase tracking-[0.12em] text-(--text) transition-[background,border-color,color] hover:border-(--brand) hover:bg-(--bg-elevated)"
              >
                <BookOpenText className="h-4 w-4" />
                <span>{t("footer.changelog")}</span>
              </button>
            </DialogTrigger>
            <DialogContent className="w-[min(76rem,calc(100vw-2rem))] max-w-[min(76rem,calc(100vw-2rem))] border-(--border) bg-(--panel) p-0 text-(--text) sm:max-w-[min(76rem,calc(100vw-2rem))]">
              <DialogHeader className="border-b border-(--border) px-6 py-5">
                <DialogTitle className="text-2xl font-semibold tracking-[-0.02em] text-(--text)">
                  {t("footer.changelogTitle", { brand: t("brand.name") })}
                </DialogTitle>
                <DialogDescription className="max-w-3xl text-sm leading-6 text-(--muted)">
                  {t("footer.changelogDescription")}
                  {locale === "en" ? null : (
                    <> {t("footer.changelogEnglishNote")}</>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-[min(78vh,56rem)] overflow-y-auto px-6 py-6">
                <div className="grid gap-5">
                  {RELEASES.map((release) => {
                    const majorUpdate = isMajorUpdate(release.version);

                    return (
                      <section
                        key={release.version}
                        className={cn(
                          "border bg-(--panel-soft) p-5",
                          majorUpdate
                            ? "border-(--brand) bg-linear-to-br from-(--panel) via-(--panel-soft) to-(--panel-muted)"
                            : "border-(--border)"
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-2xl font-semibold tracking-[-0.03em] text-(--text)">
                            {release.version}
                          </h3>
                          <span
                            className={cn(
                              "border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]",
                              majorUpdate
                                ? "border-(--brand) bg-(--brand) text-white"
                                : "border-(--border) bg-(--panel) text-(--muted)"
                            )}
                          >
                            {majorUpdate
                              ? t("footer.majorUpdate")
                              : t("footer.patchRelease")}
                          </span>
                          <span className="text-sm text-(--muted)">
                            {formatReleaseDate(release.date, locale)}
                          </span>
                        </div>

                        <div className="mt-5 grid gap-4">
                          {release.sections.map((section) => (
                            <div key={`${release.version}-${section.title}`}>
                              <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-(--brand-deep)">
                                {mapSectionTitle(section.title, t)}
                              </h4>
                              <ul className="mt-2 grid gap-2 text-sm leading-7 text-(--text)">
                                {section.items.map((item, index) => (
                                  <li
                                    key={`${release.version}-${section.title}-${index}`}
                                    className="border-l border-(--border-strong) pl-3"
                                  >
                                    {renderInlineText(item)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </footer>
  );
}

function parseChangelog(markdown: string): ChangelogRelease[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const releases: ChangelogRelease[] = [];
  let currentRelease: ChangelogRelease | null = null;
  let currentSection: ChangelogSection | null = null;
  let lastItemIndex = -1;

  for (const rawLine of lines) {
    const versionMatch = rawLine.match(
      /^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})$/
    );
    if (versionMatch) {
      const [, version, date] = versionMatch;
      if (!version || !date) {
        continue;
      }

      currentRelease = {
        version,
        date,
        sections: [],
      };
      releases.push(currentRelease);
      currentSection = null;
      lastItemIndex = -1;
      continue;
    }

    const sectionMatch = rawLine.match(/^### (.+)$/);
    if (sectionMatch && currentRelease) {
      const [, title] = sectionMatch;
      if (!title) {
        continue;
      }

      currentSection = {
        title,
        items: [],
      };
      currentRelease.sections.push(currentSection);
      lastItemIndex = -1;
      continue;
    }

    if (rawLine.startsWith("- ") && currentSection) {
      currentSection.items.push(rawLine.slice(2).trim());
      lastItemIndex = currentSection.items.length - 1;
      continue;
    }

    if (
      currentSection &&
      lastItemIndex >= 0 &&
      rawLine.trim().length > 0 &&
      !rawLine.startsWith("#")
    ) {
      currentSection.items[lastItemIndex] =
        `${currentSection.items[lastItemIndex]} ${rawLine.trim()}`;
    }
  }

  return releases;
}

function isMajorUpdate(version: string) {
  const [, , patch] = version.split(".").map((part) => Number(part));
  return Number.isFinite(patch) && patch === 0;
}

function formatReleaseDate(date: string, locale: string) {
  const parsed = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

function mapSectionTitle(
  title: string,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (title) {
    case "Added":
      return t("footer.groups.added");
    case "Changed":
      return t("footer.groups.changed");
    case "Fixed":
      return t("footer.groups.fixed");
    case "Removed":
      return t("footer.groups.removed");
    default:
      return title;
  }
}

function renderInlineText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong
          key={`${part}-${index}`}
          className="font-semibold text-(--text)"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${part}-${index}`}
          className="border border-(--border) bg-(--panel) px-1.5 py-0.5 text-[0.92em] text-(--text)"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return part;
  });
}
