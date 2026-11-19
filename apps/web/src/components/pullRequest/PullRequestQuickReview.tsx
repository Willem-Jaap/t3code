import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import type {
  EnvironmentId,
  PullRequestDetailView,
  PullRequestRef,
  PullRequestReviewVerdict,
} from "@t3tools/contracts";
import { CheckIcon, XCircleIcon } from "lucide-react";
import { T, useGT } from "gt-react";
import { useState } from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { changeRequestTermKind } from "./changeRequestTerm";
import { viewerPullRequestReviewOutcome } from "./pullRequestDetail.logic";
import {
  pullRequestReviewKey,
  usePendingReviewComments,
  usePullRequestReviewStore,
} from "./pullRequestReviewStore";
import { usePullRequestReviewSubmit } from "./PullRequestReviewForm";
import { reviewSnapshotFromDetail } from "../sidebar/sidebarReviewRequests.logic";

/**
 * Approve or request changes from the header. Both send the drafted summary and line comments;
 * requesting changes with nothing written opens the review composer instead.
 */
export function PullRequestQuickReview({
  environmentId,
  reference,
  detail,
  onComposeRequestChanges,
  onSubmitted,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  detail: PullRequestDetailView;
  onComposeRequestChanges: () => void;
  onSubmitted: () => void;
}) {
  const gt = useGT();
  const client = sourceControlClients.get(detail.provider);
  const term = changeRequestTermKind(client.changeRequest);
  const reviewKey = pullRequestReviewKey(reference);
  const commentCount = usePendingReviewComments(reference).length;
  // A boolean, so typing a summary does not re-render the header on every keystroke.
  const summaryStarted = usePullRequestReviewStore(
    (store) => (store.summaries[reviewKey] ?? "").trim().length > 0,
  );
  const [pending, setPending] = useState<PullRequestReviewVerdict | null>(null);
  const send = usePullRequestReviewSubmit({
    environmentId,
    reference,
    term,
    snapshot: reviewSnapshotFromDetail(environmentId, reference, detail),
    onPendingChange: () => {},
    onSubmitted,
  });

  const verdicts = detail.capabilities.review.verdicts.filter((verdict) =>
    detail.viewerPermissions.verdicts.includes(verdict),
  );
  const canApprove = verdicts.includes("approve");
  const canRequestChanges = verdicts.includes("request-changes");
  if (detail.state !== "open" || (!canApprove && !canRequestChanges)) return null;
  const given = viewerPullRequestReviewOutcome(detail.comments, detail.commits, detail.viewer);

  const run = async (verdict: PullRequestReviewVerdict) => {
    setPending(verdict);
    await send(verdict, usePullRequestReviewStore.getState().summaries[reviewKey] ?? "");
    setPending(null);
  };
  const requestChangesReady =
    summaryStarted || (!client.reviewSummaryRequired("request-changes") && commentCount > 0);
  const drafted =
    commentCount > 0
      ? gt("{count, plural, one {Sends your # line comment} other {Sends your # line comments}}", {
          count: commentCount,
        })
      : summaryStarted
        ? gt("Sends your review summary")
        : null;

  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={gt("Review")}>
      {canRequestChanges && given === "changes-requested" ? (
        <Badge variant="warning" size="control">
          <XCircleIcon aria-hidden className="size-3" />
          <T>Changes requested</T>
        </Badge>
      ) : canRequestChanges ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="xs"
                variant="outline"
                disabled={pending !== null}
                onClick={() => {
                  if (requestChangesReady) void run("request-changes");
                  else onComposeRequestChanges();
                }}
              />
            }
          >
            {pending === "request-changes" ? (
              <Spinner size="xs" />
            ) : (
              <XCircleIcon aria-hidden className="size-3" />
            )}
            <T>Request changes</T>
          </TooltipTrigger>
          <TooltipPopup>
            {requestChangesReady ? drafted : gt("Write what needs to change")}
          </TooltipPopup>
        </Tooltip>
      ) : null}
      {canApprove && given === "approved" ? (
        <Badge variant="success" size="control">
          <CheckIcon aria-hidden className="size-3" />
          <T context="review verdict, past tense">Approved</T>
        </Badge>
      ) : canApprove ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="xs"
                variant="outline"
                disabled={pending !== null}
                onClick={() => void run("approve")}
              />
            }
          >
            {pending === "approve" ? (
              <Spinner size="xs" />
            ) : (
              <CheckIcon aria-hidden className="size-3" />
            )}
            <T context="review verdict">Approve</T>
          </TooltipTrigger>
          <TooltipPopup>{drafted ?? gt("Approve now")}</TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
}
