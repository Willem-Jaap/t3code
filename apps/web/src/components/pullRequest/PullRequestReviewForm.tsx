import { useAtomCommand } from "~/state/use-atom-command";
import type { EnvironmentId, PullRequestRef, PullRequestReviewVerdict } from "@t3tools/contracts";
import { CheckIcon, MessageSquareIcon, XCircleIcon } from "lucide-react";
import { msg, useGT, useMessages } from "gt-react";
import { useEffect, useState, type ReactNode, type RefObject } from "react";

import { m } from "~/i18n/messages";

import { TextFieldSpeechControls, useTextFieldSpeech } from "~/speech/useTextFieldSpeech";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { isCommentSubmitShortcut } from "../diffs/commentSubmitShortcut";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger } from "../ui/select";
import { toastManager } from "../ui/toast";
import { readableFailure } from "./pullRequestDetail.logic";
import {
  pullRequestReviewKey,
  usePendingReviewComments,
  usePullRequestReviewStore,
} from "./pullRequestReviewStore";
import {
  PullRequestMarkdownTextarea,
  type PullRequestCompletionScope,
} from "./PullRequestMarkdownTextarea";

import type { ChangeRequestTermKind } from "./changeRequestTerm";

type ReviewVerdictOption = {
  readonly value: PullRequestReviewVerdict;
  readonly label: string;
  readonly sent: (term: ChangeRequestTermKind) => string;
  readonly icon: ReactNode;
};

const VERDICTS: ReadonlyArray<ReviewVerdictOption> = [
  {
    value: "comment",
    label: msg("Comment", { $context: "review verdict" }),
    sent: () => m(msg("Review submitted")),
    icon: <MessageSquareIcon className="size-3" />,
  },
  {
    value: "approve",
    label: msg("Approve", { $context: "review verdict" }),
    sent: (term) =>
      m(
        msg(
          "{term, select, mr {Merge request} cr {Change request} other {Pull request}} approved",
          { term },
        ),
      ),
    icon: <CheckIcon className="size-3" />,
  },
  {
    value: "request-changes",
    label: msg("Request changes"),
    sent: () => m(msg("Changes requested")),
    icon: <XCircleIcon className="size-3" />,
  },
];

/**
 * Sends a review with the draft line comments, then clears what was sent. Comments and summary
 * edits made while it is in flight are kept.
 */
export function usePullRequestReviewSubmit({
  environmentId,
  reference,
  term,
  onPendingChange,
  onSubmitted,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  term: ChangeRequestTermKind;
  onPendingChange: (pending: boolean) => void;
  onSubmitted: () => void;
}) {
  const reviewKey = pullRequestReviewKey(reference);
  const removeComments = usePullRequestReviewStore((store) => store.removeComments);
  const clearSummary = usePullRequestReviewStore((store) => store.clearSummary);
  const submitReview = useAtomCommand(pullRequestEnvironment.submitReview, {
    reportFailure: false,
  });
  return async (verdictValue: PullRequestReviewVerdict, text: string) => {
    const verdict = VERDICTS.find((option) => option.value === verdictValue);
    if (verdict === undefined) return;
    const submittedComments = usePullRequestReviewStore.getState().drafts[reviewKey] ?? [];
    onPendingChange(true);
    const result = await submitReview({
      environmentId,
      input: { ...reference, verdict: verdict.value, body: text, comments: submittedComments },
    });
    onPendingChange(false);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: m(msg("The review could not be submitted")),
        description: readableFailure(
          squashAtomCommandFailure(result),
          m(msg("The host refused the review. Your draft is still here to try again.")),
        ),
      });
      return;
    }
    // Preserve comments and summary edits made during submission.
    removeComments(
      reviewKey,
      submittedComments.map((comment) => comment.id),
    );
    clearSummary(reviewKey, text);
    toastManager.add({ type: "success", title: verdict.sent(term) });
    onSubmitted();
  };
}

export function PullRequestReviewForm({
  environmentId,
  active,
  reference,
  completionScope,
  term,
  verdicts,
  requestChangesSummaryRequired,
  textareaRef,
  pending,
  onPendingChange,
  onSubmitted,
  verdictRequest,
}: {
  environmentId: EnvironmentId;
  /** False while the form stays mounted but hidden; dictation is cancelled then. */
  active: boolean;
  reference: PullRequestRef;
  completionScope: PullRequestCompletionScope | null;
  term: ChangeRequestTermKind;
  verdicts: ReadonlyArray<PullRequestReviewVerdict>;
  requestChangesSummaryRequired: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onSubmitted: () => void;
  /** Selects a verdict each time `token` changes, such as from a header button. */
  verdictRequest?:
    | { readonly token: number; readonly verdict: PullRequestReviewVerdict }
    | undefined;
}) {
  const gt = useGT();
  const resolve = useMessages();
  const [requestedVerdict, setRequestedVerdict] = useState<PullRequestReviewVerdict>(
    verdictRequest?.verdict ?? "comment",
  );
  const [answeredVerdictToken, setAnsweredVerdictToken] = useState(verdictRequest?.token);
  if (verdictRequest !== undefined && verdictRequest.token !== answeredVerdictToken) {
    setAnsweredVerdictToken(verdictRequest.token);
    setRequestedVerdict(verdictRequest.verdict);
  }
  const comments = usePendingReviewComments(reference);
  const reviewKey = pullRequestReviewKey(reference);
  const body = usePullRequestReviewStore((store) => store.summaries[reviewKey] ?? "");
  const setSummary = usePullRequestReviewStore((store) => store.setSummary);
  const speech = useTextFieldSpeech({
    environmentId,
    projectId: reference.projectId,
    ownerKey: JSON.stringify(["pr-review", environmentId, reviewKey]),
    text: body,
    textareaRef,
    onTextChange: (text) => setSummary(reviewKey, text),
    disabled: !active || pending,
  });
  const { cancel } = speech;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- discards a recording when the hidden form can no longer be submitted
  useEffect(() => {
    if (!active) cancel();
  }, [active, cancel]);
  const sendReview = usePullRequestReviewSubmit({
    environmentId,
    reference,
    term,
    onPendingChange,
    onSubmitted,
  });

  const offered = VERDICTS.filter((verdict) => verdicts.includes(verdict.value));
  const selectedVerdict =
    offered.find((verdict) => verdict.value === requestedVerdict) ?? offered[0];

  const submit = async (verdict: ReviewVerdictOption, text: string) => {
    const commentCount = usePullRequestReviewStore.getState().drafts[reviewKey]?.length ?? 0;
    if (pending || !canSubmit(verdict.value, text, commentCount)) return;
    await sendReview(verdict.value, text);
  };

  // Forgejo requires a summary when requesting changes, even with inline comments.
  const canSubmit = (verdict: PullRequestReviewVerdict, summary: string, commentCount: number) =>
    verdict === "request-changes" && requestChangesSummaryRequired
      ? summary.trim().length > 0
      : verdict === "approve" || summary.trim().length > 0 || commentCount > 0;
  const placeholder =
    selectedVerdict === undefined || canSubmit(selectedVerdict.value, "", comments.length)
      ? gt("Summarize your review (optional)")
      : selectedVerdict.value === "request-changes" && requestChangesSummaryRequired
        ? gt("Summarize your review (required to request changes)")
        : gt("Summarize your review or add line comments");

  return (
    <>
      <PullRequestMarkdownTextarea
        ref={textareaRef}
        completionScope={completionScope}
        rows={3}
        readOnly={speech.freezesEditor}
        value={body}
        placeholder={placeholder}
        aria-label={gt("Review summary")}
        onValueChange={(next) => setSummary(reviewKey, next)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) return;
          if (
            selectedVerdict !== undefined &&
            isCommentSubmitShortcut(event, body, pending || speech.preparing, true)
          ) {
            event.preventDefault();
            event.stopPropagation();
            speech.submitAfterDictation((text) => void submit(selectedVerdict, text));
          }
        }}
      />
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <TextFieldSpeechControls speech={speech} disabled={pending} />
        {offered.length > 1 ? (
          <Select
            value={selectedVerdict?.value ?? null}
            disabled={pending}
            onValueChange={(value) => {
              if (value !== null) setRequestedVerdict(value);
            }}
          >
            <SelectTrigger size="xs" className="w-auto min-w-0" aria-label={gt("Review verdict")}>
              <span className="flex items-center gap-1.5">
                {selectedVerdict?.icon}
                {selectedVerdict ? resolve(selectedVerdict.label) : null}
              </span>
            </SelectTrigger>
            <SelectPopup side="top" alignItemWithTrigger={false}>
              {offered.map((verdict) => (
                <SelectItem key={verdict.value} value={verdict.value}>
                  <span className="flex items-center gap-1.5">
                    {verdict.icon}
                    {resolve(verdict.label)}
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        ) : null}
        <Button
          size="xs"
          disabled={
            speech.preparing ||
            pending ||
            selectedVerdict === undefined ||
            (!canSubmit(selectedVerdict.value, body, comments.length) && !speech.blocksSubmission)
          }
          onClick={() => {
            if (selectedVerdict !== undefined)
              speech.submitAfterDictation((text) => void submit(selectedVerdict, text));
          }}
        >
          {pending ? gt("Submitting...") : gt("Submit review")}
        </Button>
      </div>
    </>
  );
}
