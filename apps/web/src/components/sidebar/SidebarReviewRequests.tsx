import { useLocation, useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import type { SidebarKindFilter } from "~/uiStateStore";
import { RelativeTime } from "../RelativeTime";
import { guideRunKey, useGuideRunStore } from "../pullRequest/guide/guideRunStore";
import type { EnvironmentPullRequestEntry } from "../pullRequest/pullRequestList.logic";
import { PullRequestStateGlyph } from "../pullRequest/pullRequestPresentation";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
import { useSidebar } from "../ui/sidebar";

const KIND_TAGS = ["all", "threads", "reviews"] as const satisfies ReadonlyArray<SidebarKindFilter>;

export function SidebarKindTags({
  value,
  onChange,
  reviewCount,
}: {
  value: SidebarKindFilter;
  onChange: (filter: SidebarKindFilter) => void;
  reviewCount: number;
}) {
  const gt = useGT();
  const labels: Record<SidebarKindFilter, string> = {
    all: gt("All", { $context: "sidebar filter" }),
    threads: gt("Threads", { $context: "sidebar filter" }),
    reviews: gt("Reviews", { $context: "sidebar filter" }),
  };
  return (
    <div role="group" aria-label={gt("Show in sidebar")} className="flex items-center gap-0.5 px-1">
      {KIND_TAGS.map((tag) => {
        const count = tag === "reviews" ? reviewCount : 0;
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={value === tag}
            aria-label={
              count > 0
                ? gt("{label}, {count} waiting on you", { label: labels[tag], count })
                : undefined
            }
            onClick={() => onChange(tag)}
            className={cn(
              "inline-flex h-5 cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              value === tag
                ? "bg-sidebar-row-active font-medium text-sidebar-foreground"
                : "text-sidebar-muted-foreground hover:text-sidebar-foreground",
            )}
          >
            {labels[tag]}
            {count > 0 ? (
              <span
                aria-hidden
                data-testid="sidebar-review-count"
                className="font-medium tabular-nums text-primary"
              >
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SidebarReviewRequestSection({
  requests,
  isPending,
  error,
  standalone,
}: {
  requests: ReadonlyArray<EnvironmentPullRequestEntry>;
  isPending: boolean;
  error: { readonly message: string } | null;
  /** Reviews alone fill the sidebar, so an empty list says so instead of hiding. */
  standalone: boolean;
}) {
  const gt = useGT();
  const [expanded, setExpanded] = useState(true);
  if (!standalone && requests.length === 0) return null;
  const status =
    requests.length > 0
      ? null
      : isPending
        ? gt("Loading review requests…")
        : error !== null
          ? gt("Couldn't load review requests")
          : gt("No pull requests are waiting on your review");
  return (
    <section aria-label={gt("Review requests")} className="flex flex-col gap-px pb-2">
      {standalone ? null : (
        <CollapsibleSectionHeader
          expanded={expanded}
          tone="emphasized"
          onClick={() => setExpanded((value) => !value)}
          accessory={
            <span className="shrink-0 text-2xs tabular-nums text-sidebar-muted-foreground">
              {requests.length}
            </span>
          }
        >
          <T>Review requests</T>
        </CollapsibleSectionHeader>
      )}
      {status !== null ? (
        <p role="status" className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground">
          {status}
        </p>
      ) : expanded || standalone ? (
        <ul className="flex flex-col gap-px">
          {requests.map((entry) => (
            <SidebarReviewRequestRow
              key={`${entry.environmentId}:${entry.host}:${entry.repository}#${entry.number}`}
              entry={entry}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function SidebarReviewRequestRow({
  entry,
  variant = "compact",
}: {
  entry: EnvironmentPullRequestEntry;
  variant?: "card" | "compact";
}) {
  const gt = useGT();
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const isActive = useLocation({
    select: (location) => {
      if (location.pathname !== "/pull-requests") return false;
      const search = location.search as { repository?: unknown; number?: unknown };
      return (
        search.number === entry.number &&
        typeof search.repository === "string" &&
        search.repository.toLowerCase() === entry.repository.toLowerCase()
      );
    },
  });
  const open = () => {
    if (isMobile) setOpenMobile(false);
    // Reviewing starts from the changed files.
    useGuideRunStore.getState().showPageDetailTab(
      guideRunKey(entry.environmentId, {
        projectId: entry.projectId,
        host: entry.host,
        repository: entry.repository,
        number: entry.number,
      }),
      "code",
    );
    void navigate({
      to: "/pull-requests",
      search: {
        involvement: "reviewing",
        state: "open",
        repository: entry.repository,
        number: entry.number,
        selectedHost: entry.host,
        selectedProjectId: entry.projectId,
        selectedEnvironmentId: entry.environmentId,
      },
    });
  };
  const label = gt("Review {repository} #{number}: {title}", {
    repository: entry.repository,
    number: entry.number,
    title: entry.title,
  });
  const repositoryName = entry.repository.split("/").at(-1);
  const surface = cn(
    "group/sidebar-row w-full cursor-pointer rounded-md text-left outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    isActive
      ? "bg-sidebar-row-active text-sidebar-foreground light:ring-1 light:ring-inset light:ring-sidebar-border/70"
      : "hover:bg-sidebar-row-hover",
  );
  if (variant === "card") {
    // Mirrors the thread card, so a pull request reads as one more item among the threads.
    return (
      <li className="list-none py-0.5">
        <button
          type="button"
          data-testid="sidebar-review-request"
          aria-current={isActive ? "page" : undefined}
          aria-label={label}
          onClick={open}
          className={cn(
            surface,
            "block px-(--sidebar-row-content-inset) py-(--sidebar-content-inset)",
          )}
        >
          <span className="flex h-5 min-w-0 items-center gap-1.5 text-xs text-secondary-label">
            <PullRequestStateGlyph state={entry.state} isDraft={entry.isDraft} />
            <span className="min-w-0 flex-1 truncate">{repositoryName}</span>
            <span className="shrink-0 tabular-nums">
              <RelativeTime timestamp={entry.updatedAt} />
            </span>
          </span>
          <span className="mt-1 block truncate text-sm font-medium text-foreground">
            {entry.title}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-secondary-label">
            <span className="shrink-0 font-mono tabular-nums">#{entry.number}</span>
            {entry.author ? (
              <>
                <span aria-hidden>·</span>
                <span className="min-w-0 truncate">{entry.author.login}</span>
              </>
            ) : null}
            <span className="ms-auto shrink-0 text-primary">
              <T>Review</T>
            </span>
          </span>
        </button>
      </li>
    );
  }
  return (
    <li className="list-none">
      <button
        type="button"
        data-testid="sidebar-review-request"
        aria-current={isActive ? "page" : undefined}
        aria-label={label}
        onClick={open}
        className={cn(surface, "flex flex-col justify-center gap-0.5 px-2.5 py-1.5")}
      >
        <span className="flex h-5 min-w-0 items-center gap-2.5">
          <PullRequestStateGlyph state={entry.state} isDraft={entry.isDraft} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {entry.title}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1 ps-6.5 text-xs text-sidebar-muted-foreground">
          <span className="min-w-0 shrink-0 truncate">
            {repositoryName}#{entry.number}
          </span>
          {entry.author ? (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 shrink truncate">{entry.author.login}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span className="shrink-0 tabular-nums">
            <RelativeTime timestamp={entry.updatedAt} />
          </span>
        </span>
      </button>
    </li>
  );
}
