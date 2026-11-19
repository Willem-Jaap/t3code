# T3 Pixel

Pixel Perfect's build of [T3 Code](https://github.com/pingdotgg/t3code). It adds:

- Pull requests waiting on your review in the thread sidebar (All · Threads · Reviews), with Done
  and Hidden shelves in the Reviews tab.
- Approve and Request changes buttons on pull requests, showing your verdict once given.
- Desktop builds named T3 Pixel.

It lives on the `t3pixel` branch of this fork. Changes land through pull requests into `t3pixel`.

## Set it up on your Mac

Paste [SETUP_PROMPT.md](./SETUP_PROMPT.md) into a T3 Code thread running in Full access. The agent
installs the prerequisites, builds T3 Pixel into `/Applications`, and schedules a daily update.

## How updates flow

One maintainer machine merges upstream T3 Code into `t3pixel` every morning, resolves conflicts,
runs the repo's checks, and pushes. Every other machine only follows `t3pixel`: it fast-forwards,
builds, and installs. Following machines never commit or push, so the branch has one writer.

| Command                          | Who        | What it does                                                                |
| -------------------------------- | ---------- | --------------------------------------------------------------------------- |
| `node t3pixel/sync.mjs follow`   | Everyone   | Fast-forward to the fork's `t3pixel`, `vp i`, build, install                |
| `node t3pixel/sync.mjs sync`     | Maintainer | Merge upstream `main`, `vp i`, `vp run check:changed`, push, build, install |
| `node t3pixel/sync.mjs continue` | Maintainer | Finish a sync after resolving conflicts or fixing checks                    |
| `node t3pixel/sync.mjs abort`    | Maintainer | Abandon an in-progress merge                                                |
| `node t3pixel/sync.mjs status`   | Everyone   | Branch, how far behind, last build and install                              |
| `node t3pixel/sync.mjs install`  | Everyone   | Install the last build                                                      |
| `node t3pixel/sync.mjs rollback` | Everyone   | Put the previously installed app back                                       |

`sync` only runs in a checkout with a remote pointing at `pingdotgg/t3code`. Every merge first saves
the branch under `refs/t3pixel/before-<time>`, and pushes never force. Builds have no update feed,
so T3 Pixel never updates itself back to upstream T3 Code; installs re-sign the bundle ad hoc.

State and logs live in `t3pixel/state/` (ignored by git). Settings: `T3PIXEL_APP` (install path),
`T3PIXEL_RUST_TOOLCHAIN` (default `1.95.0`), `T3PIXEL_PUSH=0` (skip pushing),
`T3PIXEL_UPSTREAM_REMOTE`.

## Good to know

- T3 Pixel shares its app ID and data (`~/.t3`) with T3 Code. Run only one of them at a time.
- Builds are not notarized. macOS may ask whether T3 Pixel can use keychain items saved by T3 Code;
  choose Always Allow. The prompt can return after an update.
- Done and Hidden are remembered per device.
