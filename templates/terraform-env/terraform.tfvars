# Per-environment, non-secret inputs. Secrets come from the secrets manager / Vault
# provider data sources at plan time — never put secret values in tfvars.
name = "dev"
tags = {
  env   = "dev"
  owner = "infra-ops"
}
