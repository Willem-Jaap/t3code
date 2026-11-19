import type { PullRequestReviewVerdict } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { ArrowUpRightIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import type { SidebarKindFilter } from "~/uiStateStore";
import { RelativeTime } from "../RelativeTime";
import { guideRunKey, useGuideRunStore } from "../pullRequest/guide/guideRunStore";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { PullRequestStateGlyph } from "../pullRequest/pullRequestPresentation";
import { Button } from "../ui/button";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
import { useSidebar } from "../ui/sidebar";
import {
  reviewRequestKey,
  type ReviewedPullRequest,
  type SidebarPullRequestSnapshot,
} from "./sidebarReviewRequests.logic";
import { useSidebarReviewStore } from "./sidebarReviewStore";

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
  waiting,
  done,
  hidden,
  isPending,
  error,
  standalone,
}: {
  waiting: ReadonlyArray<SidebarPullRequestSnapshot>;
  done: ReadonlyArray<ReviewedPullRequest>;
  hidden: ReadonlyArray<SidebarPullRequestSnapshot>;
  isPending: boolean;
  error: { readonly message: string } | null;
  /** The Reviews tag: the whole sidebar, with Done, Hidden, and a way to every pull request. */
  standalone: boolean;
}) {
  const gt = useGT();
  const [expanded, setExpanded] = useState(true);
  if (!standalone) {
    if (waiting.length === 0) return null;
    return (
      <section aria-label={gt("Review requests")} className="flex flex-col gap-px pb-2">
        <CollapsibleSectionHeader
          expanded={expanded}
          tone="emphasized"
          onClick={() => setExpanded((value) => !value)}
          accessory={<SectionCount count={waiting.length} />}
        >
          <T>Review requests</T>
        </CollapsibleSectionHeader>
        {expanded ? <ReviewRows entries={waiting} status="waiting" /> : null}
      </section>
    );
  }
  const status =
    waiting.length > 0
      ? null
      : isPending
        ? gt("Loading review requests…")
        : error !== null
          ? gt("Couldn't load review requests")
          : gt("No pull requests are waiting on your review");
  return (
    <section aria-label={gt("Reviews")} className="flex flex-col gap-px pb-2">
      {status === null ? (
        <ReviewRows entries={waiting} status="waiting" />
      ) : (
        <p role="status" className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground">
          {status}
        </p>
      )}
      {done.length > 0 ? (
        <CollapsibleShelf label={gt("Done")} count={done.length} defaultExpanded>
          <ul className="flex flex-col gap-px">
            {done.map((review) => (
              <SidebarReviewRequestRow
                key={reviewRequestKey(review.snapshot)}
                entry={review.snapshot}
                status={{ kind: "done", verdict: review.verdict, at: review.at }}
              />
            ))}
          </ul>
        </CollapsibleShelf>
      ) : null}
      {hidden.length > 0 ? (
        <CollapsibleShelf label={gt("Hidden")} count={hidden.length} defaultExpanded={false}>
          <ReviewRows entries={hidden} status="hidden" />
        </CollapsibleShelf>
      ) : null}
      <AllPullRequestsLink />
    </section>
  );
}

function ReviewRows({
  entries,
  status,
}: {
  entries: ReadonlyArray<SidebarPullRequestSnapshot>;
  status: "waiting" | "hidden";
}) {
  return (
    <ul className="flex flex-col gap-px">
      {entries.map((entry) => (
        <SidebarReviewRequestRow
          key={reviewRequestKey(entry)}
          entry={entry}
          status={{ kind: status }}
        />
      ))}
    </ul>
  );
}

function SectionCount({ count }: { count: number }) {
  return (
    <span className="shrink-0 text-2xs tabular-nums text-sidebar-muted-foreground">{count}</span>
  );
}

function CollapsibleShelf({
  label,
  count,
  defaultExpanded,
  children,
}: {
  label: string;
  count: number;
  defaultExpanded: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="mt-2 flex flex-col gap-px">
      <CollapsibleSectionHeader
        expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        accessory={<SectionCount count={count} />}
      >
        {label}
      </CollapsibleSectionHeader>
      {expanded ? children : null}
    </div>
  );
}

function AllPullRequestsLink() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <button
      type="button"
      onClick={() => {
        if (isMobile) setOpenMobile(false);
        void navigate({ to: "/pull-requests", search: readPullRequestListPreferences() });
      }}
      className="mt-2 inline-flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-sidebar-muted-foreground outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <T>All pull requests</T>
      <ArrowUpRightIcon aria-hidden className="size-3" />
    </button>
  );
}

type ReviewRowStatus =
  | { readonly kind: "waiting" }
  | { readonly kind: "hidden" }
  | { readonly kind: "done"; readonly verdict: PullRequestReviewVerdict; readonly at: number };

function VerdictLabel({ verdict }: { verdict: PullRequestReviewVerdict }) {
  return verdict === "approve" ? (
    <span className="text-success-foreground">
      <T context="review verdict, past tense">Approved</T>
    </span>
  ) : verdict === "request-changes" ? (
    <span className="text-warning-foreground">
      <T>Changes requested</T>
    </span>
  ) : (
    <T context="review verdict, past tense">Reviewed</T>
  );
}

export function SidebarReviewRequestRow({
  entry,
  variant = "compact",
  status = { kind: "waiting" },
}: {
  entry: SidebarPullRequestSnapshot;
  variant?: "card" | "compact";
  status?: ReviewRowStatus;
}) {
  const gt = useGT();
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const hide = useSidebarReviewStore((store) => store.hide);
  const unhide = useSidebarReviewStore((store) => store.unhide);
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
    // Reviewing starts from the changed files, with the pull request filling the page.
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
        maximized: true,
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
  const action =
    status.kind === "done" ? null : (
      <span
        className={cn(
          "absolute right-2 opacity-0 transition-opacity group-hover/review-row:opacity-100 group-focus-within/review-row:opacity-100",
          variant === "card" ? "top-2" : "top-1/2 -translate-y-1/2",
        )}
      >
        <Button
          size="icon-xs"
          variant="ghost-muted"
          aria-label={
            status.kind === "hidden"
              ? gt("Show #{number} again", { number: entry.number })
              : gt("Hide #{number}", { number: entry.number })
          }
          title={status.kind === "hidden" ? gt("Show again") : gt("Hide")}
          onClick={() => (status.kind === "hidden" ? unhide(reviewRequestKey(entry)) : hide(entry))}
        >
          {status.kind === "hidden" ? (
            <EyeIcon className="size-3.5" />
          ) : (
            <EyeOffIcon className="size-3.5" />
          )}
        </Button>
      </span>
    );
  const time =
    status.kind === "done" ? (
      <RelativeTime timestamp={new Date(status.at).toISOString()} />
    ) : (
      <RelativeTime timestamp={entry.updatedAt} />
    );
  if (variant === "card") {
    // Mirrors the thread card, so a pull request reads as one more item among the threads.
    return (
      <li className="group/review-row relative list-none py-0.5">
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
            <span className="shrink-0 tabular-nums group-hover/review-row:invisible">{time}</span>
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
            <span className="ms-auto shrink-0">
              {status.kind === "done" ? (
                <VerdictLabel verdict={status.verdict} />
              ) : (
                <span className="text-primary">
                  <T>Review</T>
                </span>
              )}
            </span>
          </span>
        </button>
        {action}
      </li>
    );
  }
  return (
    <li className="group/review-row relative list-none">
      <button
        type="button"
        data-testid="sidebar-review-request"
        aria-current={isActive ? "page" : undefined}
        aria-label={label}
        onClick={open}
        className={cn(surface, "flex flex-col justify-center gap-0.5 py-1.5 ps-2.5 pe-9")}
      >
        <span className="flex h-5 min-w-0 items-center gap-2.5">
          <PullRequestStateGlyph state={entry.state} isDraft={entry.isDraft} />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium",
              status.kind === "waiting" ? "text-foreground" : "text-foreground/75",
            )}
          >
            {entry.title}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1 ps-6.5 text-xs text-sidebar-muted-foreground">
          <span className="min-w-0 truncate">
            {repositoryName}#{entry.number}
          </span>
          <span aria-hidden>·</span>
          {status.kind === "done" ? (
            <span className="min-w-0 shrink truncate">
              <VerdictLabel verdict={status.verdict} />
            </span>
          ) : entry.author ? (
            <span className="min-w-0 shrink truncate">{entry.author.login}</span>
          ) : null}
          <span aria-hidden>·</span>
          <span className="shrink-0 tabular-nums">{time}</span>
        </span>
      </button>
      {action}
    </li>
  );
}
