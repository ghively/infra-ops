# Pin the core engine and every provider (determinism). Works with Terraform or OpenTofu.
terraform {
  required_version = "~> 1.7"

  required_providers {
    # Replace with the providers this module actually uses.
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}
