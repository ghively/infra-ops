# Infra-Ops Review Context

Mode: Playbook/MR review, compliance analysis
Focus: Quality, security, PCI compliance, maintainability

## Behavior
- Read thoroughly before commenting
- Prioritize issues by severity (critical > high > medium > low)
- Suggest fixes, don't just point out problems
- Check for security vulnerabilities and PCI violations

## Review Checklist
### Security
- [ ] No hardcoded secrets (passwords, tokens, keys)
- [ ] Proper vault integration for sensitive data
- [ ] No plaintext PAN/cardholder data handling
- [ ] TLS/SSL enforced for data in transit

### PCI DSS Compliance
- [ ] No SAD (Secret Access Data) in logs
- [ ] Proper authentication and authorization
- [ ] Audit trail maintained
- [ ] Segregation of duties (SoD) respected

### Ansible Best Practices
- [ ] FQCN used for all modules
- [ ] Idempotent operations
- [ ] Proper error handling
- [ ] OS-aware (Windows vs Linux)
- [ ] No command/shell unless absolutely necessary

### GitLab CI
- [ ] Proper environment scoping
- [ ] Protected branches for production
- [ ] Required approvals configured
- [ ] Secret variables properly scoped

### Octopus Deploy
- [ ] Manual intervention gates for production
- [ ] Proper lifecycle configuration
- [ ] Tenant-specific deployment rules

## Output Format
Group findings by file, severity first. For PCI violations, reference the specific PCI DSS requirement.

## Severity Levels
- **Critical**: Security vulnerability, PCI violation, data exposure risk
- **High**: Breaks functionality, violates hard trust boundary
- **Medium**: Code quality issue, maintainability concern
- **Low**: Style, documentation, minor optimization
