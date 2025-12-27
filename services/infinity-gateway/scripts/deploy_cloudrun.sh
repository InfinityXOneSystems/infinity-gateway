#!/usr/bin/env bash
set -euo pipefail

if [ -z "${GCP_PROJECT:-}" ]; then
  echo "Please set GCP_PROJECT environment variable"
  exit 1
fi

REGION=${CLOUD_RUN_REGION:-us-central1}
IMAGE=gcr.io/$GCP_PROJECT/omni-gateway:latest

echo "Building image locally: $IMAGE"
docker build -f Dockerfile.prod -t $IMAGE .

echo "Pushing image to Artifact Registry / GCR"
docker push $IMAGE

echo "Deploying to Cloud Run in $REGION"
gcloud run deploy omni-gateway \
  --image $IMAGE \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars SAFE_MODE=true

echo "Deployment complete. Run 'gcloud run services describe omni-gateway --region $REGION --platform managed' to inspect."
