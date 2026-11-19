#!/usr/bin/env node
// Keeps T3 Pixel (the t3pixel branch of this fork) built and installed. One maintainer machine runs
// `sync` to merge upstream T3 Code and push; teammates run `follow` to pull that branch and build it.
// Commands and settings: t3pixel/README.md. Every run ends with `T3PIXEL_RESULT {json}`.

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const HERE = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const REPO = NodePath.resolve(HERE, "..");
const SCRIPT = "node t3pixel/sync.mjs";
const UPSTREAM_REPOSITORY = /pingdotgg\/t3code(\.git)?$/;
const UPSTREAM_BRANCH = process.env.T3PIXEL_UPSTREAM_BRANCH ?? "main";
const RUST_TOOLCHAIN = process.env.T3PIXEL_RUST_TOOLCHAIN ?? "1.95.0";
const STATE_DIR = NodePath.join(HERE, "state");
const STATE_FILE = NodePath.join(STATE_DIR, "state.json");
const LOG_DIR = NodePath.join(STATE_DIR, "logs");
const PREVIOUS_APP = NodePath.join(STATE_DIR, "previous.app");

const EXIT = { ok: 0, failed: 1, conflicts: 3, checks: 4 };

class Stop extends Error {
  constructor(code, result) {
    super(result.message);
    this.code = code;
    this.result = result;
  }
}

function readState() {
  try {
    return JSON.parse(NodeFS.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(patch) {
  NodeFS.mkdirSync(STATE_DIR, { recursive: true });
  const next = { ...readState(), ...patch };
  for (const [key, value] of Object.entries(next)) if (value === undefined) delete next[key];
  NodeFS.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2) + "\n");
  return next;
}

function stamp() {
  return new Date().toISOString().replaceAll(":", "-").replace(/\..+/, "");
}

/** Runs a command; long steps log to a file and show only the tail when they fail. */
function run(command, args, { log, env, allowFailure = false, cwd = REPO } = {}) {
  const result = NodeChildProcess.spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  let logFile;
  if (log) {
    NodeFS.mkdirSync(LOG_DIR, { recursive: true });
    logFile = NodePath.join(LOG_DIR, `${stamp()}-${log}.log`);
    NodeFS.writeFileSync(logFile, `$ ${command} ${args.join(" ")}\n\n${output}`);
  }
  const ok = result.status === 0;
  if (!ok && !allowFailure) {
    throw new Stop(EXIT.failed, {
      outcome: "failed",
      step: log ?? `${command} ${args[0] ?? ""}`.trim(),
      message: `${command} ${args.join(" ")} exited with ${result.status ?? result.signal}`,
      logFile,
      tail: output.trim().split("\n").slice(-40).join("\n"),
    });
  }
  return { ok, output: output.trim(), logFile };
}

const git = (...args) => run("git", args).output;
const gitOk = (...args) => run("git", args, { allowFailure: true }).ok;

/** The remote pointing at pingdotgg/t3code; only the maintainer's checkout has one. */
function upstreamRemote() {
  if (process.env.T3PIXEL_UPSTREAM_REMOTE) return process.env.T3PIXEL_UPSTREAM_REMOTE;
  for (const line of git("remote", "-v").split("\n")) {
    const [name, url] = line.split(/\s+/);
    if (name && url && UPSTREAM_REPOSITORY.test(url)) return name;
  }
  return null;
}

function requireUpstream() {
  const remote = upstreamRemote();
  if (remote === null) {
    throw new Stop(EXIT.failed, {
      outcome: "failed",
      message: `No remote points at pingdotgg/t3code. Teammate machines run \`${SCRIPT} follow\`; only the maintainer syncs.`,
    });
  }
  return { remote, upstream: `${remote}/${UPSTREAM_BRANCH}` };
}

/** The remote branch this checkout tracks, such as origin/t3pixel. */
function trackingOf(branch) {
  const remote = run("git", ["config", `branch.${branch}.remote`], { allowFailure: true }).output;
  const merge = run("git", ["config", `branch.${branch}.merge`], { allowFailure: true }).output;
  if (!remote || !merge) return null;
  return { remote, remoteBranch: merge, ref: `${remote}/${merge.replace(/^refs\/heads\//, "")}` };
}

function mergeInProgress() {
  return NodeFS.existsSync(NodePath.join(git("rev-parse", "--absolute-git-dir"), "MERGE_HEAD"));
}

function unmergedFiles() {
  return git("diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
}

function filesWithConflictMarkers(files) {
  return files.filter((file) => {
    try {
      return /^(<<<<<<<|>>>>>>>) /m.test(NodeFS.readFileSync(NodePath.join(REPO, file), "utf8"));
    } catch {
      return false;
    }
  });
}

function preflight() {
  if (!NodeFS.existsSync(NodePath.join(REPO, ".git"))) {
    throw new Stop(EXIT.failed, { outcome: "failed", message: `No git checkout at ${REPO}` });
  }
  const branch = git("branch", "--show-current");
  if (!branch) {
    throw new Stop(EXIT.failed, {
      outcome: "failed",
      message: "The checkout is on a detached HEAD",
    });
  }
  return branch;
}

function requireCleanTree() {
  const dirty = git("status", "--porcelain", "--untracked-files=no");
  if (dirty) {
    throw new Stop(EXIT.failed, {
      outcome: "failed",
      message: "The checkout has uncommitted changes; commit or stash them first",
      tail: dirty,
    });
  }
}

function conflictStop(conflicts) {
  const state = readState();
  return new Stop(EXIT.conflicts, {
    outcome: "conflicts",
    message: `Merging upstream conflicts in ${conflicts.length} file(s). Resolve them, then run: ${SCRIPT} continue`,
    conflicts,
    upstream: state.pendingMerge?.upstream,
    backupRef: state.pendingMerge?.backupRef,
  });
}

function sync({ build }) {
  const branch = preflight();
  if (mergeInProgress()) throw conflictStop(unmergedFiles());
  requireCleanTree();
  const upstreamRef = requireUpstream();
  run("git", ["fetch", "--quiet", upstreamRef.remote, UPSTREAM_BRANCH], { log: "fetch" });
  const upstream = git("rev-parse", upstreamRef.upstream);
  if (gitOk("merge-base", "--is-ancestor", upstream, "HEAD")) {
    const head = git("rev-parse", "HEAD");
    if (!build || readState().builtCommit === head) {
      return { outcome: "up-to-date", branch, head, upstream, ...pushToFork(branch) };
    }
    return { outcome: "up-to-date", branch, upstream, ...afterMerge({ build }) };
  }
  const behind = Number(git("rev-list", "--count", `HEAD..${upstream}`));
  const backupRef = `refs/t3pixel/before-${stamp()}`;
  git("update-ref", backupRef, "HEAD");
  writeState({
    pendingMerge: { upstream, backupRef, branch, startedAt: new Date().toISOString() },
  });
  const merge = run(
    "git",
    [
      "merge",
      "--no-edit",
      "--no-verify",
      "-m",
      `chore: sync with upstream ${upstream.slice(0, 9)}`,
      upstream,
    ],
    { log: "merge", allowFailure: true },
  );
  if (!merge.ok) {
    const conflicts = unmergedFiles();
    if (conflicts.length > 0) {
      writeState({ pendingMerge: { ...readState().pendingMerge, conflicts } });
      throw conflictStop(conflicts);
    }
    run("git", ["merge", "--abort"], { allowFailure: true });
    writeState({ pendingMerge: undefined });
    throw new Stop(EXIT.failed, {
      outcome: "failed",
      step: "merge",
      message: "git merge failed without conflicts",
      logFile: merge.logFile,
      tail: merge.output.split("\n").slice(-40).join("\n"),
    });
  }
  writeState({ pendingMerge: undefined });
  return { outcome: "merged", branch, upstream, behind, backupRef, ...afterMerge({ build }) };
}

function continueSync({ build }) {
  preflight();
  const state = readState();
  if (mergeInProgress()) {
    const remaining = unmergedFiles();
    if (remaining.length > 0) throw conflictStop(remaining);
    const marked = filesWithConflictMarkers(state.pendingMerge?.conflicts ?? []);
    if (marked.length > 0) {
      throw new Stop(EXIT.conflicts, {
        outcome: "conflicts",
        message: "These files are staged but still contain conflict markers",
        conflicts: marked,
      });
    }
    run("git", ["commit", "--no-edit", "--no-verify"], { log: "merge-commit" });
    writeState({ pendingMerge: undefined });
  }
  requireCleanTree();
  return { outcome: "merged", upstream: state.pendingMerge?.upstream, ...afterMerge({ build }) };
}

function abort() {
  preflight();
  if (mergeInProgress()) run("git", ["merge", "--abort"]);
  const { pendingMerge } = readState();
  writeState({ pendingMerge: undefined });
  return { outcome: "aborted", backupRef: pendingMerge?.backupRef };
}

/** Dependencies, the repo's own checks for changed files, then the build. */
function afterMerge({ build }) {
  run("vp", ["i"], { log: "install-deps" });
  const checks = run("vp", ["run", "check:changed"], { log: "checks", allowFailure: true });
  if (!checks.ok) {
    throw new Stop(EXIT.checks, {
      outcome: "checks-failed",
      message: `Checks failed after the merge. Fix them, commit, then run: ${SCRIPT} continue`,
      logFile: checks.logFile,
      tail: checks.output.split("\n").slice(-60).join("\n"),
    });
  }
  const head = git("rev-parse", "HEAD");
  const push = pushToFork(git("branch", "--show-current"));
  if (!build) return { head, built: false, ...push };
  const appPath = buildApp();
  writeState({ builtCommit: head, builtApp: appPath, builtAt: new Date().toISOString() });
  const installed = readState().autoInstall ? installApp(appPath, head) : false;
  return {
    head,
    built: true,
    appPath,
    installed: Boolean(installed),
    installedApp: installed || undefined,
    ...push,
  };
}

/**
 * Publishes checked work to the branch's tracking remote (the fork's t3pixel). Never forces: if the
 * fork moved on its own, the push is reported as rejected and left for the maintainer.
 */
function pushToFork(branch) {
  if (process.env.T3PIXEL_PUSH === "0") return { pushed: false, pushSkipped: "T3PIXEL_PUSH=0" };
  const tracking = trackingOf(branch);
  if (tracking === null) return { pushed: false, pushSkipped: "the branch tracks no remote" };
  run("git", ["fetch", "--quiet", tracking.remote], { allowFailure: true });
  const known = gitOk("rev-parse", "--verify", "--quiet", `refs/remotes/${tracking.ref}`);
  const ahead = known
    ? Number(git("rev-list", "--count", `refs/remotes/${tracking.ref}..HEAD`))
    : 1;
  if (ahead === 0) return { pushed: false, pushTo: tracking.ref };
  const push = run("git", ["push", "--quiet", tracking.remote, `HEAD:${tracking.remoteBranch}`], {
    log: "push",
    allowFailure: true,
  });
  return push.ok
    ? { pushed: true, pushTo: tracking.ref, pushedCommits: known ? ahead : undefined }
    : {
        pushed: false,
        pushTo: tracking.ref,
        pushError: push.output.split("\n").slice(-5).join("\n"),
        pushLog: push.logFile,
      };
}

/** Teammate machines: fast-forward to the fork's branch, then build and install it. */
function follow({ build }) {
  const branch = preflight();
  if (mergeInProgress()) {
    throw new Stop(EXIT.failed, {
      outcome: "failed",
      message: "A merge is in progress in this checkout",
    });
  }
  requireCleanTree();
  const tracking = trackingOf(branch);
  if (tracking === null) {
    throw new Stop(EXIT.failed, {
      outcome: "failed",
      message: `${branch} tracks no remote branch; check out t3pixel from the fork`,
    });
  }
  run("git", ["fetch", "--quiet", tracking.remote], { log: "fetch" });
  const before = git("rev-parse", "HEAD");
  const forward = run("git", ["merge", "--ff-only", `refs/remotes/${tracking.ref}`], {
    log: "follow",
    allowFailure: true,
  });
  if (!forward.ok) {
    throw new Stop(EXIT.failed, {
      outcome: "failed",
      step: "follow",
      message: `This checkout has commits that are not on ${tracking.ref}. Following machines only build the shared branch; move your own work to another branch, then reset this one to ${tracking.ref}.`,
    });
  }
  const head = git("rev-parse", "HEAD");
  const state = readState();
  const current = state.installedCommit === head && NodeFS.existsSync(state.installedApp ?? "");
  if (!build || current) {
    return {
      outcome: head === before ? "up-to-date" : "updated",
      branch,
      head,
      installed: current,
    };
  }
  run("vp", ["i"], { log: "install-deps" });
  const appPath = buildApp();
  writeState({ builtCommit: head, builtApp: appPath, builtAt: new Date().toISOString() });
  const installedApp = installApp(appPath, head);
  return {
    outcome: head === before ? "installed" : "updated",
    branch,
    head,
    installed: true,
    installedApp,
  };
}

function buildApp() {
  const releaseDir = NodePath.join(REPO, "release");
  NodeFS.rmSync(releaseDir, { recursive: true, force: true });
  // No publish feed in the build, so the installed app never updates itself back to upstream.
  const env = {
    RUSTUP_TOOLCHAIN: RUST_TOOLCHAIN,
    GITHUB_REPOSITORY: "",
    T3CODE_DESKTOP_UPDATE_REPOSITORY: "",
  };
  run("vp", ["run", "dist:desktop:artifact", "--platform", "mac", "--target", "dir"], {
    log: "build-app",
    env,
  });
  const app = findApp(releaseDir);
  if (!app) {
    throw new Stop(EXIT.failed, {
      outcome: "failed",
      step: "build-app",
      message: `No .app found under ${releaseDir}`,
    });
  }
  return app;
}

function findApp(dir) {
  if (!NodeFS.existsSync(dir)) return null;
  for (const entry of NodeFS.readdirSync(dir, { withFileTypes: true })) {
    const full = NodePath.join(dir, entry.name);
    if (entry.isDirectory() && entry.name.endsWith(".app")) return full;
    if (entry.isDirectory()) {
      const nested = findApp(full);
      if (nested) return nested;
    }
  }
  return null;
}

/** The build names itself (T3 Pixel.app); it installs under that name. */
function appDestination(appPath) {
  return process.env.T3PIXEL_APP ?? NodePath.join("/Applications", NodePath.basename(appPath));
}

/** Swaps the bundle in with renames, so a running copy keeps its open files until it restarts. */
function installApp(appPath, commit) {
  if (!appPath || !NodeFS.existsSync(appPath)) {
    throw new Stop(EXIT.failed, {
      outcome: "failed",
      message: "Nothing built yet; run sync or build first",
    });
  }
  const destination = appDestination(appPath);
  const staged = `${destination}.t3pixel-new`;
  NodeFS.rmSync(staged, { recursive: true, force: true });
  run("ditto", [appPath, staged], { cwd: HERE });
  // Unsigned builds seal only the main binary; macOS wants the whole bundle sealed consistently.
  run("codesign", ["--force", "--deep", "--sign", "-", staged], { cwd: HERE, log: "codesign" });
  run("codesign", ["--verify", "--deep", "--strict", staged], {
    cwd: HERE,
    log: "codesign-verify",
  });
  NodeFS.rmSync(PREVIOUS_APP, { recursive: true, force: true });
  if (NodeFS.existsSync(destination)) NodeFS.renameSync(destination, PREVIOUS_APP);
  NodeFS.renameSync(staged, destination);
  writeState({
    autoInstall: true,
    installedApp: destination,
    installedCommit: commit,
    installedAt: new Date().toISOString(),
  });
  return destination;
}

function rollback() {
  const { installedApp } = readState();
  if (!installedApp || !NodeFS.existsSync(PREVIOUS_APP)) {
    throw new Stop(EXIT.failed, {
      outcome: "failed",
      message: "No previous T3 Pixel build to roll back to",
    });
  }
  const swap = NodePath.join(STATE_DIR, "rolled-back.app");
  NodeFS.rmSync(swap, { recursive: true, force: true });
  if (NodeFS.existsSync(installedApp)) NodeFS.renameSync(installedApp, swap);
  NodeFS.renameSync(PREVIOUS_APP, installedApp);
  if (NodeFS.existsSync(swap)) NodeFS.renameSync(swap, PREVIOUS_APP);
  return { outcome: "rolled-back", app: installedApp };
}

function status() {
  const branch = preflight();
  const head = git("rev-parse", "HEAD");
  const upstream = upstreamRemote();
  const tracking = trackingOf(branch);
  if (upstream !== null)
    run("git", ["fetch", "--quiet", upstream, UPSTREAM_BRANCH], { allowFailure: true });
  if (tracking !== null) run("git", ["fetch", "--quiet", tracking.remote], { allowFailure: true });
  const count = (range) =>
    Number(run("git", ["rev-list", "--count", range], { allowFailure: true }).output || 0);
  return {
    outcome: "status",
    role: upstream === null ? "follower" : "maintainer",
    repo: REPO,
    branch,
    head,
    ...(upstream === null ? {} : { behindUpstream: count(`HEAD..${upstream}/${UPSTREAM_BRANCH}`) }),
    ...(tracking === null
      ? {}
      : { tracking: tracking.ref, behindFork: count(`HEAD..${tracking.ref}`) }),
    mergeInProgress: mergeInProgress(),
    ...readState(),
  };
}

const [command = "status", ...flags] = process.argv.slice(2);
const build = !flags.includes("--no-build");
const commands = {
  status: () => status(),
  sync: () => sync({ build }),
  continue: () => continueSync({ build }),
  follow: () => follow({ build }),
  abort: () => abort(),
  build: () => {
    preflight();
    requireCleanTree();
    const head = git("rev-parse", "HEAD");
    const appPath = buildApp();
    writeState({ builtCommit: head, builtApp: appPath, builtAt: new Date().toISOString() });
    return { outcome: "built", head, appPath };
  },
  install: () => {
    const { builtApp, builtCommit } = readState();
    const app = installApp(builtApp, builtCommit);
    return {
      outcome: "installed",
      app,
      commit: builtCommit,
      restart: "Quit T3 Code and open T3 Pixel",
    };
  },
  rollback: () => rollback(),
};

let code = EXIT.ok;
let result;
try {
  if (!commands[command])
    throw new Stop(EXIT.failed, { outcome: "failed", message: `Unknown command: ${command}` });
  result = commands[command]();
} catch (error) {
  if (!(error instanceof Stop)) throw error;
  code = error.code;
  result = error.result;
}
if (result.tail) console.error(result.tail);
console.log(`T3PIXEL_RESULT ${JSON.stringify({ ...result, tail: undefined })}`);
process.exit(code);
