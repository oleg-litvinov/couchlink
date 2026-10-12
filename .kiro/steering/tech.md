---
inclusion: always
---
# CouchLink tech steering

- TV app: React Native monorepo in app/ (expo-multi-tv for web/Fire OS, vega for Vega OS). Shared code lives in app/packages/shared-ui/src.
  - Session client: session/SessionClient.ts (WebSocket, reconnect, clock offset). React state: session/SessionContext.tsx.
  - Sync math is pure and lives in session/sync.ts; players integrate through session/useSyncedPlayback.ts.
  - D-pad focus uses react-tv-space-navigation; every interactive element must be focusable and have a visible focus state.
  - Avoid emoji in UI text (Vega font coverage).
- Backend: Python 3.12 in backend/src. All behaviour goes through couchlink/core.py so WebSocket, Alexa and local dev share one code path.
  - Storage is a (pk, sk) single table (couchlink/store.py); items are JSON strings.
  - AI: couchlink/ai.py. BedrockAI (Converse API, MODEL_ID env) must always fall back to HeuristicAI. Picks must be validated against catalog ids. Q&A context must never include anything after the current position.
- Infra: AWS SAM in infra/template.yaml. Serverless only, least-privilege IAM.
- Tests: `make test` must pass before every commit. Add a test in backend/tests for every new core behaviour.
