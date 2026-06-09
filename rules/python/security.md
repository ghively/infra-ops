---
description: Security rules for Python scripts used in infrastructure tooling and hooks
paths:
  - "**/*.py"
  - "**/scripts/**/*.py"
---

# Python Security Rules

## Critical (block on violation)

- **No hardcoded credentials** — use environment variables or Vault lookups, never string literals.
- **No `subprocess.shell=True` with user-supplied input** — this is command injection.
  Use `subprocess.run([...], shell=False)` with explicit argument lists.
- **No `pickle` / `marshal` on untrusted data** — arbitrary code execution.
- **No `eval()` or `exec()` on user input** — arbitrary code execution.

## High

- **Pin dependencies in `requirements.txt` with hashes**:

  ```
  requests==2.32.3 --hash=sha256:70761cfe03c773ceb22aa2f671b4757976145175cdfca038c02654d061d6dcc6 \
                   --hash=sha256:...
  ```

- **Use `secrets` module, not `random`**, for security-sensitive token generation:

  ```python
  import secrets
  token = secrets.token_hex(32)   # CORRECT
  # NOT: import random; token = random.token_hex(32)
  ```

- **Input validation at all external boundaries** — validate and sanitize all inputs from
  environment variables, CLI arguments, and file reads before use.
- **Avoid `os.system()`** — use `subprocess.run()` with a list of arguments.

## Medium

- **Use `bandit` in CI** — add `bandit -r scripts/` to the SAST pipeline.
- **Type hints on all public functions** — improves static analysis and reduces runtime type errors.
- **`logging` not `print()`** for operational scripts — enables log level control and structured output.

## PCI Relevance

Python scripts in this repo are part of the hook and library layer that enforces PCI controls.
A security vulnerability in a hook script (e.g., command injection in `pan-egress-filter.js`
or its Python equivalent) could undermine the entire DLP boundary. Treat hook scripts as
security-critical code and require security review on any change.
