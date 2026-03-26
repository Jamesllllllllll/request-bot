// Route: Defines the shared dashboard shell and authenticated channel context.
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Outlet,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { Activity, Settings2, Wrench } from "lucide-react";
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
  href?: string;
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
  const activeDashboardPath =
    navItems.find((item) =>
      item.exact ? pathname === item.to : pathname.startsWith(item.to)
    )?.to ?? "/dashboard";

  return (
    <section className="grid gap-6 [container-type:inline-size] min-[961px]:grid-cols-[minmax(0,320px)_minmax(0,1fr)] min-[961px]:items-start max-[960px]:gap-0">
      <aside className="surface-grid surface-noise grid gap-6 rounded-[34px] border border-(--border-strong) bg-(--panel) p-6 shadow-(--shadow) max-[960px]:gap-0 max-[960px]:rounded-none max-[960px]:border-x-0 max-[960px]:bg-(--panel) max-[960px]:px-[0.875rem] max-[960px]:py-3 max-[960px]:shadow-none">
        <div className="mt-4 min-[961px]:hidden max-[960px]:mt-0">
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

        <div className="mt-6 hidden gap-3 min-[961px]:grid">
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
          <div className="mt-6 hidden gap-3 min-[961px]:grid">
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

      <div className="rounded-[34px] border border-(--border-strong) bg-(--bg-elevated) p-6 shadow-(--shadow) md:p-8 max-[960px]:rounded-none max-[960px]:border-x-0 max-[960px]:bg-(--bg-elevated) max-[960px]:px-[0.875rem] max-[960px]:py-4 max-[960px]:shadow-none">
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
