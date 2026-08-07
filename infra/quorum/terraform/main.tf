locals {
  all_environments = {
    staging = {
      database        = "quorum-staging"
      api_domain      = var.domains.api_staging
      public_domain   = var.domains.public_staging
      manage_domain   = var.domains.manage_staging
      image            = var.api_images.staging
      revalidate_url   = var.vercel_revalidate_urls.staging
    }
    production = {
      database        = "quorum-production"
      api_domain      = var.domains.api_production
      public_domain   = var.domains.public_production
      manage_domain   = var.domains.manage_production
      image            = var.api_images.production
      revalidate_url   = var.vercel_revalidate_urls.production
    }
  }
  environments = { for key, value in local.all_environments : key => value if contains(var.deployment_environments, key) }
  apis = toset(["run.googleapis.com", "firestore.googleapis.com", "storage.googleapis.com", "secretmanager.googleapis.com", "cloudscheduler.googleapis.com", "artifactregistry.googleapis.com"])
  secret_suffixes = toset(["session-secret", "google-client-id", "public-access-emails", "public-gate-secret", "resend-key", "resend-webhook", "turnstile-secret", "dispatch-token", "revalidate-secret"])
  secrets = { for pair in setproduct(keys(local.environments), local.secret_suffixes) : "${pair[0]}-${pair[1]}" => { env = pair[0], suffix = pair[1] } }
}

resource "google_project_service" "required" {
  for_each           = local.apis
  service            = each.value
  disable_on_destroy = false
}

resource "google_firestore_database" "quorum" {
  for_each                = local.environments
  project                 = var.project_id
  name                    = each.value.database
  location_id             = var.region
  type                    = "FIRESTORE_NATIVE"
  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  depends_on              = [google_project_service.required]
}

resource "google_storage_bucket" "documents" {
  for_each                    = local.environments
  name                        = "${var.project_id}-quorum-${each.key}-documents"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  versioning {
    enabled = true
  }
  lifecycle_rule {
    condition {
      age                = 365
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket" "backups" {
  for_each                    = local.environments
  name                        = "${var.project_id}-quorum-${each.key}-backups"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket" "source_snapshots" {
  for_each                    = local.environments
  name                        = "${var.project_id}-quorum-${each.key}-source-snapshots"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_secret_manager_secret" "quorum" {
  for_each  = local.secrets
  secret_id = "quorum-${each.key}"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_service_account" "api" {
  for_each     = local.environments
  account_id   = "quorum-api-${each.key}"
  display_name = "Quórum API ${each.key}"
}

resource "google_service_account" "backup" {
  for_each     = local.environments
  account_id   = "quorum-backup-${each.key}"
  display_name = "Quórum backup scheduler ${each.key}"
}

resource "google_service_account" "congress_sync" {
  for_each     = local.environments
  account_id   = "quorum-congress-${each.key}"
  display_name = "Quórum Congress sync scheduler ${each.key}"
}

resource "google_project_iam_member" "api_datastore" {
  for_each = local.environments
  project  = var.project_id
  role     = "roles/datastore.user"
  member   = "serviceAccount:${google_service_account.api[each.key].email}"
}
resource "google_project_iam_member" "api_export" {
  for_each = local.environments
  project  = var.project_id
  role     = "roles/datastore.importExportAdmin"
  member   = "serviceAccount:${google_service_account.api[each.key].email}"
}
resource "google_storage_bucket_iam_member" "api_documents" {
  for_each = local.environments
  bucket   = google_storage_bucket.documents[each.key].name
  role     = "roles/storage.objectAdmin"
  member   = "serviceAccount:${google_service_account.api[each.key].email}"
}
resource "google_storage_bucket_iam_member" "api_backups" {
  for_each = local.environments
  bucket   = google_storage_bucket.backups[each.key].name
  role     = "roles/storage.admin"
  member   = "serviceAccount:${google_service_account.api[each.key].email}"
}
resource "google_storage_bucket_iam_member" "api_source_snapshots_create" {
  for_each = local.environments
  bucket   = google_storage_bucket.source_snapshots[each.key].name
  role     = "roles/storage.objectCreator"
  member   = "serviceAccount:${google_service_account.api[each.key].email}"
}
resource "google_secret_manager_secret_iam_member" "api" {
  for_each  = local.secrets
  secret_id = google_secret_manager_secret.quorum[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api[each.value.env].email}"
}

resource "google_cloud_run_v2_service" "api" {
  for_each            = local.environments
  name                = "quorum-api-${each.key}"
  location            = var.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  template {
    service_account = google_service_account.api[each.key].email
    scaling {
      min_instance_count = each.key == "production" ? 1 : 0
      max_instance_count = 10
    }
    containers {
      image = each.value.image
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "DATA_STORE"
        value = "firestore"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "FIRESTORE_DATABASE_ID"
        value = each.value.database
      }
      env {
        name  = "DOCUMENTS_BUCKET"
        value = google_storage_bucket.documents[each.key].name
      }
      env {
        name  = "BACKUPS_BUCKET"
        value = google_storage_bucket.backups[each.key].name
      }
      env {
        name  = "SOURCE_SNAPSHOTS_BUCKET"
        value = google_storage_bucket.source_snapshots[each.key].name
      }
      env {
        name  = "CONGRESS_IMPORT_ENABLED"
        value = tostring(var.congress_import_enabled[each.key])
      }
      env {
        name  = "HCDN_IMPORT_ENABLED"
        value = tostring(var.hcdn_import_enabled[each.key])
      }
      env {
        name  = "SENATE_IMPORT_ENABLED"
        value = tostring(var.senate_import_enabled[each.key])
      }
      env {
        name  = "CONGRESS_IMPORT_MODE"
        value = var.congress_import_mode[each.key]
      }
      env {
        name  = "CONGRESS_AUTO_SYNC_ENABLED"
        value = tostring(var.congress_auto_sync_enabled[each.key])
      }
      env {
        name  = "CONGRESS_SYNC_INTERVAL_DAYS"
        value = tostring(var.congress_sync_interval_days)
      }
      env {
        name  = "CONGRESS_SYNC_INVOKER_EMAIL"
        value = google_service_account.congress_sync[each.key].email
      }
      env {
        name  = "BACKUP_INVOKER_EMAIL"
        value = google_service_account.backup[each.key].email
      }
      env {
        name  = "PUBLIC_API_URL"
        value = "https://${each.value.public_domain}/api/quorum"
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = "https://${each.value.public_domain},https://${each.value.manage_domain}"
      }
      env {
        name  = "SESSION_COOKIE_DOMAIN"
        value = ".quorum.politeia.ar"
      }
      env {
        name  = "DEFAULT_ADMIN_EMAILS"
        value = "dev@politeia.ar,info@politeia.ar"
      }
      env {
        name  = "PUBLIC_ACCESS_REQUIRED"
        value = tostring(var.public_access_required[each.key])
      }
      env {
        name  = "PUBLIC_ACCESS_ALLOWED_DOMAINS"
        value = var.public_access_allowed_domains[each.key]
      }
      env {
        name  = "NEXT_REVALIDATE_URL"
        value = each.value.revalidate_url
      }
      dynamic "env" {
        for_each = { SESSION_SECRET = "session-secret", GOOGLE_CLIENT_ID = "google-client-id", PUBLIC_ACCESS_ALLOWED_EMAILS = "public-access-emails", PUBLIC_ACCESS_GATE_SECRET = "public-gate-secret", RESEND_API_KEY = "resend-key", RESEND_WEBHOOK_SECRET = "resend-webhook", TURNSTILE_SECRET_KEY = "turnstile-secret", MAIL_DISPATCH_TOKEN = "dispatch-token", NEXT_REVALIDATE_SECRET = "revalidate-secret" }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.quorum["${each.key}-${env.value}"].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  for_each = local.environments
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api[each.key].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_scheduler_job" "backup" {
  for_each  = local.environments
  name      = "quorum-${each.key}-daily-firestore-export"
  region    = var.region
  schedule  = "20 3 * * *"
  time_zone = "America/Argentina/Buenos_Aires"
  http_target {
    uri         = "${google_cloud_run_v2_service.api[each.key].uri}/v1/operations/backups/export"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.backup[each.key].email
      audience              = google_cloud_run_v2_service.api[each.key].uri
    }
  }
}

resource "google_cloud_scheduler_job" "congress_sync" {
  for_each  = { for key, value in local.environments : key => value if var.congress_auto_sync_enabled[key] }
  name      = "quorum-${each.key}-congress-sync-due"
  region    = var.region
  schedule  = "15 4 * * *"
  time_zone = "America/Argentina/Buenos_Aires"
  http_target {
    uri         = "${google_cloud_run_v2_service.api[each.key].uri}/v1/operations/integrations/legislators/sync-due"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.congress_sync[each.key].email
      audience              = google_cloud_run_v2_service.api[each.key].uri
    }
  }
}
