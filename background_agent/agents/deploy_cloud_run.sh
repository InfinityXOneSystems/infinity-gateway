#!/usr/bin/env bash
# Deploy maintenance agent to Google Cloud Run
# Requirements: gcloud CLI authenticated with a project, Docker installed

set -euo pipefail

PROJECT=${GCP_PROJECT:-your-gcp-project}
REGION=${GCP_REGION:-us-east1}
SERVICE_NAME=${SERVICE_NAME:-maintenance-agent}
IMAGE_NAME=gcr.io/${PROJECT}/${SERVICE_NAME}:latest

echo "Building container image ${IMAGE_NAME}..."
docker build -t ${IMAGE_NAME} ./agents

echo "Pushing image to GCR..."
gcloud auth configure-docker --quiet
docker push ${IMAGE_NAME}

echo "Deploying to Cloud Run: ${SERVICE_NAME} in ${REGION}..."
gcloud run deploy ${SERVICE_NAME} --image ${IMAGE_NAME} --region ${REGION} --platform managed --allow-unauthenticated --set-env-vars REPO_ROOT=/workspace/infinity-xos,MAINT_INTERVAL_MIN=15

echo "Deployment complete."
