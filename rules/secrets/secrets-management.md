# Secrets Management Rules

## Scope
These rules apply to all files in the repository, with special attention to:
- Ansible playbooks and roles (`**/*.yml`)
- GitLab CI configuration (`.gitlab-ci.yml`)
- Environment variable files (`.env*`)
- Variable definition files (`**/*vars*`, `**/*vault*`)

paths:
  - "**/*.yml"
  - "**/*.yaml"
  - ".env*"
  - "**/*vars*"
  - "**/*vault*"
  - "**/*.json"

---

## Rules

### 1. No Hardcoded Secrets
Never commit:
- API keys, tokens, or passwords in plaintext
- AWS access keys (AKIA*, ASIA*)
- GitHub tokens (ghp_*, gho_*, ghu_*)
- Private keys (*.pem, *.key)
- Database connection strings with credentials

**Correct:**
```yaml
# Use Ansible vault
api_token: "{{ vault_api_token }}"
database_password: "{{ vault_db_password }}"

# Or GitLab CI variables
script:
  - aws s3 sync ...  # Token from AWS_SECRET_ACCESS_KEY variable
```

**Incorrect:**
```yaml
api_token: "ghp_1234567890abcdef"
database_password: "MySecurePassword123!"
```

### 2. Use Ansible Vault for Sensitive Data
All sensitive variables in Ansible must be vault-encrypted:
- Passwords
- API tokens
- SSH private keys
- SSL certificates and keys

**Vault creation:**
```bash
ansible-vault create group_vars/all/vault.yml
ansible-vault encrypt group_vars/production/vault.yml
```

### 3. GitLab CI Variables
Store secrets in GitLab CI/CD variables, not in `.gitlab-ci.yml`:
- Set variables as "Protected" and "Masked" where appropriate
- Use variable expansion: `$SECRET_VAR`
- Never log secret values

### 4. No Secret Logging
Ensure Ansible tasks use `no_log: true` for sensitive operations:
```yaml
- name: Create database user
  ansible.builtin.user:
    name: "{{ db_user }}"
    password: "{{ db_password }}"
  no_log: true
```

### 5. Secret Rotation Plan
Document secret rotation procedures:
- Where secrets are stored
- How to rotate without downtime
- Who has access to vault passwords

### 6. Audit Secret Access
Maintain logs of:
- Who accessed vault files
- When secrets were last rotated
- Any secret exposure incidents

---

## Enforcement

The `governance-capture` hook will detect and log:
- Hardcoded secrets in tool input/output
- Attempts to write secrets to files
- Sensitive file access

The `pan-egress-filter` hook will block:
- Secrets in tool output (preventing exfiltration)
