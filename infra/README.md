## Infra - Credential Manager

This directory contains Terraform to deploy the `credential_manager` Cloud Run service and necessary IAM bindings.

Prereqs:
- `gcloud` and `terraform` installed
- GCP project with billing enabled

High-level steps:

1. Create a Workload Identity Pool and Provider for GitHub Actions (see google-github-actions/auth docs).
2. Add repository secrets: `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `WI_POOL`, `WI_PROVIDER`, `CREDENTIAL_MANAGER_SA`.
3. Build & push container to Container Registry or Artifact Registry (CI workflow included in repo).
4. Run `terraform init` and `terraform apply -var="project_id=..." -var="credential_manager_image=..."`

Notes:
- The Cloud Run service will be deployed with `USE_SECRET_MANAGER=true` so it reads secrets from Secret Manager.
- The GitHub Actions workflow at `.github/workflows/deploy-credential-manager.yml` contains a reference for building the image and applying terraform via OIDC.
# Secret Manager Infra

This folder contains Terraform scaffolding and helper scripts to manage secrets for the project.

Workflow summary:

- Keep secret material out of git. Use `infra/secret_sources/` locally for testing but never commit it.
- Run `python generate_secrets_tf.py` to generate `infra/generated_secrets.tf` resource stubs for each file in your central credential folder.
- Copy or inject secret files into `infra/secret_sources/` in a secure CI runner before `terraform apply`.

CI template (GitHub Actions): see `infra/secret_manager_ci.yml.template` for a safe pattern to write secret files at runtime from GitHub Secrets and run `terraform apply`.
Google Cloud infra (Terraform)
================================

This folder contains Terraform scaffolding to enable required Google APIs, create service accounts, and create Secret Manager secrets. It is intended as a starting point — adjust roles, regions and resource names for production.

Usage:

```bash
cd infra
terraform init
terraform apply -var='project=infinity-x-one-systems'
```

Ensure you have authenticated with `gcloud auth application-default login` or set `GOOGLE_CREDENTIALS` env var for CI.
