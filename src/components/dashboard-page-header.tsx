import type { ReactNode } from "react";

type DashboardPageHeaderProps = {
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
};

export function DashboardPageHeader(props: DashboardPageHeaderProps) {
  return (
    <section className="dashboard-page-header surface-grid surface-noise rounded-[34px] border border-(--border-strong) bg-(--panel) p-6 shadow-(--shadow) md:p-8">
      <div className="dashboard-page-header__layout flex flex-wrap items-start justify-between gap-5">
        <div className="dashboard-page-header__main max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-(--text)">
            {props.title}
          </h1>
          {props.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-7 text-(--muted)">
              {props.description}
            </p>
          ) : null}
          {props.meta ? (
            <div className="dashboard-page-header__meta mt-5">{props.meta}</div>
          ) : null}
          {props.actions ? (
            <div className="dashboard-page-header__actions mt-5 flex flex-wrap gap-3">
              {props.actions}
            </div>
          ) : null}
        </div>

        {props.aside ? (
          <div className="dashboard-page-header__aside grid shrink-0 gap-3 md:justify-items-end">
            {props.aside}
          </div>
        ) : null}
      </div>
    </section>
  );
}
