STACK ?= couchlink
REGION ?= us-east-2
PROFILE ?= couchlink
export AWS_PROFILE := $(PROFILE)

.PHONY: test server server-bedrock web catalog deploy deploy-web outputs

test:            ## Backend unit tests
	cd backend && uv run pytest -q

server:          ## Local session server on ws://localhost:8787/ws (heuristic AI)
	cd backend && uv run python local_server.py

server-bedrock:  ## Local server using Amazon Bedrock with your AWS credentials
	cd backend && AI_MODE=bedrock uv run python local_server.py

web:             ## TV app in the browser on http://localhost:8082
	cd app/apps/expo-multi-tv && ./node_modules/.bin/expo start --web --port 8082

catalog:         ## Rebuild content/catalog.json and sync to backend + app
	python3 content/scripts/build_catalog.py --sync

deploy:          ## Deploy backend (API GW WebSocket, Lambda, DynamoDB, CloudFront)
	sam build -t infra/template.yaml && \
	sam deploy --stack-name $(STACK) --region $(REGION) --resolve-s3 \
	  --capabilities CAPABILITY_IAM --no-confirm-changeset --no-fail-on-empty-changeset \
	  $(if $(PARAMS),--parameter-overrides $(PARAMS))

outputs:         ## Show stack outputs (WebSocketUrl, CdnUrl, AlexaFunctionArn...)
	aws cloudformation describe-stacks --stack-name $(STACK) --region $(REGION) \
	  --query "Stacks[0].Outputs" --output table

deploy-web:      ## Export the web build, upload it behind CloudFront, invalidate the cache
	STACK=$(STACK) REGION=$(REGION) AWS_PROFILE=$(PROFILE) scripts/deploy_web.sh
