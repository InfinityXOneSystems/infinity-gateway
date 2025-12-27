param(
    [string]$GCP_PROJECT = $env:GCP_PROJECT,
    [string]$Region = $env:CLOUD_RUN_REGION ?? 'us-central1'
)

if (-not $GCP_PROJECT) {
    Write-Error "Please set GCP_PROJECT environment variable"
    exit 1
}

$image = "gcr.io/$GCP_PROJECT/omni-gateway:latest"
Write-Host "Building image: $image"
docker build -f Dockerfile.prod -t $image .

Write-Host "Pushing image"
docker push $image

Write-Host "Deploying to Cloud Run in $Region"
gcloud run deploy omni-gateway --image $image --region $Region --platform managed --allow-unauthenticated --set-env-vars SAFE_MODE=true

Write-Host "Done. Use 'gcloud run services describe omni-gateway --region $Region --platform managed' to check status."
