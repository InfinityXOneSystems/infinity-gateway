variable "project_id" {
  description = "GCP project id"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "credential_manager_image" {
  description = "Container image for credential_manager"
  type        = string
}

variable "credential_manager_sa" {
  description = "Service account email for Cloud Run service"
  type        = string
}
variable "project" {
  description = "GCP project id"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-east1"
}

variable "cloud_run_sa_email" {
  description = "Cloud Run runtime service account email that will be allowed to impersonate SAs"
  type        = string
  default     = ""
}

variable "credential_manager_runtime_sa" {
  description = "Service account identity (email or principal) for the credential_manager runtime that needs Secret Manager access"
  type        = string
  default     = ""
}

variable "wi_pool_id" {
  description = "Workload Identity Pool id to create"
  type = string
  default = "github-actions-pool"
}

variable "wi_provider_id" {
  description = "Workload Identity Provider id to create"
  type = string
  default = "github-provider"
}

variable "github_repo" {
  description = "GitHub repository in format owner/repo used to create principalSet binding attribute.repository value"
  type = string
  default = ""
}
