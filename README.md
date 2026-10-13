# CouchLink

**Watch together across homes on Fire TV, in sync, with Alexa as the shared remote.**

Two people in two homes start a session with a 6-digit code. Each tells Alexa (or picks on screen) what they're in the mood for, and CouchLink's AI finds titles that suit *both* of them. They vote with the D-pad, and on a match the movie starts on every TV after a synchronized countdown. Anyone can pause, seek or ask "Alexa, who is that?". When someone asks, playback pauses on every TV and a spoiler-safe answer card appears on all screens.

Built for the **Fire TV track** (plus the AWS Builder mini challenge) of *Build, Ship, Shape: Amazon Developer Hackathon 2026*.

## Try it in 60 seconds (web build)

**Live:** https://dntnb9xo1pahz.cloudfront.net

1. Open the web app in **two browser tabs** (or on two computers).
2. Tab 1: choose a profile, then **Start a watch party**. Note the code.
3. Tab 2: open `...?name=Sam&code=<code>`, or choose **Join a party** and type the code.
4. Pick moods on both, vote **I'm in** on the same title, and watch it start in sync. Press **Ask** during playback.

Keyboard: arrows = D-pad, Enter = OK, Backspace = Back.

## Architecture

```
 Fire TV A (Vega / Fire OS app) ─┐                                  ┌─ Amazon Bedrock (Nova 2 Lite) + Guardrails
 Fire TV B / web build ──────────┼─ WebSocket ─ API Gateway ─ Lambda ┤    joint picks (catalog-only), spoiler-safe Q&A
 Echo / Alexa app ───────────────┴─ Alexa skill ─ Lambda ────────────┤
                                    (same Python core)               ├─ DynamoDB (sessions, connections, moods, votes; 24h TTL)
                                                                     └─ S3 + CloudFront (web app, 720p faststart media)
```

- **Server-authoritative sync.** State is `{mediaId, playing, position, updatedAt}`. Each TV estimates the server clock with NTP-style pings, so every TV computes the same expected position. A TV only re-seeks when it drifts more than 1 s, and last write wins. A synchronized start sets `updatedAt` slightly in the future, so every TV shows the same countdown.
- **One code path for every input.** The D-pad, the in-app Ask chips and Alexa all call the same functions in `backend/src/couchlink/core.py`.
- **AI with mechanisms, not hope:**
  - Picks are validated against catalog IDs, and anything not in the catalog is dropped.
  - Q&A only ever sees the character sheet and subtitles *up to the current timestamp*, so it can't spoil anything by construction.
  - A deterministic offline fallback keeps the demo alive if Bedrock throttles.

## Run locally

```bash
make test        # backend unit tests
make server      # ws://localhost:8787/ws  (heuristic AI, no AWS needed)
make web         # http://localhost:8082
```

Simulate Alexa against the local server:

```bash
cd backend
uv run python scripts/alexa_sim.py --user sam link 123456 Sam
uv run python scripts/alexa_sim.py --user sam mood "something with a dragon, no horror"
uv run python scripts/alexa_sim.py --user sam who "that"
```

Use Bedrock locally (requires AWS credentials and Bedrock access in your project Region (`us-east-2`)): `make server-bedrock`.

## Deploy to AWS

Prerequisites: AWS CLI v2, AWS SAM CLI, and credentials for the target account.

```bash
aws login --profile couchlink     # project Region: us-east-2
make deploy                       # API GW WebSocket, Lambdas, DynamoDB, CloudFront, dashboard
make outputs                      # WebSocketUrl, CdnUrl, WebBucketName, AlexaFunctionArn
python3 content/scripts/mirror_media.py --bucket <WebBucketName>        # needs ffmpeg
python3 content/scripts/build_catalog.py --rebase-only --sync --media-base https://<CdnUrl>/media
make deploy                       # ship the updated catalog + subtitles to Lambda
make deploy-web                   # export web build, upload, invalidate CloudFront
```

Then paste `WebSocketUrl` into `app/packages/shared-ui/src/session/config.ts` (`PROD_WS_URL`) for the TV builds.

## Alexa skill

1. In the Alexa developer console, create a custom skill named "CouchLink" with your own hosted backend.
2. Paste `alexa/interactionModel.json` into the JSON editor and build the model.
3. Set the endpoint to the `AlexaFunctionArn` output.
4. Redeploy with the skill ID: `make deploy PARAMS="AlexaSkillId=amzn1.ask.skill.xxxx"`.
5. Test on your Echo or in the console: "Alexa, tell CouchLink code 123456, I'm Sam."

## Fire TV builds

- **Vega OS:** `app/apps/vega`. Install the Vega SDK, then run `yarn build:vega` and deploy to the Vega Virtual Device or a Fire TV Stick 4K Select.
- **Fire OS / Android TV:** `app/apps/expo-multi-tv`. Run `yarn dev:android`.

## Repo layout

```
app/       React Native TV app (Vega OS, Fire OS, web), built on AmazonAppDev/react-native-multi-tv-app-sample
backend/   Python: src/couchlink (core, store, bus, ai, content), ws_handler.py, alexa_handler.py, local_server.py, tests
infra/     template.yaml (AWS SAM)
alexa/     interaction model
content/   titles.json (editorial), catalog.json (generated), scripts/
docs/      PR-FAQ, friction log, product feedback
```

## Credits

- The TV app scaffolding comes from Amazon's `react-native-multi-tv-app-sample` (MIT-0).
- Films:
  - Blender Foundation open movies: *Sintel*, *Tears of Steel*, *Cosmos Laundromat*, *Big Buck Bunny*, *Elephants Dream*, *Spring*, *Agent 327*, *Caminandes* (CC BY, © Blender Foundation).
  - Public-domain classics via the Internet Archive.
