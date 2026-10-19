# Product feedback (fill in for each tool before submitting)

For each tool: what we used it for · what worked well · what needs work · onboarding (zero to hello world) · would we build with it again (Yes/No + why).

| Tool / SDK | Used for | Worked well | Needs work | Onboarding | Again? |
|---|---|---|---|---|---|
| react-native-multi-tv-app-sample | App scaffold: player, spatial navigation, drawer | One codebase for web, Fire OS and Vega; spatial navigation works on web too | Node 25/corepack setup, stale Expo deps, 10-second sample clips; web player doesn't handle autoplay rejection | ~30 min | Yes: fastest way to a TV-grade UI |
| Vega SDK / Vega Virtual Device | Vega OS build | One installer sets up the CLI, VS Code extension and virtual device; `vega virtual-device start` booted in under a minute; `vega run-app` installs and launches in one step; `inputd-cli` makes D-pad input scriptable | Build breaks on paths with spaces; no working CLI screenshot; install docs (0.21) lag the SDK (0.24); virtual device docs URL 404 | About 1 hour from account to app running on the virtual device, including the path-with-space workaround | [[team]] |
| react-tv-space-navigation | D-pad focus | Declarative focus and DefaultFocus | Wrapped rows need a grid primitive | Easy | Yes |
| Alexa Skills Kit | Voice remote | TODO | TODO | TODO | TODO |
| Amazon Bedrock (Converse, Nova Lite) | Joint picks, Q&A | Converse API makes the model a one-line env-var swap; Guardrails plug into the same call | New Free-plan project got a daily token quota of 0 (not adjustable), so the first call fails with ThrottlingException; Nova 2 Lite only via cross-Region inference profiles, which new-experience projects block | Blocked: no successful call yet. Still every tokens-per-day quota at 0 on 2026-10-18 (support case open) [[team: update when resolved]] | [[team]] |
| API Gateway WebSocket + Lambda | Real-time sync | Plain JSON over a socket, so the TV needs no SDK; scales to zero; measured ~125 ms median fan-out to the other client from us-east-2 | `$default` route plus `post_to_connection` per member means a broadcast is N API calls; no built-in rooms/fan-out primitive; `GoneException` handling is up to you | [[team]] | Yes: cheapest way to run a stateful real-time feature serverlessly |
| DynamoDB | Session state with TTL | Single-table design (session, connections, prefs, votes under one partition key) with a 24 h TTL for privacy by default | TTL deletion is lazy (up to ~48 h), so it can't be the only privacy guarantee | [[team]] | Yes |
| AWS SAM | Infrastructure as code | One template covers WebSocket API, Lambdas, table, CloudFront and dashboard; `sam deploy --resolve-s3` removes bucket setup | WebSocket APIs need raw `AWS::ApiGatewayV2::*` resources (routes, integration, deployment, stage) instead of a SAM shorthand like the HTTP API event | [[team]] | Yes |
| Kiro | Specs and dev workflow (AWS Builder) | TODO | TODO | TODO | TODO |
