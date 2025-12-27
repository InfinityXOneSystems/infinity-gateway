output "cloud_run_url" {
  value = google_cloud_run_service.credential_manager.status[0].url
}

output "credential_manager_sa" {
  value = google_service_account.credential_manager_runtime.email
}
output "sheets_agent_email" {
  value = google_service_account.sheets_agent.email
}

output "crawler_agent_email" {
  value = google_service_account.crawler_agent.email
}

output "sheets_secret_name" {
  value = google_secret_manager_secret.sheets_key.secret_id
}
