---
name: supply-chain-and-sbom
description: >
  Make the PCI DSS 6.3.2 / 11.3.1.1 software-bill-of-materials and artifact-provenance
  requirements actionable: generate SBOMs (syft) for execution-environment images and
  from requirements.lock.yml, sign/attest the promoted artifact (cosign / SLSA), and
  SHA-pin CI/CD components and container images. Triggers on: SBOM, supply chain,
  provenance, attestation, cosign, syft, SLSA, dependency pinning, 6.3.2, CycloneDX.
origin: infra-ops
---

# Supply Chain & SBOM Skill

## When to Use

Use when wiring or reviewing the artifact's **provenance** controls: producing a
software bill of materials, signing/attesting the build, and pinning dependencies so
the thing deployed is verifiably the thing built. PCI DSS v4.0.1 makes this concrete —
**6.3.2** (inventory of bespoke and third-party software / SBOM) and **11.3.1.1**.

## How It Works

1. **Generate an SBOM (CycloneDX/SPDX) per release:**
   - Execution-environment images → `syft <image> -o cyclonedx-json > sbom.json`.
   - Ansible content → an inventory from `requirements.lock.yml` (pinned collections +
     roles) plus the EE SBOM. Attach the SBOM to the release/change record.
2. **Sign & attest the artifact** — the build-once artifact carries a signature
   (cosign) and/or SLSA provenance. Verify the signature **before each promotion**, so
   "same artifact promoted" is cryptographically verifiable, not filename-deep.
3. **Pin everything** — CI/CD Components by commit SHA, container images by digest,
   collections/roles by exact version in `requirements.lock.yml`. Floating tags break
   reproducibility and provenance.
4. **Govern dependency updates** — pinned bumps go through MR review (CODEOWNERS), with
   the SBOM diff visible. New transitive dependencies are a reviewable event.

## Examples

```bash
# SBOM for the execution-environment image
syft registry.example/ee/ansible@sha256:<digest> -o cyclonedx-json > sbom-ee.json

# Sign the promoted artifact and verify before deploy
cosign sign-blob --yes ansible-bundle-${CI_COMMIT_SHA}.tar.gz > artifact.sig
cosign verify-blob --signature artifact.sig ansible-bundle-${CI_COMMIT_SHA}.tar.gz
```

```yaml
# Attach the SBOM as a GitLab dependency-scanning report
sbom:
  stage: build
  script: [syft dir:. -o cyclonedx-json=gl-sbom.cdx.json]
  artifacts:
    reports:
      cyclonedx: gl-sbom.cdx.json
```

## Trust boundary

- Read-only generation/verification in the corporate-zone CI; never reaches prod or the HSA.
- SBOMs and signatures contain no secrets; never embed credentials or PAN.
- A failed signature/provenance verification **blocks** the promotion (binding gate).
