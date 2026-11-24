import { describe, expect, it } from "vite-plus/test";

import { buildThreadActionMenuItems, type ThreadActionMenuState } from "./threadActionMenu.logic";

const baseState: ThreadActionMenuState = {
  canOperate: true,
  branch: null,
  projectFilter: null,
  isPinned: false,
  isSettled: false,
  autoSettleEnabled: true,
  isSnoozed: false,
  canSnoozeNow: true,
  isRegeneratingTitle: false,
  isRunning: false,
  hasCompletedRun: true,
  supports: {
    settlement: true,
    autoSettleOptOut: true,
    snooze: true,
    pinning: true,
    titleRegeneration: true,
  },
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

describe("buildThreadActionMenuItems", () => {
  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems({
        ...baseState,
        canOperate: false,
        isPinned: reversed,
        isSettled: reversed,
        isSnoozed: reversed,
      });
      const expected = reversed
        ? [
            "unpin",
            "unsettle",
            "unsnooze",
            "backlog",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ]
        : [
            "pin",
            "settle",
            "snooze",
            "backlog",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ];
      expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(expected);
      expect(
        items.find((item) => item.id === "snooze")?.children?.every((child) => child.disabled) ??
          true,
      ).toBe(true);
    },
  );

  it("offers Backlog right below Snooze, and only a way out once backlogged", () => {
    const ids = (state: ThreadActionMenuState) =>
      buildThreadActionMenuItems(state).map((item) => item.id);
    expect(ids(baseState).slice(2, 4)).toEqual(["snooze", "backlog"]);
    expect(ids({ ...baseState, isSnoozed: true }).slice(2, 4)).toEqual(["unsnooze", "backlog"]);
    const backlogged = ids({ ...baseState, isSnoozed: true, isBacklogged: true });
    expect(backlogged[2]).toBe("unbacklog");
    expect(backlogged).not.toContain("backlog");
    expect(backlogged).not.toContain("unsnooze");
    expect(
      buildThreadActionMenuItems({ ...baseState, canSnoozeNow: false }).find(
        (item) => item.id === "backlog",
      )?.disabled,
    ).toBe(true);
  });

  it("disables archive and turning into a project while the thread is running", () => {
    const items = buildThreadActionMenuItems({
      ...baseState,
      isRunning: true,
      canTurnIntoProject: true,
    });
    expect(items.find((item) => item.id === "archive")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "turn-into-project")?.disabled).toBe(true);
  });

  it.each([
    ["while the thread is running", { isRunning: true }],
    ["before any run has completed", { hasCompletedRun: false }],
  ])("omits mark unread %s", (_, overrides) => {
    const items = buildThreadActionMenuItems({ ...baseState, ...overrides });
    expect(items.map((item) => item.id)).not.toContain("mark-unread");
  });

  it("disables only rename where no inline title editor exists", () => {
    const items = buildThreadActionMenuItems({ ...baseState, canRename: false });
    expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(["rename"]);
  });
});
