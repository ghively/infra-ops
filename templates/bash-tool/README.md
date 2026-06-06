# Bash tool

Canonical Bash automation tool; `scripts/validate-structure.js --type bash-tool`
enforces it.

## Files

- `main.sh` — `set -euo pipefail`, quoted expansions, `main()` wrapper
- `tests/` — `bats` tests

## Usage

```bash
./main.sh --name example
bats tests/
```

Keep it small. If it grows arrays-of-records, real branching, or JSON beyond a `jq`
one-liner, rewrite as a `python-tool`.
