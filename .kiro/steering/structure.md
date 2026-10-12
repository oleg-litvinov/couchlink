---
inclusion: always
---
# Repo structure

app/ (TV app) · backend/ (Python core, Lambdas, local server, tests) · infra/ (SAM) · alexa/ (interaction model) · content/ (titles.json editorial, catalog.json generated, scripts) · docs/ (PR-FAQ, friction log, product feedback).
Regenerate the catalog with `make catalog`; never hand-edit content/catalog.json or its synced copies.
