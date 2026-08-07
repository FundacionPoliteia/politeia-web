output "api_urls" {
  value = { for key, service in google_cloud_run_v2_service.api : key => service.uri }
}
output "document_buckets" {
  value = { for key, bucket in google_storage_bucket.documents : key => bucket.name }
}
output "backup_buckets" {
  value = { for key, bucket in google_storage_bucket.backups : key => bucket.name }
}
output "source_snapshot_buckets" {
  value = { for key, bucket in google_storage_bucket.source_snapshots : key => bucket.name }
}
