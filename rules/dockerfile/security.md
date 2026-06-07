---
description: Security rules for Dockerfiles and container image definitions
paths:
  - "**/Dockerfile"
  - "**/Dockerfile.*"
  - "**/*.dockerfile"
---

# Dockerfile Security Rules

## Critical (block on violation)

- **No `FROM latest`** — always pin to a specific digest or version tag.
  `FROM ubuntu:24.04` is acceptable; `FROM ubuntu:latest` is not.
- **No hardcoded secrets** — never use `ARG` or `ENV` for passwords, tokens, or API keys.
  Mount secrets at build time with `--secret` or inject at runtime.
- **No `--privileged` in build steps** — if a build step needs elevated permissions, restructure it.
- **No SSH keys embedded in the image** — keys in image layers are extractable from any pulled copy.

## High (should fix before merge)

- **Run as non-root** — add `USER <non-root-user>` before the final `CMD`/`ENTRYPOINT`.
  ```dockerfile
  RUN groupadd -r appuser && useradd -r -g appuser appuser
  USER appuser
  ```
- **Pin base image by digest for production images**:
  ```dockerfile
  # Acceptable: version-pinned
  FROM node:20.14-alpine3.20
  # Better: digest-pinned (immune to tag mutation)
  FROM node:20.14-alpine3.20@sha256:<digest>
  ```
- **Minimize layers with sensitive data** — if a layer contains a secret (even temporarily),
  that secret is recoverable from the image. Use multi-stage builds to discard build-time secrets.
- **Use multi-stage builds** to keep final images lean and free of build toolchain.

## Medium

- **Explicit `COPY` paths** — avoid `COPY . .`; enumerate what belongs in the image.
- **`HEALTHCHECK` instruction** — every production image should define a health check.
- **Label images** with version and maintainer:
  ```dockerfile
  LABEL version="1.2.3" maintainer="ops@example.com"
  ```
- **`RUN` commands: use `--no-cache` for package managers**:
  ```dockerfile
  RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
  ```

## PCI Relevance

Images deployed to PCI-scope systems are subject to PCI DSS Req 6.3.2 (software inventory).
Every image must be included in the SBOM. Pin versions and generate SBOM with `syft` as
part of the CI pipeline.
