resource "google_service_account" "credential_manager_runtime" {
  account_id   = "credential-manager-run-sa"
  display_name = "Credential Manager runtime service account"
}

resource "google_project_iam_member" "secret_access" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.credential_manager_runtime.email}"
}

resource "google_project_iam_member" "token_creator" {
  project = var.project_id
  role    = "roles/iam.serviceAccountTokenCreator"
  member  = "serviceAccount:${google_service_account.credential_manager_runtime.email}"
}

resource "google_cloud_run_service" "credential_manager" {
  name     = "credential-manager"
  location = var.region

  template {
    spec {
      containers {
        image = var.credential_manager_image
        env {
          name  = "USE_SECRET_MANAGER"
          value = "true"
        }
        env {
          name  = "GCP_PROJECT"
          value = var.project_id
        }
      }
      service_account_name = google_service_account.credential_manager_runtime.email
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

resource "google_cloud_run_service_iam_binding" "invoker_binding" {
  location = google_cloud_run_service.credential_manager.location
  project  = var.project_id
  service  = google_cloud_run_service.credential_manager.name
  role     = "roles/run.invoker"
  members  = ["serviceAccount:${google_service_account.credential_manager_runtime.email}"]
}
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

resource "google_project_service" "drive" {
  project = var.project_id
  service = "drive.googleapis.com"
}
resource "google_project_service" "sheets" {
  project = var.project_id
  service = "sheets.googleapis.com"
}
resource "google_project_service" "docs" {
  project = var.project_id
  service = "docs.googleapis.com"
}
resource "google_project_service" "calendar" {
  project = var.project_id
  service = "calendar.googleapis.com"
}
resource "google_project_service" "script" {
  project = var.project_id
  service = "script.googleapis.com"
}
resource "google_project_service" "admin" {
  project = var.project_id
  service = "admin.googleapis.com"
}

resource "google_service_account" "sheets_agent" {
  account_id   = "sheets-agent"
  display_name = "Sheets Agent"
}

resource "google_service_account" "crawler_agent" {
  account_id   = "crawler-agent"
  display_name = "Crawler Agent"
}

resource "google_project_iam_member" "sheets_agent_drive" {
  project = var.project_id
  role    = "roles/drive.file"
  member  = "serviceAccount:${google_service_account.sheets_agent.email}"
}

resource "google_project_iam_member" "sheets_agent_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.sheets_agent.email}"
}

resource "google_project_iam_member" "crawler_agent_basic" {
  project = var.project_id
  role    = "roles/viewer"
  member  = "serviceAccount:${google_service_account.crawler_agent.email}"
}

resource "google_secret_manager_secret" "sheets_key" {
  secret_id = "sheets-agent-key"
  replication {
    automatic = true
  }
}

resource "google_service_account_key" "sheets_key" {
  service_account_id = google_service_account.sheets_agent.name
  depends_on = [google_service_account.sheets_agent]
}

resource "google_cloud_run_service_iam_binding" "invoker_binding" {
  location = google_cloud_run_service.credential_manager.location
  project  = var.project_id
  service  = google_cloud_run_service.credential_manager.name
  role     = "roles/run.invoker"
  members  = ["serviceAccount:${google_service_account.credential_manager_runtime.email}"]
}

resource "google_project_service" "drive" {
  project = var.project_id
  service = "drive.googleapis.com"
}
resource "google_project_service" "sheets" {
  project = var.project_id
  service = "sheets.googleapis.com"
}
resource "google_project_service" "docs" {
  project = var.project_id
  service = "docs.googleapis.com"
}
resource "google_project_service" "calendar" {
  project = var.project_id
  service = "calendar.googleapis.com"
}
resource "google_project_service" "script" {
  project = var.project_id
  service = "script.googleapis.com"
}
resource "google_project_service" "admin" {
  project = var.project_id
  service = "admin.googleapis.com"
}

resource "google_service_account" "sheets_agent" {
  account_id   = "sheets-agent"
  display_name = "Sheets Agent"
}

resource "google_service_account" "crawler_agent" {
  account_id   = "crawler-agent"
  display_name = "Crawler Agent"
}

resource "google_project_iam_member" "sheets_agent_drive" {
  project = var.project_id
  role    = "roles/drive.file"
  member  = "serviceAccount:${google_service_account.sheets_agent.email}"
}

resource "google_project_iam_member" "sheets_agent_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.sheets_agent.email}"
}

resource "google_project_iam_member" "crawler_agent_basic" {
  project = var.project_id
  role    = "roles/viewer"
  member  = "serviceAccount:${google_service_account.crawler_agent.email}"
}

resource "google_secret_manager_secret" "sheets_key" {
  secret_id = "sheets-agent-key"
  replication {
    automatic = true
  }
}

resource "google_service_account_key" "sheets_key" {
  service_account_id = google_service_account.sheets_agent.name
  depends_on = [google_service_account.sheets_agent]
}

resource "google_secret_manager_secret_version" "sheets_key_version" {
  secret      = google_secret_manager_secret.sheets_key.id
  secret_data = google_service_account_key.sheets_key.private_key
}

# Workload Identity binding example (Cloud Run service principal to GCP SA)
// Allow credential manager runtime SA to create tokens for sheets_agent
resource "google_service_account_iam_member" "run_to_sheets_impersonate" {
  service_account_id = google_service_account.sheets_agent.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.credential_manager_runtime.email}"
}

# Cloud Run runtime service account creation (optional)
// optional cloud_run_runtime kept out — credential_manager uses its own runtime SA above

