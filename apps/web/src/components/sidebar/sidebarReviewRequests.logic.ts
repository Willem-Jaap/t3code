import type { EnvironmentPullRequestEntry } from "../pullRequest/pullRequestList.logic";

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
    const key = `${entry.host.toLowerCase()}:${entry.repository.toLowerCase()}#${entry.number}`;
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
