// Route: Renders the public landing page with sign-in and search entry points.
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ExternalLink,
  Radio,
  Search,
  Settings2,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { pageTitle } from "~/lib/page-title";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: pageTitle("Home") }],
  }),
  component: HomePage,
});

function HomePage() {
  const { data: sessionData } = useQuery({
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
        };
      }>;
    },
  });
  const { data } = useQuery({
    queryKey: ["home-live-channels"],
    queryFn: async () => {
      const response = await fetch("/api/channels/live");
      return response.json() as Promise<{
        channels: Array<{
          id: string;
          slug: string;
          displayName: string;
          login: string;
        }>;
      }>;
    },
  });
  const viewer = sessionData?.viewer ?? null;

  return (
    <section className="home-page grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="home-page__hero surface-grid surface-noise rounded-[36px] border border-(--border-strong) bg-(--panel) p-8 shadow-(--shadow) md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-(--brand-deep)">
          Twitch Song Requests
        </p>
        <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.04em] text-(--text) md:text-6xl">
          Search songs or manage your channel.
        </h1>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            {viewer ? (
              <Link to="/dashboard" className="no-underline">
                Go to Dashboard
              </Link>
            ) : (
              <a href="/auth/twitch/start" className="no-underline">
                Sign in with Twitch
              </a>
            )}
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/search" className="no-underline">
              Search songs
            </Link>
          </Button>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <FeatureBlock
            icon={Search}
            title="Find a song"
            body="Search songs and copy the request command."
          />
          <FeatureBlock
            icon={Settings2}
            title="Manage your channel"
            body="Playlist, bot settings, and overlay."
          />
        </div>
      </div>

      <div className="grid gap-6">
        <section className="rounded-[32px] border border-(--border) bg-(--panel-strong) p-6 shadow-(--shadow-soft)">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--brand-deep)">
                Live now
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-(--text)">
                Current streamers
              </h2>
            </div>
            <div className="rounded-full border border-(--border) bg-(--panel-soft) px-3 py-1 text-xs uppercase tracking-[0.22em] text-(--muted)">
              {data?.channels?.length ?? 0} active
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {data?.channels?.length ? (
              data.channels.map((channel, index) => (
                <div
                  key={channel.id}
                  className={`rounded-[24px] border px-4 py-4 ${
                    index % 2 === 0
                      ? "border-(--border) bg-(--panel-soft)"
                      : "border-(--border) bg-(--panel-muted)"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-(--text)">
                        {channel.displayName}
                      </p>
                      <p className="mt-1 truncate text-sm text-(--brand-deep)">
                        @{channel.login}
                      </p>
                    </div>
                    <Radio className="mt-1 h-4 w-4 shrink-0 text-(--accent-strong)" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <a
                      href={`https://twitch.tv/${channel.login}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-(--text) no-underline transition-colors hover:text-(--brand)"
                    >
                      Twitch
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <a
                      href={`/${channel.slug}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-(--brand) no-underline transition-colors hover:text-(--brand-strong)"
                    >
                      Open playlist
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-(--border) bg-(--panel-soft) px-4 py-5 text-sm leading-7 text-(--muted)">
                No streamers are live with the bot active yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function FeatureBlock(props: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[28px] border border-(--border) bg-(--panel-soft) p-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-(--border) bg-(--panel-muted) text-(--brand)">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-5 text-lg font-semibold text-(--text)">{props.title}</p>
      <p className="mt-2 text-sm leading-6 text-(--muted)">{props.body}</p>
    </div>
  );
}
