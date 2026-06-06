# Typed, described inputs. No secrets here — use a secrets manager at build time.
variable "image_name" {
  type        = string
  description = "Name prefix for the produced image."
}

variable "instance_type" {
  type        = string
  description = "Builder instance type."
  default     = "t3.small"
}

variable "region" {
  type        = string
  description = "Build region."
}
