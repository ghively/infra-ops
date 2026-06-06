# Outputs consumed by callers (e.g. fed into an Ansible dynamic inventory).
output "name" {
  description = "The resolved name prefix."
  value       = var.name
}
