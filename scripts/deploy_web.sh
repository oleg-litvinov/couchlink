#!/usr/bin/env bash
# Export the web build, upload it behind CloudFront, and invalidate the cached index.
set -euo pipefail
STACK="${STACK:-couchlink}"; REGION="${REGION:-us-east-2}"; export AWS_PROFILE="${AWS_PROFILE:-couchlink}"
out() { aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --output text \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue"; }
WS_URL="$(out WebSocketUrl)"; BUCKET="$(out WebBucketName)"; DIST="$(out DistributionId)"; CDN="$(out CdnUrl)"
cd "$(dirname "$0")/../app/apps/expo-multi-tv"
rm -rf dist
EXPO_PUBLIC_COUCHLINK_WS_URL="$WS_URL" ./node_modules/.bin/expo export --platform web
aws s3 sync dist "s3://$BUCKET/" --exclude "media/*" --delete
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" "/" >/dev/null
echo "Web app: $CDN"
