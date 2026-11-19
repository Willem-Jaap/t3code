import type {
  EnvironmentId,
  PullRequestDetailView,
  PullRequestRef,
  PullRequestReviewVerdict,
} from "@t3tools/contracts";

import type { EnvironmentPullRequestEntry } from "../pullRequest/pullRequestList.logic";

/** What a sidebar row needs, kept for pull requests that have left the live list. */
export type SidebarPullRequestSnapshot = Pick<
  EnvironmentPullRequestEntry,
  | "environmentId"
  | "projectId"
  | "host"
  | "repository"
  | "number"
  | "title"
  | "author"
  | "state"
  | "isDraft"
  | "updatedAt"
>;

export interface ReviewedPullRequest {
  readonly snapshot: SidebarPullRequestSnapshot;
  readonly verdict: PullRequestReviewVerdict;
  readonly at: number;
}

export interface HiddenPullRequest {
  readonly snapshot: SidebarPullRequestSnapshot;
  readonly at: number;
}

/** One pull request across environments signed in to the same account. */
export function reviewRequestKey(
  entry: Pick<SidebarPullRequestSnapshot, "host" | "repository" | "number">,
): string {
  return `${entry.host.toLowerCase()}:${entry.repository.toLowerCase()}#${entry.number}`;
}

export function reviewSnapshotFromDetail(
  environmentId: EnvironmentId,
  reference: PullRequestRef,
  detail: PullRequestDetailView,
): SidebarPullRequestSnapshot {
  return {
    environmentId,
    projectId: reference.projectId,
    host: reference.host ?? new URL(detail.url).host,
    repository: reference.repository,
    number: reference.number,
    title: detail.title,
    author: detail.author,
    state: detail.state,
    isDraft: detail.isDraft,
    updatedAt: detail.updatedAt,
  };
}

/**
 * Open pull requests waiting on the viewer's review, newest activity first. Two environments
 * signed in to the same account answer with the same pull request; it is listed once.
 */
export function sidebarReviewRequests(
  entries: ReadonlyArray<EnvironmentPullRequestEntry>,
): ReadonlyArray<EnvironmentPullRequestEntry> {
  const seen = new Set<string>();
  const requests: EnvironmentPullRequestEntry[] = [];
  for (const entry of entries) {
    if (entry.state !== "open" || !entry.viewerReviewRequested) continue;
    const key = reviewRequestKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    requests.push(entry);
  }
  return requests.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/**
 * Places each request before the first listed thread with older activity, keeping the threads'
 * own order. Requests older than every thread trail the list.
 */
export function interleaveReviewRequests<Request extends { readonly updatedAt: string }>(
  threads: ReadonlyArray<{ readonly key: string; readonly activityAt: string }>,
  requests: ReadonlyArray<Request>,
): { readonly before: ReadonlyMap<string, ReadonlyArray<Request>>; readonly trailing: Request[] } {
  const before = new Map<string, Request[]>();
  const trailing: Request[] = [];
  // Hosts and threads format timestamps differently, so compare instants rather than strings.
  const threadTimes = threads.map((thread) => ({
    key: thread.key,
    at: Date.parse(thread.activityAt),
  }));
  for (const request of requests) {
    const requestAt = Date.parse(request.updatedAt);
    const thread = threadTimes.find((candidate) => candidate.at < requestAt);
    if (thread === undefined) {
      trailing.push(request);
      continue;
    }
    const placed = before.get(thread.key);
    if (placed) placed.push(request);
    else before.set(thread.key, [request]);
  }
  return { before, trailing };
}

// The host's search lags a submitted review, so answers this soon after it still list the request.
const REVIEW_SETTLE_MS = 5 * 60_000;
const DONE_RETENTION_MS = 14 * 24 * 60 * 60_000;

/**
 * Splits requests into those waiting on you, those you reviewed here (until the host re-requests
 * you), and those you hid while they are still requested.
 */
export function partitionReviewRequests(input: {
  readonly requests: ReadonlyArray<EnvironmentPullRequestEntry>;
  readonly reviewed: Readonly<Record<string, ReviewedPullRequest>>;
  readonly hidden: Readonly<Record<string, HiddenPullRequest>>;
  readonly answeredAt: ReadonlyMap<EnvironmentId, number>;
  readonly now: number;
}) {
  const waiting: EnvironmentPullRequestEntry[] = [];
  const hidden: EnvironmentPullRequestEntry[] = [];
  const stillRequested = new Set<string>();
  for (const entry of input.requests) {
    const key = reviewRequestKey(entry);
    const review = input.reviewed[key];
    const answeredAt = input.answeredAt.get(entry.environmentId) ?? 0;
    if (review !== undefined && answeredAt < review.at + REVIEW_SETTLE_MS) continue;
    stillRequested.add(key);
    if (input.hidden[key] !== undefined) hidden.push(entry);
    else waiting.push(entry);
  }
  const done = Object.entries(input.reviewed)
    .filter(
      ([key, review]) => !stillRequested.has(key) && input.now - review.at < DONE_RETENTION_MS,
    )
    .map(([, review]) => review)
    .toSorted((left, right) => right.at - left.at);
  return { waiting, done, hidden };
}
