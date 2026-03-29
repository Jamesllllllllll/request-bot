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
    <section className="surface-grid surface-noise border border-(--border-strong) bg-(--panel) p-6 shadow-none md:p-8 max-[960px]:border-0 max-[960px]:bg-transparent max-[960px]:px-0 max-[960px]:py-4 max-[960px]:shadow-none max-[960px]:[background-image:none]">
      <div className="flex flex-wrap items-start justify-between gap-5 max-[960px]:gap-4">
        <div className="max-w-3xl max-[720px]:w-full max-[720px]:max-w-none">
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-(--text) max-[720px]:text-[clamp(2rem,9vw,2.75rem)]">
            {props.title}
          </h1>
          {props.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-7 text-(--muted)">
              {props.description}
            </p>
          ) : null}
          {props.meta ? (
            <div className="mt-5 max-[720px]:mt-4">{props.meta}</div>
          ) : null}
          {props.actions ? (
            <div className="mt-5 flex flex-wrap gap-3 max-[720px]:mt-4 max-[720px]:[&>*]:w-full">
              {props.actions}
            </div>
          ) : null}
        </div>

        {props.aside ? (
          <div className="grid w-full min-w-0 gap-3 md:w-auto md:max-w-sm md:justify-items-end max-[720px]:max-w-none">
            {props.aside}
          </div>
        ) : null}
      </div>
    </section>
  );
}
