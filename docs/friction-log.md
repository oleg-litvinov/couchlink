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

<!-- TODO(team): add entries for Vega SDK install, Vega Virtual Device, two-instance testing, Alexa console, Bedrock model access -->
