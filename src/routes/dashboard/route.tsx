// Route: Defines the shared dashboard shell and authenticated channel context.
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Outlet,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import {
  Activity,
  ListMusic,
  MonitorPlay,
  Settings2,
  Shield,
  Wrench,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
  | "/dashboard/playlist"
  | "/dashboard/moderation"
  | "/dashboard/overlay"
  | "/dashboard/settings"
  | "/dashboard/admin";

const primaryNav: DashboardNavItem[] = [
  {
    to: "/dashboard" as const,
    label: "Overview",
    icon: Activity,
    exact: true,
  },
  {
    to: "/dashboard/playlist" as const,
    label: "Manage Playlist",
    icon: ListMusic,
  },
  {
    to: "/dashboard/moderation" as const,
    label: "Moderation",
    icon: Shield,
  },
  {
    to: "/dashboard/overlay" as const,
    label: "Overlay",
    icon: MonitorPlay,
  },
  {
    to: "/dashboard/settings" as const,
    label: "Settings",
    icon: Settings2,
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
  const router = useRouter();
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
  const navItems = isAdmin ? [...primaryNav, ...adminNav] : primaryNav;
  const activeDashboardPath =
    navItems.find((item) =>
      item.exact ? pathname === item.to : pathname.startsWith(item.to)
    )?.to ?? "/dashboard";

  return (
    <section className="dashboard-layout grid gap-6">
      <aside className="dashboard-layout__sidebar surface-grid surface-noise rounded-[34px] border border-(--border-strong) bg-(--panel) p-6 shadow-(--shadow)">
        <div className="dashboard-layout__mobile-nav mt-4">
          <Select
            value={activeDashboardPath}
            onValueChange={(value) =>
              router.navigate({ to: value as DashboardRoutePath })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a section" />
            </SelectTrigger>
            <SelectContent>
              {primaryNav.map((item) => (
                <SelectItem key={item.to} value={item.to}>
                  {item.label}
                </SelectItem>
              ))}
              {isAdmin
                ? adminNav.map((item) => (
                    <SelectItem key={item.to} value={item.to}>
                      {item.label}
                    </SelectItem>
                  ))
                : null}
            </SelectContent>
          </Select>
        </div>

        <div className="dashboard-layout__desktop-nav mt-6 grid gap-3">
          {primaryNav.map((item) => (
            <DashboardNavLink
              key={item.to}
              to={item.to}
              exact={item.exact}
              label={item.label}
              icon={item.icon}
            />
          ))}
        </div>

        {isAdmin ? (
          <div className="dashboard-layout__desktop-nav mt-6 grid gap-3">
            <p className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
              Admin
            </p>
            {adminNav.map((item) => (
              <DashboardNavLink
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
              />
            ))}
          </div>
        ) : null}
      </aside>

      <div className="dashboard-layout__content rounded-[34px] border border-(--border-strong) bg-(--bg-elevated) p-6 shadow-(--shadow) md:p-8">
        <Outlet />
      </div>
    </section>
  );
}

function DashboardNavLink(props: {} & DashboardNavItem) {
  const Icon = props.icon;

  return (
    <Link
      to={props.to}
      activeOptions={props.exact ? { exact: true } : undefined}
      className="block no-underline"
      activeProps={{
        className: "block no-underline",
      }}
    >
      {({ isActive }: { isActive: boolean }) => (
        <div
          className={cn(
            "rounded-[24px] border px-4 py-4 transition-all",
            isActive
              ? "border-(--brand) bg-(--panel-soft) shadow-(--shadow-soft)"
              : "border-(--border) bg-(--panel-muted) hover:bg-(--panel-soft)"
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
                isActive
                  ? "border-(--brand) bg-(--brand) text-white"
                  : "border-(--border) bg-(--panel) text-(--brand-deep)"
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-base font-semibold text-(--text)">
              {props.label}
            </p>
          </div>
        </div>
      )}
    </Link>
  );
}
