// Route: Defines the shared dashboard shell and authenticated channel context.
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { Activity, Settings2, Wrench } from "lucide-react";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

type DashboardNavItem = {
  to: DashboardRoutePath;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

type DashboardRoutePath =
  | "/dashboard"
  | "/dashboard/settings"
  | "/dashboard/admin";

const accountNav: DashboardNavItem[] = [
  {
    to: "/dashboard" as const,
    label: "Channels",
    icon: Activity,
    exact: true,
  },
];

const adminNav: DashboardNavItem[] = [
  {
    to: "/dashboard/admin" as const,
    label: "Admin",
    icon: Wrench,
    exact: true,
  },
];

function DashboardLayout() {
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
        };
      }>;
    },
  });

  const isAdmin = !!data?.viewer?.user?.isAdmin;
  const hasOwnerChannel = !!data?.viewer?.channel;
  const primaryNav: DashboardNavItem[] = hasOwnerChannel
    ? [
        ...accountNav,
        {
          to: "/dashboard/settings" as const,
          label: "Settings",
          icon: Settings2,
        },
      ]
    : accountNav;
  const navItems = isAdmin ? [...primaryNav, ...adminNav] : primaryNav;
  const activeDashboardPath = pathname.startsWith("/dashboard/panel-preview")
    ? "/dashboard/settings"
    : (navItems.find((item) =>
        item.exact ? pathname === item.to : pathname.startsWith(item.to)
      )?.to ?? "/dashboard");

  return (
    <section className="grid gap-4 [container-type:inline-size] max-[960px]:gap-0">
      <div className="surface-grid surface-noise border border-(--border-strong) bg-(--panel) p-2 shadow-none max-[960px]:border-x-0 max-[960px]:px-[0.875rem] max-[960px]:py-3">
        <nav className="flex w-full items-center gap-2 max-[480px]:gap-1.5">
          {navItems.map((item) => (
            <DashboardNavLink
              key={item.to}
              to={item.to}
              exact={item.exact}
              label={item.label}
              icon={item.icon}
              active={activeDashboardPath === item.to}
            />
          ))}
        </nav>
      </div>
      <div className="min-w-0 border border-(--border-strong) bg-(--bg-elevated) p-6 shadow-none md:p-8 max-[960px]:border-x-0 max-[960px]:bg-(--bg-elevated) max-[960px]:px-[0.875rem] max-[960px]:py-4 max-[960px]:shadow-none">
        <Outlet />
      </div>
    </section>
  );
}

function DashboardNavLink(
  props: DashboardNavItem & {
    active?: boolean;
  }
) {
  const Icon = props.icon;

  return (
    <Link
      to={props.to}
      activeOptions={props.exact ? { exact: true } : undefined}
      className="min-w-0 flex-1 no-underline min-[641px]:flex-none"
      activeProps={{
        className: "min-w-0 flex-1 no-underline min-[641px]:flex-none",
      }}
    >
      {({ isActive }: { isActive: boolean }) => {
        const active = props.active ?? isActive;

        return (
          <div
            className={cn(
              "flex min-h-[2.6rem] items-center justify-center gap-2 border px-3 py-2 text-center text-sm font-semibold transition-colors max-[480px]:min-h-[2.35rem] max-[480px]:px-2 max-[480px]:text-[0.78rem]",
              active
                ? "border-(--brand) bg-(--panel-soft) text-(--text) shadow-none"
                : "border-(--border) bg-(--panel-muted) text-(--muted) hover:border-(--brand) hover:bg-(--panel-soft) hover:text-(--text)"
            )}
          >
            <Icon className="h-4 w-4 shrink-0 max-[560px]:hidden" />
            <span className="truncate">{props.label}</span>
          </div>
        );
      }}
    </Link>
  );
}
