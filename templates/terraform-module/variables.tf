# Typed inputs with descriptions and validation. Mark secrets `sensitive = true`.
variable "name" {
  description = "Name prefix for resources created by this module."
  type        = string

  validation {
    condition     = length(var.name) > 0
    error_message = "name must not be empty."
  }
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default     = {}
}
