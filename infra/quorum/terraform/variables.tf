variable "project_id" {
  type = string
}
variable "region" {
  type    = string
  default = "southamerica-east1"
}
variable "deployment_environments" {
  description = "Environments managed by this apply. Include staging and production together to preserve both environments."
  type        = set(string)
  default     = ["staging", "production"]
  validation {
    condition     = alltrue([for environment in var.deployment_environments : contains(["staging", "production"], environment)])
    error_message = "deployment_environments only accepts staging and production."
  }
}
variable "production_api_enabled" {
  description = "Safety gate: keep the production Cloud Run API and its schedulers absent until production secrets and migrated data are ready."
  type        = bool
  default     = false
}
variable "production_mail_provider" {
  description = "Production mail transport. Keep disabled until transactional email is explicitly configured and tested."
  type        = string
  default     = "disabled"

  validation {
    condition     = contains(["disabled", "console", "resend"], var.production_mail_provider)
    error_message = "production_mail_provider must be disabled, console, or resend."
  }
}
variable "production_turnstile_enabled" {
  description = "Mount the Turnstile verification secret in production only when the matching public site key is configured."
  type        = bool
  default     = false
}
variable "data_writes_disabled" {
  description = "Temporary API write freeze by environment for consistent Firestore backups and migration."
  type        = object({ staging = bool, production = bool })
  default     = { staging = false, production = false }
}
variable "api_images" {
  description = "Immutable container image by environment."
  type        = object({ staging = string, production = string })
}
variable "domains" {
  type = object({
    public_staging    = string
    manage_staging    = string
    api_staging       = string
    public_production = string
    manage_production = string
    api_production    = string
  })
}
variable "vercel_revalidate_urls" {
  type      = object({ staging = string, production = string })
  sensitive = true
}

variable "congress_import_enabled" {
  description = "Master switch for every Congress integration, by environment. Keep production disabled until staging UAT is complete."
  type        = object({ staging = bool, production = bool })
  default     = { staging = false, production = false }
}

variable "hcdn_import_enabled" {
  description = "Source-specific switch for the HCDN legislators dataset. The master switch must also be enabled."
  type        = object({ staging = bool, production = bool })
  default     = { staging = false, production = false }
}

variable "senate_import_enabled" {
  description = "Source-specific switch for the official Senate current-members dataset. The master switch must also be enabled."
  type        = object({ staging = bool, production = bool })
  default     = { staging = false, production = false }
}

variable "congress_import_mode" {
  description = "Runtime mode for Congress integrations. Shadow stores external records but never publishes local content."
  type        = object({ staging = string, production = string })
  default     = { staging = "shadow", production = "shadow" }

  validation {
    condition     = alltrue([for mode in values(var.congress_import_mode) : contains(["shadow", "assisted", "active"], mode)])
    error_message = "Congress import mode must be shadow, assisted or active. Use the enabled switches to disable it entirely."
  }
}

variable "congress_auto_sync_enabled" {
  description = "Enables the guarded daily scheduler that only downloads a source when its next 90-day check is due."
  type        = object({ staging = bool, production = bool })
  default     = { staging = false, production = false }
}

variable "congress_sync_interval_days" {
  description = "Successful source checks schedule the next automatic check after this many days."
  type        = number
  default     = 90
  validation {
    condition     = var.congress_sync_interval_days >= 1
    error_message = "congress_sync_interval_days must be at least 1."
  }
}

variable "public_access_required" {
  description = "Require an authorized Google session for public site/API routes; management endpoints always require explicit roles."
  type        = object({ staging = bool, production = bool })
  default     = { staging = false, production = false }
}

variable "public_access_allowed_domains" {
  description = "Optional Google email domains allowed to view the private batch. Prefer exact emails in Secret Manager."
  type        = object({ staging = string, production = string })
  default     = { staging = "", production = "" }
}
