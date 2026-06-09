---
description: Security rules for Terraform and OpenTofu infrastructure-as-code
paths:
  - "**/*.tf"
  - "**/*.tfvars"
---

# Terraform Security Rules

## Critical (block on violation)

- **No hardcoded credentials** — never put access keys, passwords, or tokens in `.tf` or `.tfvars` files.
  Use environment variables (`TF_VAR_*`), Vault provider, or AWS Secrets Manager data sources.
- **No `.tfstate` in source control** — state files contain plaintext resource attributes including secrets.
  Use remote state (S3 + DynamoDB lock, or Terraform Cloud).
- **`sensitive = true` on secret outputs**:

  ```hcl
  output "db_password" {
    value     = random_password.db.result
    sensitive = true   # REQUIRED for any secret output
  }
  ```

## High

- **Restrict provider version**:

  ```hcl
  terraform {
    required_providers {
      aws = {
        source  = "hashicorp/aws"
        version = "~> 5.0"   # NEVER use ">= 0" or no constraint
      }
    }
  }
  ```

- **Enable state encryption** when using remote state with sensitive data.
- **`prevent_destroy = true` for stateful resources** in production:

  ```hcl
  lifecycle {
    prevent_destroy = true
  }
  ```

- **IAM least privilege** — IAM policies defined in Terraform must not use `"*"` for actions
  on sensitive resource types without justification.

## Medium

- **Checkov scan before apply** — run `checkov -d .` as a CI gate.
- **Lock file committed** — `.terraform.lock.hcl` must be committed to source control.
- **No `terraform apply` in CI without a plan file** — always `plan -out=tfplan` then `apply tfplan`.
