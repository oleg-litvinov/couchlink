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
- **Suggestion:** A Vega "GroupWatch" API that handles sessions, a clock-synced media controller and an Alexa intent such as "Alexa, pause for everyone".

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

<!-- TODO(team): add entries for Vega SDK install, Vega Virtual Device, two-instance testing, Alexa console, Bedrock model access -->
