import type { PullRequestListInput } from "@t3tools/contracts";
import { useEffect, useEffectEvent } from "react";

import { useEnvironments, usePullRequestsSupported } from "~/state/environments";
import { usePullRequestList } from "~/state/pullRequests";
import { sidebarReviewRequests } from "./sidebarReviewRequests.logic";

// Review requests arrive from teammates, not from this app, so no server signal refreshes them.
const REFRESH_INTERVAL_MS = 3 * 60_000;
// Switching windows often must not spend the host's search rate limit.
const FOCUS_REFRESH_MIN_MS = 60_000;
const LIST_INPUT = {
  state: "open",
  involvement: "reviewing",
  limit: 50,
} as const satisfies PullRequestListInput;

/** Open pull requests waiting on your review, across every connected environment. */
export function useSidebarReviewRequests() {
  const supported = usePullRequestsSupported();
  const { environments } = useEnvironments();
  const targets = supported
    ? environments
        .filter((environment) => environment.serverConfig !== null)
        .map((environment) => ({ environmentId: environment.environmentId, input: LIST_INPUT }))
        .toSorted((left, right) => left.environmentId.localeCompare(right.environmentId))
    : [];
  const list = usePullRequestList(targets);
  const refresh = useEffectEvent(() => list.refresh());
  const active = targets.length > 0;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- polls the host on a timer and when the window regains focus
  useEffect(() => {
    if (!active) return;
    let refreshedAt = Date.now();
    const refreshIfVisible = (minimumAgeMs: number) => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - refreshedAt < minimumAgeMs) return;
      refreshedAt = Date.now();
      refresh();
    };
    const timer = window.setInterval(() => refreshIfVisible(0), REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => refreshIfVisible(FOCUS_REFRESH_MIN_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active]);

  return {
    supported: active,
    requests: list.data === null ? [] : sidebarReviewRequests(list.data.entries),
    isPending: list.isPending && list.data === null,
    error: list.data === null ? list.error : null,
  };
}
