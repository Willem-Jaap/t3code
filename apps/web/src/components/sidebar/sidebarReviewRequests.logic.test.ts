import { SourceControlProviderKind } from "@t3tools/contracts";
import type { PullRequestListEntry } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentPullRequestEntry } from "../pullRequest/pullRequestList.logic";
import {
  interleaveReviewRequests,
  partitionReviewRequests,
  reviewRequestKey,
  sidebarReviewRequests,
} from "./sidebarReviewRequests.logic";

function entry(
  overrides: Partial<EnvironmentPullRequestEntry> & Pick<PullRequestListEntry, "number">,
) {
  return {
    environmentId: "env-1",
    provider: SourceControlProviderKind.make("github"),
    host: "github.com",
    projectId: "project-1",
    projectTitle: "t3code",
    repository: "pingdotgg/t3code",
    title: "Review me",
    url: `https://github.com/pingdotgg/t3code/pull/${overrides.number}`,
    author: { login: "octocat", name: null, avatarUrl: null },
    headBranch: `feat/branch-${overrides.number}`,
    baseBranch: "main",
    state: "open",
    isDraft: false,
    mergeability: "mergeable",
    additions: 0,
    deletions: 0,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
    viewerReviewRequested: true,
    labels: [],
    ...overrides,
  } as EnvironmentPullRequestEntry;
}

describe("sidebarReviewRequests", () => {
  it("keeps open requested reviews once each, newest activity first", () => {
    const requests = sidebarReviewRequests([
      entry({ number: 1, updatedAt: "2026-07-01T00:00:00Z" }),
      entry({ number: 2, updatedAt: "2026-07-03T00:00:00Z" }),
      entry({ number: 3, viewerReviewRequested: false }),
      entry({ number: 4, state: "merged" }),
      // The same pull request answered by a second environment on the same account.
      entry({ number: 2, environmentId: "env-2", repository: "PingDotGG/t3code" } as never),
    ]);

    expect(requests.map((request) => [request.number, request.environmentId])).toEqual([
      [2, "env-1"],
      [1, "env-1"],
    ]);
  });
});

describe("interleaveReviewRequests", () => {
  it("places requests before the first older thread and trails the oldest", () => {
    const threads = [
      { key: "pinned-old", activityAt: "2026-07-01T00:00:00Z" },
      { key: "newest", activityAt: "2026-07-05T00:00:00Z" },
      { key: "older", activityAt: "2026-07-03T00:00:00Z" },
    ];
    const requests = [
      { id: "fresh", updatedAt: "2026-07-06T00:00:00Z" },
      { id: "mid", updatedAt: "2026-07-04T00:00:00Z" },
      { id: "stale", updatedAt: "2026-06-01T00:00:00Z" },
    ];

    const { before, trailing } = interleaveReviewRequests(threads, requests);

    // Thread order is the user's own, so a request lands before the first older row in it.
    expect(before.get("pinned-old")?.map((request) => request.id)).toEqual(["fresh", "mid"]);
    expect(trailing.map((request) => request.id)).toEqual(["stale"]);
  });
});

describe("partitionReviewRequests", () => {
  it("moves a reviewed request to Done until a later answer requests it again, and keeps hidden ones aside", () => {
    const reviewedAt = Date.parse("2026-07-10T12:00:00Z");
    const minutes = (count: number) => reviewedAt + count * 60_000;
    const reviewed = entry({ number: 1 });
    const hiddenEntry = entry({ number: 2 });
    const waiting = entry({ number: 3 });
    const input = {
      requests: [reviewed, hiddenEntry, waiting],
      reviewed: {
        [reviewRequestKey(reviewed)]: {
          snapshot: reviewed,
          verdict: "approve" as const,
          at: reviewedAt,
        },
      },
      hidden: { [reviewRequestKey(hiddenEntry)]: { snapshot: hiddenEntry, at: reviewedAt } },
      now: minutes(1),
    };
    const ids = (result: ReturnType<typeof partitionReviewRequests>) => ({
      waiting: result.waiting.map((request) => request.number),
      done: result.done.map((review) => review.snapshot.number),
      hidden: result.hidden.map((request) => request.number),
    });

    // The host's search still lists the request right after the review; it stays in Done.
    expect(
      ids(
        partitionReviewRequests({
          ...input,
          answeredAt: new Map([[reviewed.environmentId, minutes(1)]]),
        }),
      ),
    ).toEqual({ waiting: [3], done: [1], hidden: [2] });
    // Listed again well after the review means you were asked again.
    expect(
      ids(
        partitionReviewRequests({
          ...input,
          answeredAt: new Map([[reviewed.environmentId, minutes(30)]]),
        }),
      ),
    ).toEqual({ waiting: [1, 3], done: [], hidden: [2] });
  });
});
