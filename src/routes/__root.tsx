// Route: Defines the shared document shell, navigation, and app-wide providers.
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
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
import { Headphones, LogOut, Radio, SlidersHorizontal } from "lucide-react";
import { Button } from "~/components/ui/button";
import "~/app.css";
import type { AppRouterContext } from "~/router";

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  const router = useRouter();
  const queryClient = router.options.context.queryClient;

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="https://fav.farm/%F0%9F%8E%B8" />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <AppShell />
          <TanStackRouterDevtools />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}

function AppShell() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { data } = useQuery({
    queryKey: ["viewer-session"],
    queryFn: async () => {
      const response = await fetch("/api/session", {
        credentials: "include",
      });
      return response.json() as Promise<{
        viewer: null | {
          user: {
            displayName: string;
            login: string;
            profileImageUrl?: string | null;
            isAdmin?: boolean;
          };
          channel: {
            slug: string;
          } | null;
          manageableChannels?: Array<{
            slug: string;
            displayName: string;
            login: string;
            isLive: boolean;
          }>;
          needsModeratorScopeReconnect?: boolean;
        };
      }>;
    },
  });

  const viewer = data?.viewer ?? null;
  const isOverlayRoute = pathname.includes("/stream-playlist/");

  if (isOverlayRoute) {
    return <Outlet />;
  }

  return (
    <div className="app-shell mx-auto flex min-h-screen w-full max-w-[1480px] flex-col">
      <header className="app-shell__header surface-grid surface-noise mb-8 rounded-[32px] border border-(--border) bg-(--panel) shadow-(--shadow) backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-4">
            <Link to="/" className="group flex items-center gap-4 no-underline">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-(--border-strong) bg-(--panel-soft) text-(--brand)">
                <Headphones className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="app-shell__brand-meta text-[11px] font-semibold uppercase tracking-[0.22em] text-(--brand-deep)">
                  Twitch Song Requests
                </p>
                <p className="app-shell__brand-title truncate text-2xl font-semibold tracking-tight text-(--text)">
                  Request Bot
                </p>
              </div>
            </Link>
          </div>

          <div className="app-shell__controls flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
            <nav className="app-shell__nav flex items-center gap-2 rounded-full border border-(--border) bg-(--panel-soft) p-1.5 text-sm">
              <NavLink to="/search" label="Search" icon={Radio} />
              {viewer ? (
                <NavLink
                  to="/dashboard"
                  label="Dashboard"
                  icon={SlidersHorizontal}
                  active={
                    pathname === "/dashboard" ||
                    pathname.startsWith("/dashboard/playlist") ||
                    pathname.startsWith("/dashboard/moderation") ||
                    pathname.startsWith("/dashboard/overlay") ||
                    pathname.startsWith("/dashboard/settings")
                  }
                />
              ) : null}
            </nav>

            {viewer ? (
              <div className="app-shell__user flex min-w-0 items-center gap-2 rounded-full border border-(--border) bg-(--panel-soft) p-1.5">
                <Link
                  to={viewer.channel ? "/$slug" : "/dashboard"}
                  params={
                    viewer.channel ? { slug: viewer.channel.slug } : undefined
                  }
                  className="app-shell__user-link flex min-w-0 items-center gap-2 px-1.5 no-underline"
                >
                  {viewer.user.profileImageUrl ? (
                    <span
                      className="block shrink-0 overflow-hidden rounded-full border border-(--border-strong)"
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
                        className="block rounded-full object-cover"
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
                    <div className="flex h-[34px] w-[34px] min-h-[34px] min-w-[34px] shrink-0 items-center justify-center rounded-full border border-(--border-strong) bg-(--brand) text-xs font-semibold uppercase text-white">
                      {viewer.user.displayName.slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="app-shell__user-name truncate text-sm font-medium text-(--text)">
                      {viewer.user.displayName}
                    </p>
                  </div>
                </Link>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-[34px] px-3"
                >
                  <a href="/auth/logout" className="no-underline">
                    <LogOut className="h-4 w-4" />
                    <span className="app-shell__logout-label">Log out</span>
                  </a>
                </Button>
              </div>
            ) : (
              <Button asChild size="lg">
                <a href="/auth/twitch/start" className="no-underline">
                  Sign in with Twitch
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="app-shell__main flex-1">
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
    "flex items-center justify-center rounded-full bg-(--brand) px-4 py-2 text-white no-underline shadow-(--glow)";
  const inactiveClassName =
    "flex items-center justify-center rounded-full px-4 py-2 text-(--muted) no-underline";

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
        <span className="app-shell__nav-label">{props.label}</span>
      </span>
    </Link>
  );
}
