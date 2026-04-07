// Route: Defines the shared document shell, navigation, and app-wide providers.
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import {
  AlertTriangle,
  Headphones,
  LogOut,
  Radio,
  Settings2,
} from "lucide-react";
import { LanguagePicker } from "~/components/language-picker";
import { TranslationHelpButton } from "~/components/translation-help-button";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import "~/app.css";
import { AppI18nProvider, useLocaleTranslation } from "~/lib/i18n/client";
import { getInitialLocale } from "~/lib/i18n/get-initial-locale";
import { getViewerSession } from "~/lib/server/viewer";
import type { ViewerSessionData } from "~/lib/server/viewer-session-data";
import { viewerSessionQueryOptions } from "~/lib/viewer-session-query";
import type { AppRouterContext } from "~/router";

export const Route = createRootRouteWithContext<AppRouterContext>()({
  loader: async () => {
    const [locale, initialViewerSession] = await Promise.all([
      getInitialLocale(),
      getViewerSession(),
    ]);

    return {
      locale,
      initialViewerSession,
    };
  },
  staleTime: Number.POSITIVE_INFINITY,
  component: RootComponent,
});

function RootComponent() {
  const { locale } = Route.useLoaderData();
  const router = useRouter();
  const queryClient = router.options.context.queryClient;
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isExtensionRoute = pathname.startsWith("/extension/");
  const showDevtools = import.meta.env.DEV && !isExtensionRoute;

  return (
    <html lang={locale}>
      <head>
        {isExtensionRoute ? (
          <script
            src="https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js"
            data-twitch-extension-helper="true"
          />
        ) : null}
        <HeadContent />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="https://fav.farm/%F0%9F%8E%B8" />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <AppI18nProvider initialLocale={locale}>
            <AppShell />
          </AppI18nProvider>
          {showDevtools ? <TanStackRouterDevtools /> : null}
          {showDevtools ? (
            <ReactQueryDevtools buttonPosition="bottom-right" />
          ) : null}
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}

function AppShell() {
  const { initialViewerSession } = Route.useLoaderData();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { t } = useLocaleTranslation("common");
  const isOverlayRoute = pathname.includes("/stream-playlist/");
  const isExtensionRoute = pathname.startsWith("/extension/");
  const shouldBypassShell = isOverlayRoute || isExtensionRoute;
  const { data } = useQuery<ViewerSessionData>({
    queryKey: ["viewer-session"],
    enabled: !shouldBypassShell,
    initialData: initialViewerSession,
    queryFn: async () => {
      const response = await fetch("/api/session", {
        credentials: "include",
      });
      return response.json() as Promise<ViewerSessionData>;
    },
    ...viewerSessionQueryOptions,
  });

  const viewer = data?.viewer ?? null;
  const reconnectHref = `/auth/twitch/start?redirectTo=${encodeURIComponent(pathname)}`;
  const needsTwitchReconnect =
    !!viewer?.needsBroadcasterScopeReconnect ||
    !!viewer?.needsModeratorScopeReconnect;

  if (shouldBypassShell) {
    return <Outlet />;
  }

  return (
    <div className="app-shell mx-auto flex min-h-screen w-full max-w-[1480px] flex-col [container-type:inline-size] min-[961px]:px-6 min-[961px]:py-6 max-[960px]:p-0">
      <header className="surface-grid surface-noise mb-6 border border-(--border) bg-(--panel) px-4 py-3 shadow-none backdrop-blur-xl min-[961px]:px-6 min-[961px]:py-4 max-[960px]:mb-0 max-[960px]:border-x-0 max-[960px]:shadow-none max-[720px]:px-[0.875rem] max-[720px]:py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-4">
            <Link to="/" className="group flex items-center gap-4 no-underline">
              <div className="flex h-10 w-10 items-center justify-center border border-(--border-strong) bg-(--panel-soft) text-(--brand)">
                <Headphones className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-4xl font-semibold [font-family:var(--font-accent)] tracking-tight text-(--text) max-[960px]:hidden">
                  RockList.Live
                </p>
              </div>
            </Link>
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3 max-[960px]:flex-[0_1_auto] max-[960px]:justify-start">
            <LanguagePicker />
            <TranslationHelpButton compactOnMobile />
            <nav className="flex max-w-full flex-wrap items-center gap-1 border border-(--border) bg-(--panel-soft) p-0 text-sm max-[960px]:w-auto max-[960px]:self-start max-[960px]:gap-[0.35rem]">
              <NavLink
                to="/search"
                label={t("nav.search")}
                icon={Radio}
                active={pathname === "/search"}
              />
              {viewer ? (
                <NavLink
                  to="/dashboard"
                  label={t("nav.account")}
                  icon={Settings2}
                  active={
                    pathname === "/dashboard" ||
                    pathname.startsWith("/dashboard/settings")
                  }
                />
              ) : null}
            </nav>

            {viewer ? (
              <div className="flex min-w-0 items-center border border-(--border) bg-(--panel-soft) p-0.5 max-[960px]:p-0 max-[960px]:w-auto max-[960px]:max-w-full max-[960px]:self-start">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        to={viewer.channel ? "/$slug" : "/dashboard"}
                        params={
                          viewer.channel
                            ? { slug: viewer.channel.slug }
                            : undefined
                        }
                        className="flex min-w-0 flex-1 items-center gap-2 no-underline px-0"
                      >
                        {viewer.user.profileImageUrl ? (
                          <span
                            className="block shrink-0 overflow-hidden border border-(--border-strong) max-[960px]:border-0"
                            style={{
                              width: 34,
                              height: 34,
                              minWidth: 34,
                              minHeight: 34,
                              maxWidth: 34,
                              maxHeight: 34,
                            }}
                          >
                            <img
                              src={viewer.user.profileImageUrl}
                              alt={viewer.user.displayName}
                              className="block object-cover"
                              style={{
                                width: "100%",
                                height: "100%",
                                minWidth: "100%",
                                minHeight: "100%",
                                maxWidth: "100%",
                                maxHeight: "100%",
                              }}
                            />
                          </span>
                        ) : (
                          <div className="flex h-[34px] w-[34px] min-h-[34px] min-w-[34px] shrink-0 items-center justify-center border border-(--border-strong) bg-(--brand) pr-2 text-xs font-semibold uppercase text-white">
                            {viewer.user.displayName.slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="max-w-[14rem] truncate pr-2 text-sm font-medium text-(--text) max-[960px]:hidden">
                            {viewer.user.displayName}
                          </p>
                        </div>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>{t("auth.goToPlaylist")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-[34px] px-3 max-[960px]:h-[2.2rem] max-[960px]:w-[2.2rem] max-[960px]:min-w-[2.2rem] max-[960px]:px-0 max-[960px]:border-0"
                >
                  <a href="/auth/logout" className="no-underline">
                    <LogOut className="h-4 w-4" />
                    <span className="max-[960px]:hidden">
                      {t("auth.logOut")}
                    </span>
                  </a>
                </Button>
              </div>
            ) : (
              <Button asChild variant="default" size="sm" className="px-4">
                <a href="/auth/twitch/start" className="no-underline">
                  {t("auth.signIn")}
                </a>
              </Button>
            )}
          </div>
        </div>
        {viewer && needsTwitchReconnect ? (
          <div className="border-t border-(--border) px-4 py-4 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <div className="flex min-w-0 items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="min-w-0">{t("auth.permissionsRefresh")}</p>
              </div>
              <Button asChild size="sm" className="shrink-0">
                <a href={reconnectHref} className="no-underline">
                  {t("auth.reconnect")}
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </header>
      <main className="app-shell__main min-w-0 flex-1 max-[960px]:border-t max-[960px]:border-(--border)">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink(props: {
  to: "/search" | "/dashboard";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  active?: boolean;
}) {
  const Icon = props.icon;
  const activeClassName =
    "flex items-center justify-center rounded-none border border-transparent bg-(--brand) px-4 py-2 text-white no-underline shadow-(--glow) transition-[background,color,border-color,box-shadow] hover:border-(--brand) hover:bg-(--brand-strong) max-[960px]:h-[2.2rem] max-[960px]:w-[2.2rem] max-[960px]:min-w-[2.2rem] max-[960px]:px-0 max-[960px]:py-0";
  const inactiveClassName =
    "flex items-center justify-center rounded-none border border-transparent bg-transparent px-4 py-2 text-(--muted) no-underline transition-[background,color,border-color] hover:border-(--brand) hover:bg-(--panel) hover:text-(--text) max-[960px]:h-[2.2rem] max-[960px]:w-[2.2rem] max-[960px]:min-w-[2.2rem] max-[960px]:px-0 max-[960px]:py-0";

  return (
    <Link
      to={props.to}
      activeOptions={
        props.exact
          ? {
              exact: true,
            }
          : undefined
      }
      className={props.active ? activeClassName : inactiveClassName}
      activeProps={
        props.active == null ? { className: activeClassName } : undefined
      }
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="max-[960px]:hidden">{props.label}</span>
      </span>
    </Link>
  );
}
