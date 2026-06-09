---
description: Style and structure rules for Terraform code
paths:
  - "**/*.tf"
---

# Terraform Style Rules

- **One resource per file** is not required but resources must be grouped by logical purpose
  (networking resources in `networking.tf`, compute in `compute.tf`, IAM in `iam.tf`).
- **All resources must have a descriptive `description` or comment** explaining their purpose.
- **Use `locals` for repeated expressions** — avoid duplicating the same expression in multiple resources.
- **Variable definitions must include `description` and `type`**:

  ```hcl
  variable "db_instance_class" {
    type        = string
    description = "RDS instance class for the application database"
    default     = "db.t3.medium"
  }
  ```

- **Output values must include `description`**.
- **`terraform fmt` before commit** — CI runs `terraform fmt -check` and fails on unformatted code.
