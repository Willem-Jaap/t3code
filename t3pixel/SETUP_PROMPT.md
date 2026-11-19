Set up T3 Pixel on this Mac and keep it updated. T3 Pixel is Pixel Perfect's build of T3 Code
(review requests in the sidebar, one-click Approve and Request changes). It lives on the `t3pixel`
branch of https://github.com/Willem-Jaap/t3code.

1. Check the prerequisites and install whatever is missing. Ask me before anything that needs sudo.
   - Xcode command line tools: `xcode-select -p`. If missing, run `xcode-select --install` and wait
     until I confirm the installer finished.
   - Vite+ (`vp`, which also provides Node 26): `curl -fsSL https://vite.plus | bash`. Then use a new
     login shell so `vp` and `node` are on PATH.
   - Rust: install rustup non-interactively (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`),
     then `rustup toolchain install 1.95.0 --profile minimal`.
   - GitHub CLI signed in: `gh auth status`. T3 Pixel reads my review requests through it. If it is
     missing or signed out, ask me to install it or run `gh auth login`.

2. Get the code: `git clone --branch t3pixel https://github.com/Willem-Jaap/t3code.git ~/Code/t3pixel`.
   If `~/Code/t3pixel` already holds that checkout, leave it as is.

3. Build and install: in `~/Code/t3pixel`, run `node t3pixel/sync.mjs follow`. The first run takes
   about five minutes. Its last line is `T3PIXEL_RESULT {json}`; `installed: true` means
   `/Applications/T3 Pixel.app` is ready. If it fails, show me `message` and the end of `logFile`.

4. Keep it updated, using T3 Code's own project and scheduling tools:
   - Add `~/Code/t3pixel` as a project named "T3 Pixel".
   - In that project, schedule a task every day at 08:00 with this prompt: "Run
     `node t3pixel/sync.mjs follow` in this checkout and report its `T3PIXEL_RESULT` in one line.
     If it installed a new commit, tell me to restart T3 Pixel. Never commit, reset or push."

5. Finish by telling me to quit T3 Code and open T3 Pixel from Applications. It uses the same
   projects and threads, so I should run only one of the two at a time. If macOS asks whether T3 Pixel
   may use keychain items, I should choose Always Allow.
