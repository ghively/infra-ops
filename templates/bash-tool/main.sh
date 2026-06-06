#!/usr/bin/env bash
# Canonical Bash automation tool. Glue/orchestration only — graduate to Python past
# ~50-100 lines or real logic/JSON. Strict mode; quote everything; clean up on exit.
set -euo pipefail

usage() { echo "usage: $0 --name <name>" >&2; exit 2; }

main() {
  local name=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --name) name="$2"; shift 2 ;;
      *) usage ;;
    esac
  done
  [ -n "$name" ] || usage
  echo "running for ${name}"
}

main "$@"
