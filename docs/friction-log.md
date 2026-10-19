# Friction log

*Earns up to a +10% judging bonus. Log entries as they happen; polish before submitting.*

Format: **Task** · Steps · Expected vs actual · Severity (Critical / High / Medium / Low) · Workaround · Suggestion

---

### 1. Running the multi-TV sample with a current Node.js
- **Task:** Install dependencies for `react-native-multi-tv-app-sample`.
- **Steps:** Clone the repo and run `yarn install` on Node 25.
- **Expected vs actual:** We expected `corepack enable && yarn` to work as the README implies. Node 25 no longer ships corepack, so `yarn` was not found. The repo pins Yarn 4.5.0 via `packageManager`, but there is no `.yarn/releases` binary.
- **Severity:** Medium.
- **Workaround:** `npx @yarnpkg/cli-dist@4.5.0 install`
- **Suggestion:** Commit the Yarn release (`yarnPath`) or document Node 25 setup in the README.

### 2. Expo web dependency drift in the sample
- **Task:** Run the sample's web target.
- **Steps:** `yarn dev:web`
- **Expected vs actual:** Expo printed 19 "should be updated for best compatibility" warnings (e.g. `react-native-web 0.19` vs the expected `^0.21`). The app still runs.
- **Severity:** Low.
- **Workaround:** Ignore the warnings.
- **Suggestion:** Run `expo install --fix` in the sample's CI so it matches the Expo SDK it targets.

### 3. Sample video sources and the "watch together" use case
- **Task:** Find legally streamable long-form content for a demo.
- **Steps:** Use the sample's catalog feed and Google's `gtv-videos-bucket` sample URLs.
- **Expected vs actual:**
  - The sample's catalog items are about 10-second clips, which can't demo watching together.
  - The well-known Google sample bucket and `download.blender.org` now return 403.
- **Severity:** Medium.
- **Workaround:** Use Internet Archive copies of the Blender open movies and public-domain films, mirrored to our own CloudFront.
- **Suggestion:** Ship a small CC-licensed long-form sample catalog, hosted by Amazon, with faststart MP4s and HLS.

### 4. No platform API for watch-together on Fire TV
- **Task:** Sync playback across two Fire TVs.
- **Expected vs actual:** There is no OS-level co-watching API (Apple has SharePlay), so every app would need its own sync service.
- **Severity:** High (product gap).
- **Workaround:** Our own WebSocket service with clock-offset estimation.
- **Also:** a third-party app can't see or control another app's player, so even with both homes on Prime Video, CouchLink can't sync Prime Video's playback. The only routes (developer-mode media-session access on Fire OS, injected key presses) can't ship in the Appstore and don't exist on Vega.
- **Suggestion:** A Vega "GroupWatch" API that handles sessions, a clock-synced media controller and an Alexa intent such as "Alexa, pause for everyone". Full proposal: [groupwatch-api.md](groupwatch-api.md).

### 5. Alexa to Fire TV app control path
- **Task:** Let a voice command pause a third-party Vega app.
- **Expected vs actual:** We found no documented way for a custom skill or Alexa+ MCP server to address a specific running Vega app.
- **Severity:** High.
- **Workaround:** Route Alexa through our backend, which pushes to the TV over WebSocket.
- **Suggestion:** Document the supported path, for example Vega content launcher or media controls intents exposed to skills.

### 6. Bedrock unusable on a new "new AWS experience" project (quota 0)
- **Task:** First Bedrock Converse call (Nova Lite / Nova 2 Lite) from a new Free-plan project in us-east-2.
- **Steps:** `aws login`, then `bedrock-runtime converse` with a 5-token prompt.
- **Expected vs actual:** We expected a reply. Instead we got `ThrottlingException: Too many tokens per day` on the very first call. Service Quotas shows the applied value as **0** for every model's "tokens per day", marked not adjustable.
- **Additional friction:** Nova 2 Lite is offered only through cross-Region inference profiles, and new-experience projects block cross-Region features.
- **Re-checked 2026-10-18, six days later:** still blocked. `amazon.nova-lite-v1:0`, `us.amazon.nova-lite-v1:0` and `us.amazon.nova-2-lite-v1:0` all return the same `ThrottlingException`. Service Quotas shows **every** "tokens per day" quota in the project at 0, not adjustable, across every model provider (Nova, Claude, Llama, Mistral, Cohere and others). Meanwhile the [supported services page](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html) lists Amazon Bedrock as included in the Free Tier, so the docs and the account disagree, and nothing in the console or the error says what would unlock it.
- **Upgrading to the Paid plan (2026-10-18) didn't help.** After the upgrade, `get-account-plan-state` reports `PAID` and every call still throttles. For Nova Lite (`L-45E0AD92`), the AWS default is 5,760,000,000 tokens per day, but the value applied at account level is 0, marked not adjustable. So the block is an account-level override that the customer can't see the reason for, can't change, and that the plan upgrade doesn't reset.
- **Severity:** High (blocks the AI half of the AWS Builder story).
- **Workaround:**
  - Deterministic offline fallback, with a circuit breaker that skips Bedrock for 10 minutes after a daily-quota error.
  - Opened an AWS Support case.
  - Use in-Region Nova Lite v1.
- **Suggestion:** Seed non-zero default Bedrock quotas for new projects (or explain why they're 0 in the console), and offer an in-Region, on-demand Nova 2 Lite.

### 7. Tracking a support case from the CLI on the Free plan
- **Task:** Check the status of the Bedrock quota support case (entry 6) from the terminal.
- **Steps:** `aws support describe-cases --include-resolved-cases`
- **Expected vs actual:** We expected to see the case we had opened. Instead: `SubscriptionRequiredException: Amazon Web Services Premium Support Subscription is required`. The case can be opened from the console but not read through the API.
- **Severity:** Low.
- **Workaround:** Check the case in the Support Center console.
- **Suggestion:** Allow read-only `DescribeCases` for a project's own cases on every plan, or say in the error where to check instead.

### 8. Web player silently stalls when the browser blocks autoplay
- **Task:** Start the same movie on two screens, one of which joined from a link.
- **Steps:** Open the web build from a `?code=` link without clicking anything, then start a movie from the other screen.
- **Expected vs actual:** We expected both screens to play. The second screen stayed paused: Chrome rejects `play()` until the user interacts with the page, and the sample's `react-native-video` web player swallows the rejection, so nothing on screen explains it. Our sync loop then re-seeked the paused video every 2.5 s.
- **Severity:** Medium (judges trying the web link would hit it).
- **Workaround:** Retry `play()` while the session is playing and show "Press OK or click to join in" until it succeeds.
- **Suggestion:** Handle autoplay rejection in the sample's web `VideoPlayer` (an `onPlaybackBlocked` callback or a built-in prompt).

### 9. Vega build fails when the project path contains a space
- **Task:** First `build:vega` of the multi-TV sample with Vega SDK 0.24.12112.
- **Steps:** Check out the repo under `~/Documents/Business/Amazon Hackathon/`, run `yarn build:vega`.
- **Expected vs actual:** We expected a `.vpkg`. Instead: `/bin/sh: /Users/.../Business/Amazon: No such file or directory` and `Unable to generate a manifest`. `@amazon-devices/kepler-compatibility-metro-config` (0.0.6) builds the manifest-builder command with `execSync` and string interpolation, so any path with a space breaks.
- **Severity:** High (blocks the build; macOS folder names with spaces are common).
- **Workaround:** `scripts/build_vega.sh` rsyncs `app/` to `~/.cache/couchlink-vega` and builds there. Workspace symlinks are relative, so the mirror works without reinstalling.
- **Suggestion:** Quote the arguments or use `execFileSync`/`spawnSync` with an argument array; add a path-with-space case to the CLI's CI.

### 10. Vega Virtual Device: screenshots and docs
- **Task:** Capture the app running on the Vega Virtual Device from the command line, and find the virtual device docs.
- **Steps:** `vda shell 'screenshooter /tmp/s.png'`, `vda shell 'gwsi-tool-screenshooter /tmp/g.png'`; open `developer.amazon.com/docs/vega/0.21/vega-virtual-device.html`.
- **Expected vs actual:**
  - `screenshooter` wrote a 0-byte file, then `vda shell` failed with `No running instances of com.amazon.dev.shell.service found` until the service recovered.
  - `gwsi-tool-screenshooter` hung for over 60 s.
  - The virtual device doc URL returned 404. The install page (0.21) also lags the SDK it installs (0.24), and `vega virtual-device` logs `vvman command not found` and reports SDK version `0.200.0`.
- **Severity:** Medium (no scripted way to capture evidence for testing or demo videos).
- **Workaround:** Screen-record the virtual device window on the host; verify app behavior through the backend and `loggingctl log -v <package>`.
- **Suggestion:** A supported `vega device screenshot` command, and versioned docs that match the current SDK.

### 11. Vega media player: speed changes flush playback, and seeks stall
- **Task:** Keep a Vega TV within tens of milliseconds of a web TV, using the same drift correction that works on the web: nudge playback speed ±5% for small gaps, and re-seek only past 1 s.
- **Steps:** Run a session between the web build and the W3C media player on the Vega Virtual Device. Log the requested seek target, the player's position before and after the seek, and buffering state.
- **Expected vs actual:**
  - We expected a small `playbackRate` change to apply smoothly, as it does in browsers. Instead it flushes the pipeline like a seek, so every nudge caused a stall and made drift worse.
  - Seeks stall for **0.4–4 s** on the virtual device, varying a lot from one seek to the next, and playback jumps 1–2 s on resume. With a 1 s re-seek threshold, the TV kept overshooting and seeking again.
- **Measured (2026-10-18, VVD vs live backend, `backend/scripts/drift_run.py`):** with these workarounds the Vega TV holds a steady offset of ~155 ms behind after a synced start, ~140 ms after a seek and ~62 ms after pause/resume, versus 35 ms between two web players that can nudge speed. The offset never shrinks on its own; one run started a new title with the player already open and stayed ~960 ms behind for two minutes.
- **Severity:** High for any watch-together or synced-playback app.
- **Workaround:**
  - No speed nudging on Vega.
  - Re-seek only past 2.5 s of drift (a per-player `seekThreshold` in our adapter).
  - Wait for playback to move again after a seek before judging drift.
  - Aim each seek ahead by the measured stall, capped at 1.5 s so an overshoot can't trigger another seek.
- **Suggestion:** Glitch-free `playbackRate` changes in the Vega W3C media player, documented seek latency, and a "seek completed / playing again" event. These would let Vega match web-level sync and are a prerequisite for the GroupWatch proposal ([groupwatch-api.md](groupwatch-api.md)).

<!-- TODO(team): add entries for Vega SDK install, Vega Virtual Device, two-instance testing, Alexa console, Bedrock model access -->
