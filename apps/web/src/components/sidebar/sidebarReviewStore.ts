import type { PullRequestReviewVerdict } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";
import {
  reviewRequestKey,
  type HiddenPullRequest,
  type ReviewedPullRequest,
  type SidebarPullRequestSnapshot,
} from "./sidebarReviewRequests.logic";

const MAX_REMEMBERED = 100;

interface SidebarReviewStoreState {
  readonly reviewed: Readonly<Record<string, ReviewedPullRequest>>;
  readonly hidden: Readonly<Record<string, HiddenPullRequest>>;
  readonly markReviewed: (
    snapshot: SidebarPullRequestSnapshot,
    verdict: PullRequestReviewVerdict,
  ) => void;
  readonly hide: (snapshot: SidebarPullRequestSnapshot) => void;
  readonly unhide: (key: string) => void;
}

function newestFirst<Value extends { readonly at: number }>(
  records: Readonly<Record<string, Value>>,
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(records)
      .toSorted(([, left], [, right]) => right.at - left.at)
      .slice(0, MAX_REMEMBERED),
  );
}

/** Pull requests you reviewed or hid in the sidebar, remembered on this device. */
export const useSidebarReviewStore = create<SidebarReviewStoreState>()(
  persist(
    (set) => ({
      reviewed: {},
      hidden: {},
      markReviewed: (snapshot, verdict) =>
        set((state) => ({
          reviewed: newestFirst({
            ...state.reviewed,
            [reviewRequestKey(snapshot)]: { snapshot, verdict, at: Date.now() },
          }),
        })),
      hide: (snapshot) =>
        set((state) => ({
          hidden: newestFirst({
            ...state.hidden,
            [reviewRequestKey(snapshot)]: { snapshot, at: Date.now() },
          }),
        })),
      unhide: (key) =>
        set((state) => {
          const { [key]: _removed, ...hidden } = state.hidden;
          return { hidden };
        }),
    }),
    {
      name: "t3code:sidebar-review-requests:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ reviewed: state.reviewed, hidden: state.hidden }),
    },
  ),
);
