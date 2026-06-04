# Modular Ansible Repository Architecture: Best Practices for an AI-Managed Estate

*Research report — synthesized June 2026*

---

## Table of Contents

1. [Ansible Collections as the Modularity Unit](#1-ansible-collections-as-the-modularity-unit)
2. [Monorepo vs Polyrepo for Ansible](#2-monorepo-vs-polyrepo-for-ansible)
3. [Dependency Management](#3-dependency-management)
4. [Isolated Testing with Molecule](#4-isolated-testing-with-molecule)
5. [CODEOWNERS and Ownership Boundaries](#5-codeowners-and-ownership-boundaries)
6. [Inventory and Variables: Keeping Them Modular](#6-inventory-and-variables-keeping-them-modular)
7. [Recommended Repository Topology](#7-recommended-repository-topology)
8. [Sources](#sources)

---

## 1. Ansible Collections as the Modularity Unit

### Collections vs Standalone Roles

A **collection** is the modern unit of Ansible distribution, packaging modules, plugins, roles, playbooks, and documentation into a single versioned artifact under the `namespace.collection_name` identifier. Standalone roles are now considered a legacy format for code that has not yet been integrated into a collection, or for highly local, not-distributed automation.

Key functional differences [[1]](https://docs.ansible.com/ansible/latest/dev_guide/developing_collections.html):

| Dimension | Standalone Role | Collection Role |
|---|---|---|
| Plugin location | `library/`, `filter_plugins/`, etc. inside the role | `plugins/modules/`, `plugins/filters/`, etc. at collection root — shared by all roles in the collection |
| Naming | Hyphens allowed | Lowercase alphanumeric + underscores only |
| Distribution | Galaxy as a single role | Galaxy / Automation Hub as a versioned tarball |
| Namespace isolation | None | `namespace.collection_name.role_name` FQCN |
| Dependency declaration | None | `galaxy.yml` `dependencies` dict |

The official Ansible developer guide states: "You must migrate roles to collections if you want to distribute them as certified Ansible content." [[2]](https://docs.ansible.com/ansible/latest/dev_guide/migrating_roles.html) The redhat-cop *Automation Good Practices* guide echoes this: "Package roles in an Ansible collection to simplify distribution and consumption." [[3]](https://redhat-cop.github.io/automation-good-practices/)

A critical architectural constraint: **roles embedded in a collection cannot contain plugins**. Plugins must live in the collection-level `plugins/` directory tree, where they are accessible to all roles within the collection. [[4]](https://docs.ansible.com/ansible/latest/dev_guide/developing_collections_structure.html)

### Collection Directory Structure

The canonical structure, per official documentation [[4]](https://docs.ansible.com/ansible/latest/dev_guide/developing_collections_structure.html):

```
namespace/collection_name/
├── galaxy.yml           # REQUIRED — collection metadata
├── README.md
├── meta/
│   └── runtime.yml      # minimum ansible-core version, deprecations
├── plugins/
│   ├── modules/
│   ├── filters/
│   ├── inventory/
│   └── ...
├── roles/
│   ├── role_one/
│   └── role_two/
├── playbooks/
│   ├── files/
│   ├── vars/
│   ├── templates/
│   └── tasks/
├── docs/
├── extensions/
│   └── molecule/        # collection-level Molecule scenarios
└── tests/
    └── integration/
```

Only `galaxy.yml` is mandatory. Accepted required fields for publishing [[5]](https://docs.ansible.com/projects/ansible/latest/dev_guide/collections_galaxy_meta.html):

| Field | Constraint |
|---|---|
| `namespace` | Lowercase alphanumeric + underscores; cannot start with `_` or digits |
| `name` | Same character rules as namespace |
| `version` | Semantic versioning (semver 2.0.0) |
| `readme` | Path to a `.md` file |
| `authors` | List of content creator strings |

Optional but strongly recommended for publication: `description`, `license` or `license_file`, `repository`, `documentation`, `tags`, `dependencies`.

### When to Package Roles into a Collection

Package into a collection when:

- The role(s) are intended for distribution beyond a single playbook repo.
- Multiple roles share custom plugins, module utils, or filter plugins — centralize in the collection's `plugins/` tree.
- You need a versioned, namespaced FQCN contract between consuming playbooks and the automation logic.
- You want to publish to Automation Hub or Galaxy NG.

Keep as a standalone role only for one-off, non-reusable automation confined to a single project.

### Versioning and Publishing Collections

Collections follow **Semantic Versioning 2.0.0** strictly [[6]](https://access.redhat.com/articles/4993781):

- **MAJOR**: Incompatible API or behavioral changes.
- **MINOR**: New backwards-compatible features (new modules, parameters, return values).
- **PATCH**: Backwards-compatible bug or security fixes.

Red Hat certified collections target a 4-week cadence for minor/major releases, and designate a Maintenance Release (MR) roughly every 18 months, supported for 24 months with bug and security fixes only. [[6]](https://access.redhat.com/articles/4993781)

**Publishing workflow** [[7]](https://docs.ansible.com/projects/ansible/latest/dev_guide/developing_collections_distributing.html):

1. Increment `version` in `galaxy.yml`.
2. Run `ansible-galaxy collection build` from the collection root — produces a `.tar.gz` artifact (Galaxy max: 20 MB).
3. Test the artifact locally: `ansible-galaxy collection install namespace-name-x.y.z.tar.gz`.
4. Publish: `ansible-galaxy collection publish namespace-name-x.y.z.tar.gz --server <hub_server>`.

Once published, a version **cannot be modified or deleted**. CI should gate publishing on a git tag whose name matches the `version` field in `galaxy.yml`.

---

## 2. Monorepo vs Polyrepo for Ansible

### Definitions

- **Monorepo**: One git repository containing all collections, roles, playbooks, and optionally inventory. Every change to any component is visible to every other component in the same commit graph.
- **Polyrepo**: Each collection (or role) lives in its own versioned git repository, published independently. Playbook repos consume them via `requirements.yml`.
- **Hybrid**: Shared libraries in one repo (or collection monorepo); environment-specific playbooks and inventory in separate repos.

### Tradeoffs

| | Monorepo | Polyrepo |
|---|---|---|
| Atomic refactors | Easy — single commit touches everything | Hard — requires coordinated PRs and version bumps |
| Independent versioning | Hard — all components share the same commit timeline | Easy — each repo tags and releases on its own cadence |
| CI complexity | Higher — must scope CI to changed paths | Lower per-repo — each pipeline is simple |
| Code discoverability | High — grep works everywhere | Low — scattered across repos |
| Team autonomy | Low — everyone works in the same space | High — teams own their repos |
| Supply-chain / separation of duties | Harder — all content shares the same ACL unless CODEOWNERS + branch rules are carefully configured | Easier — access is repo-scoped at the platform level |
| PCI CDE isolation | Requires branch protection + CODEOWNERS to enforce | Natural — CDE content lives in a restricted repo |
| Dependency drift | None (all co-located) | Must be managed via pinned `requirements.yml` |
| Tooling overhead | Needs path-filtered CI to avoid rebuilding everything | Standard CI per repo |

### What Mature Teams Do

The redhat-cop Automation Good Practices guide explicitly recommends: "Put each role or collection into its own Git repository." [[3]](https://redhat-cop.github.io/automation-good-practices/) The Adfinis Ansible Guide similarly advocates: "We recommend putting each role or collection into its own Git repository. Again, this makes reuse easier." [[8]](https://docs.adfinis.com/ansible-guide/roles_collections.html)

The Red Hat GitOps directory structure guide identifies polyrepo as the scalable model for multi-team organizations, where repositories reflect organizational communication boundaries. [[9]](https://developers.redhat.com/articles/2022/09/07/how-set-your-gitops-directory-structure)

### PCI Separation-of-Duties and Least-Privilege Interaction

PCI DSS requires strict separation between CDE (Cardholder Data Environment) and non-CDE systems, with separation of duties enforced such that no single person/role can make and also approve changes to CDE automation.

**In a polyrepo model**, this is enforced naturally:

- The `corp.cde_hardening` collection lives in a restricted git repository (`infra-cde/ansible-cde-collection`) with a separate access control list. Non-CDE engineers simply do not have write access to that repo.
- Merge/PR rules in that repo enforce a mandatory review from the security team before merge.
- AAP credentials for CDE targets are scoped to an Organization whose projects come **only** from the CDE collection repo.

**In a monorepo**, equivalent enforcement requires:
- A carefully maintained CODEOWNERS file with per-directory ownership mapped to CDE paths.
- Branch protection requiring CODEOWNERS approval for any change touching CDE paths.
- This works but is operationally fragile — a misconfigured CODEOWNERS rule silently removes a protection.

The AAP (Ansible Automation Platform) RBAC model [[10]](https://www.ansiblepilot.com/articles/ansible-automation-platform-rbac-role-based-access-control-enterprise-teams) enforces isolation at the Organization level regardless of repo strategy:

- Each AAP Organization has its own Users/Teams, Inventories, Credentials, Projects, and Job Templates — no cross-organization resource access.
- Production (especially CDE) environments should require Workflow approval nodes, restricting who can trigger automation against CDE hosts.
- System Auditor roles provide read-only access for compliance oversight without execution privileges.
- Credentials use a zero-knowledge consumption model: teams can *use* credentials without viewing secret values.

**Recommendation for PCI-scoped estates**: polyrepo for CDE content, with a separate, access-restricted repo for `corp.cde_*` collections. Non-CDE collections can co-exist in a collection monorepo with path-filtered CI.

---

## 3. Dependency Management

### requirements.yml

The canonical file for declaring collection and role dependencies [[11]](https://docs.ansible.com/ansible/latest/collections_guide/collections_installing.html):

```yaml
---
collections:
  - name: ansible.posix
    version: "==1.5.4"
  - name: community.general
    version: "==8.1.0"
  - name: corp.base_hardening
    version: "==2.3.1"
    source: https://automation.corp.example.com/api/galaxy/content/published/

roles:
  - name: geerlingguy.java
    version: "3.3.2"
```

Supported version operators: `*`, `==`, `!=`, `>=`, `>`, `<=`, `<`. For production infrastructure code, **pin to exact versions (`==`) for all third-party content**. Version ranges are appropriate only for collection-internal `galaxy.yml` dependency declarations (library-author style), not for playbook-level consumption. The stated rationale: "Never use version ranges like `>=8.0.0` in production requirements. Ranges compromise reproducibility across environments." [[12]](https://oneuptime.com/blog/post/2026-02-21-how-to-version-control-ansible-galaxy-dependencies/view)

*Adversarial note*: The official Ansible docs show range operators as syntactically valid [[11]](https://docs.ansible.com/ansible/latest/collections_guide/collections_installing.html); the "never use ranges" advice is a community best practice derived from reproducibility concerns, not an official prohibition. Ranges are technically functional but operationally risky for fleet management.

### Lock-File Strategy

Adopt a two-file pattern (analogous to `package.json` + `package-lock.json`):

- `requirements.yml` — human-managed declarations with exact pins.
- `requirements.lock.yml` — machine-generated record of all transitively resolved versions; regenerated as part of any dependency-update PR.

Commit both. Exclude downloaded content via `.gitignore`:

```gitignore
collections/
roles/galaxy-*
*.retry
!requirements.yml
!requirements.lock.yml
```

### Private Galaxy / Automation Hub / Galaxy NG

**Red Hat Private Automation Hub** (PAH) ships with Ansible Automation Platform and is the recommended on-premises registry for enterprise estates. It supports [[13]](https://www.redhat.com/en/blog/whats-new-and-next-in-private-automation-hub):

- Hosting Red Hat Certified, Validated, and custom in-house collections.
- **Custom repositories** scoped per team, geography, or regulatory requirement (e.g., a CDE-only repository).
- RBAC on a per-namespace and per-repository basis.
- Sync from upstream public Ansible Galaxy or Red Hat Automation Hub (curated pull).
- Requirements-file-driven sync: define a `requirements.yml`-style YAML to pull only approved versions into PAH.

Configure `ansible.cfg` to use a prioritized server list — PAH first, public Galaxy as fallback (or block fallback entirely for air-gapped estates) [[11]](https://docs.ansible.com/ansible/latest/collections_guide/collections_installing.html):

```ini
[galaxy]
server_list = corp_pah, release_galaxy

[galaxy_server.corp_pah]
url=https://automation.corp.example.com/api/galaxy/content/published/
auth_url=https://sso.corp.example.com/auth/realms/corp/protocol/openid-connect/token
client_id=galaxy-ng
token={{ lookup('env','AAP_GALAXY_TOKEN') }}

[galaxy_server.release_galaxy]
url=https://galaxy.ansible.com/
token={{ lookup('env','GALAXY_TOKEN') }}
```

**Galaxy NG** is the upstream open-source project that PAH is built on; it can be self-hosted via the Pulp Operator for teams that cannot license AAP but still need a private registry. [[14]](https://c2platform.org/docs/howto/awx/galaxy/)

**GitLab as a collection source**: `ansible-galaxy` can install from any Git URL, including internal GitLab repos, using the `git+https://` or `git+ssh://` scheme with a fragment for subdirectory selection [[11]](https://docs.ansible.com/ansible/latest/collections_guide/collections_installing.html). This is useful for pre-release testing but should not replace a PAH/Galaxy NG registry for production — it bypasses signature verification.

### Supply-Chain Integrity: Collection Signing

Private Automation Hub (AAP 2.2+) supports **GPG-based content signing** for collections [[15]](https://www.redhat.com/en/blog/digitally-signing-ansible-content-collections-using-private-automation-hub):

1. Generate a 4096-bit RSA GPG keypair; configure PAH installer with private key path.
2. Enable `automationhub_auto_sign_collections = True` in the PAH installer inventory. Uploaded collections are signed and queued for approval.
3. Export the public key as an ASCII-armored `.asc` file.
4. Consumers import the public key into a local keyring:
   ```bash
   gpg --import --no-default-keyring --keyring ~/corp_keyring.kbx corp_hub_signing.asc
   ```
5. Verify on install:
   ```bash
   ansible-galaxy collection install corp.base_hardening --keyring ~/corp_keyring.kbx
   ```
6. For Execution Environments, pass the keyring to `ansible-builder`:
   ```bash
   ansible-builder build --galaxy-keyring=/path/to/corp_keyring.kbx
   ```

This establishes an end-to-end chain of custody: collections signed at upload time, verified at install time. For third-party community collections, the recommendation is to proxy them through PAH (which can re-sign after internal review) rather than allowing direct Galaxy pulls in production.

---

## 4. Isolated Testing with Molecule

### Molecule Overview

**Molecule** is the Ansible-native testing framework for collections, playbooks, and roles [[16]](https://docs.ansible.com/projects/molecule/). It supports Docker, Vagrant, cloud, and custom drivers to create isolated, ephemeral test environments. The project supports only the latest two major Ansible versions (N/N-1) — align Molecule and `ansible-core` versions in CI accordingly.

### Molecule Directory Structure in a Collection

For testing roles within a collection, Molecule scenarios live in the `extensions/` directory [[17]](https://www.ansiblepilot.com/articles/ansible-collection-role-testing-with-molecule):

```
namespace/collection_name/
└── extensions/
    └── molecule/
        ├── role_one_default/
        │   ├── molecule.yml
        │   ├── converge.yml
        │   └── verify.yml
        └── role_two_default/
            ├── molecule.yml
            ├── converge.yml
            └── verify.yml
```

Initialize with: `cd extensions && molecule init scenario --scenario-name role_one_default`

For standalone roles, the conventional path is `roles/role_name/molecule/`.

### Standard Molecule Lifecycle

```bash
molecule create       # provision test instances
molecule converge     # apply the role
molecule idempotence  # re-apply; assert no changes
molecule verify       # run assertions (testinfra, ansible verify playbook)
molecule destroy      # tear down instances
molecule test         # full cycle (create → converge → idempotence → verify → destroy)
```

The `idempotence` step is the key contract test: a correctly written role must produce zero changes on second application. [[3]](https://redhat-cop.github.io/automation-good-practices/)

### Multiple Scenarios

Define one scenario per significant test axis (e.g., different OS families, security profiles). A typical collection CI matrix:

```yaml
# GitHub Actions matrix
strategy:
  matrix:
    scenario: [debian12_default, rhel9_hardened, ubuntu22_fips]
    ansible_version: ["stable-2.16", "stable-2.17"]
```

The `MOLECULE_EPHEMERAL_DIRECTORY` environment variable must be unique per parallel job to avoid collision. [[18]](https://docs.ansible.com/projects/molecule/ci/)

### CI Pipeline Per Collection (Polyrepo Model)

Each collection repo carries its own CI:

```yaml
# .gitlab-ci.yml (GitLab example)
stages: [lint, test, build, publish]

lint:
  stage: lint
  script:
    - yamllint .
    - ansible-lint

molecule_test:
  stage: test
  parallel:
    matrix:
      - SCENARIO: [role_one_default, role_two_default]
  script:
    - pip install molecule molecule-docker ansible-core
    - cd extensions && molecule test --scenario-name $SCENARIO
  variables:
    PY_COLORS: "1"
    ANSIBLE_FORCE_COLOR: "1"

build:
  stage: build
  script:
    - ansible-galaxy collection build
  artifacts:
    paths: ["*.tar.gz"]

publish:
  stage: publish
  when: manual
  only: [tags]
  script:
    - ansible-galaxy collection publish *.tar.gz --server corp_pah
```

### Role Contract Between Modules

The contract between a collection's roles and its consuming playbooks is defined by:

1. **`defaults/main.yml`** — documented, user-overridable inputs with safe defaults.
2. **`vars/main.yml`** — internal constants not intended for override.
3. **`meta/argument_specs.yml`** (ansible-core 2.11+) — machine-readable role argument schema, enabling `ansible-playbook --syntax-check` to validate inputs.
4. **Idempotency** — guaranteed by the Molecule `idempotence` step.
5. **Check-mode compatibility** — required; the role must not fail or make false-positive change reports when run with `--check`. [[3]](https://redhat-cop.github.io/automation-good-practices/)

Variable naming convention: all role-exported variables must be prefixed with the role name (e.g., `corp_nginx_port`, not `port`) to avoid collision across roles in the same collection. [[3]](https://redhat-cop.github.io/automation-good-practices/)

---

## 5. CODEOWNERS and Ownership Boundaries

### CODEOWNERS Mechanics

Both GitHub and GitLab support a `CODEOWNERS` file (placed at `.github/CODEOWNERS`, `.gitlab/CODEOWNERS`, or repo root) that maps path patterns to required reviewers [[19]](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) [[20]](https://docs.gitlab.com/user/project/codeowners/):

```
# Global fallback
*                          @infra-team/automation-core

# CDE collection — security team required
/collections/corp/cde_hardening/    @infra-team/security @infra-team/compliance

# Networking collection
/collections/corp/network/          @infra-team/network-ops

# Inventory (environment-specific)
/inventory/prod/                    @infra-team/sre-prod
/inventory/cde/                     @infra-team/security @infra-team/sre-cde

# Protect the CODEOWNERS file itself
/.github/CODEOWNERS                 @infra-team/automation-core
```

When **"Require review from Code Owners"** is enabled in branch protection (GitHub) or merge request approval rules (GitLab), a PR that touches any path in the CDE collection path must receive approval from `@infra-team/security` **and** `@infra-team/compliance` before it can merge.

### Monorepo CODEOWNERS for Ansible

In a collection monorepo, CODEOWNERS enables per-collection ownership without separate repositories. The pattern:

```
/collections/<namespace>/<collection_name>/   @team-owner
/playbooks/<environment>/                     @env-owner
/inventory/<environment>/                     @env-owner
```

Combined with branch protection rules requiring CODEOWNERS approval, this creates a review gate equivalent to repo-level access control. However, it requires operational discipline to keep the CODEOWNERS file accurate — a missing entry silently removes a required reviewer.

### Polyrepo CODEOWNERS

In a polyrepo, the CODEOWNERS file is simpler (often a single line `* @team-owner`) but the isolation is enforced at the repository access-control layer. Every PR to `infra-cde/ansible-cde-collection` is subject to that repo's required-reviewer rules by platform enforcement, not by file contents that can accidentally drift.

### GitLab Sections for Organized Ownership

GitLab supports CODEOWNERS **sections**, enabling organized grouping:

```
[Security]
/collections/corp/cde_hardening/ @security-team

[Network]
/collections/corp/network/ @network-ops-team

[Platform]
/collections/corp/base_os/ @platform-team
```

Each section can require a minimum number of approvals independently.

---

## 6. Inventory and Variables: Keeping Them Modular

### The Core Principle: Strict Separation

The redhat-cop Automation Good Practices guide states: "Maintain a strict separation between roles and collections on the one hand and playbook, inventory, and host vars on the other hand." [[3]](https://redhat-cop.github.io/automation-good-practices/) The Adfinis Ansible Guide reinforces this: the separation "protects against exposing sensitive customer data when publishing as open source" and enables cleaner dependency management. [[8]](https://docs.adfinis.com/ansible-guide/roles_collections.html)

### Official Recommended Inventory Layout

Per the Ansible community documentation [[21]](https://docs.ansible.com/projects/ansible/latest/tips_tricks/sample_setup.html) [[22]](https://docs.ansible.com/projects/ansible/latest/inventory_guide/intro_inventory.html):

```
inventory/
├── production/
│   ├── hosts                  # static host entries
│   ├── group_vars/
│   │   ├── all.yml            # universal defaults
│   │   ├── webservers.yml
│   │   └── dbservers/
│   │       ├── db_config.yml
│   │       └── db_secrets.yml  # vault-encrypted
│   └── host_vars/
│       └── appserver01.yml
├── staging/
│   ├── hosts
│   ├── group_vars/
│   └── host_vars/
└── cde/
    ├── hosts
    ├── group_vars/
    │   └── cde_hosts.yml      # vault-encrypted CDE-specific vars
    └── host_vars/
```

*Key rules*:
- **Never embed inventory-specific data in roles** — roles must parameterize via `defaults/main.yml` and accept values from inventory variables.
- **One inventory directory per environment** to prevent accidental cross-environment application; "define only the hosts of a single environment in each inventory." [[22]](https://docs.ansible.com/projects/ansible/latest/inventory_guide/intro_inventory.html)
- **Use `group_vars/all/` subdirectories** for large variable sets — Ansible loads every YAML file in the directory and merges them.
- **Vault-encrypt all secrets** at rest in inventory; never store plaintext credentials in `host_vars/` or `group_vars/`.

### Variable Types and Precedence

The redhat-cop guide recommends restricting variable type usage [[3]](https://redhat-cop.github.io/automation-good-practices/):

- **`defaults/main.yml`**: role inputs — user-overridable, documented.
- **`vars/main.yml`**: role-internal constants — not intended for override (high precedence; avoid using for inputs).
- **`inventory group_vars`**: desired-state variables for groups — the primary mechanism for env-specific config.
- **`inventory host_vars`**: per-host overrides.
- **Avoid `extra_vars` (`-e`)** for describing desired state in production — they cannot be audited via git history.
- **Differentiate "As-Is" (Ansible facts)** from **"To-Be" (desired state variables)**: facts are discovered at runtime; desired-state vars should come from inventory, not set arbitrarily.

### Inventory Repository Strategy

For an AI-managed estate with PCI scope:

| Inventory repo | Contents | Access |
|---|---|---|
| `infra-inventory-non-cde` | All non-CDE environments (dev, staging, prod-non-cde) | Engineering team |
| `infra-inventory-cde` | CDE hosts, vault-encrypted CDE vars | Security + SRE-CDE only |

Each playbook repo references the appropriate inventory via an `ansible.cfg` `inventory` path or a CI environment variable pointing to a checked-out inventory repo.

### Dynamic Inventory

For cloud-managed fleets, combine static and dynamic sources in an inventory directory:

```
inventory/aws_production/
├── aws_ec2.yml            # dynamic: queries EC2 with boto3
├── static_appliances      # static: network appliances that can't self-register
└── group_vars/
    └── all.yml
```

Ansible loads all sources alphabetically and merges. Tag-based host grouping in the dynamic source (e.g., `Environment=production`, `PCIScope=true`) drives group_vars application without any hardcoded host lists.

---

## 7. Recommended Repository Topology

The following topology is recommended for a multi-team, PCI-scoped, AI-managed estate. It uses a **hybrid polyrepo** strategy: collection repos are individual (one per namespace+collection), inventory repos are environment-scoped, and playbooks are environment- or app-scoped.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PRIVATE AUTOMATION HUB (Galaxy NG / PAH)                                   │
│  ┌──────────────────────────┐  ┌──────────────────────────────────────────┐ │
│  │  repo: published         │  │  repo: cde-only (restricted namespace)   │ │
│  │  corp.base_os            │  │  corp.cde_hardening                      │ │
│  │  corp.network            │  │  corp.cde_monitoring                     │ │
│  │  corp.observability      │  │  (requires security team approval)       │ │
│  └──────────────────────────┘  └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
           ▲ ansible-galaxy publish (CI on tag)      ▲ ansible-galaxy publish (CI on tag + security approval)
           │                                          │
┌──────────┴───────────────────────────────────────────────────────────────────────────────────────┐
│  COLLECTION REPOS (polyrepo — one per collection)                                                │
│                                                                                                  │
│  git: corp/ansible-collection-base-os          git: corp/ansible-collection-cde-hardening       │
│  ├── galaxy.yml (namespace=corp, name=base_os) ├── galaxy.yml (namespace=corp, name=cde_*)      │
│  ├── roles/                                    ├── roles/                                        │
│  │   ├── common/                               │   ├── pci_hardening/                           │
│  │   └── packages/                             │   └── cde_audit/                               │
│  ├── plugins/                                  ├── plugins/                                      │
│  ├── extensions/molecule/                      ├── extensions/molecule/                          │
│  └── .github/                                  ├── .github/                                      │
│      ├── CODEOWNERS (* @infra-core)            │   └── CODEOWNERS (* @security @compliance)     │
│      └── workflows/ci.yml                      └── .github/workflows/ci.yml                     │
│  (Molecule tests + publish on tag)             (Molecule tests + dual approval + publish on tag) │
│                                                                                                  │
│  git: corp/ansible-collection-network          git: corp/ansible-collection-observability       │
│  [same structure as base-os]                   [same structure as base-os]                       │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
           │ requirements.yml pinned refs                 │ requirements.yml pinned refs
           ▼                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│  PLAYBOOK REPOS (per app-team or per environment tier)                                           │
│                                                                                                  │
│  git: corp/ansible-playbooks-platform          git: corp/ansible-playbooks-cde                  │
│  ├── requirements.yml (pinned collections)     ├── requirements.yml (pinned cde collections)    │
│  ├── requirements.lock.yml                     ├── requirements.lock.yml                        │
│  ├── site.yml                                  ├── site.yml                                      │
│  ├── webservers.yml                            ├── cde_apply.yml                                │
│  └── .github/CODEOWNERS                       └── .github/CODEOWNERS (* @security @sre-cde)   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
           │ ansible.cfg inventory= points to →           │ ansible.cfg inventory= points to →
           ▼                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│  INVENTORY REPOS (per scope boundary)                                                            │
│                                                                                                  │
│  git: corp/ansible-inventory-platform          git: corp/ansible-inventory-cde                  │
│  ├── dev/                                      ├── cde/                                         │
│  │   ├── hosts / aws_ec2.yml                   │   ├── hosts                                    │
│  │   └── group_vars/                           │   ├── group_vars/                              │
│  ├── staging/                                  │   │   └── cde_hosts.yml (vault-encrypted)      │
│  └── prod/                                     │   └── host_vars/                               │
│      ├── hosts / aws_ec2.yml                   │                                                │
│      └── group_vars/                           │  Access: @security @sre-cde ONLY               │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
           │                                              │
           ▼                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│  ANSIBLE AUTOMATION PLATFORM (Controller)                                                        │
│  ┌─────────────────────────────────────┐  ┌──────────────────────────────────────────────────┐  │
│  │  Organization: Platform             │  │  Organization: CDE (isolated org)                │  │
│  │  Projects: playbooks-platform       │  │  Projects: playbooks-cde                         │  │
│  │  Inventories: inventory-platform    │  │  Inventories: inventory-cde                      │  │
│  │  Credentials: platform-ssh-key      │  │  Credentials: cde-ssh-key (separate key pair)    │  │
│  │  Team: infra-core (Admin)           │  │  Team: security + sre-cde (Admin)                │  │
│  │  Team: app-teams (Execute only)     │  │  Workflow approval required for all job launches  │  │
│  └─────────────────────────────────────┘  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Topology Decisions

1. **Each collection is its own git repo** — independent versioning, independent CI, independent CODEOWNERS.
2. **CDE collections live in a separate repo** with stricter branch protection (dual approval from `@security` + `@compliance`) and publish to a dedicated PAH repository that only the CDE AAP Organization can pull from.
3. **Playbook repos are thin** — they declare version-pinned dependencies via `requirements.yml`, import collections from PAH, and apply playbooks against inventories. No role code lives here.
4. **Inventory repos are separate from both collections and playbooks** — following the strict separation principle. The CDE inventory repo has a separate, restricted access control list.
5. **AAP Organizations enforce runtime isolation** — the CDE Organization has its own credentials, inventories, and projects. Even if a non-CDE engineer has access to the platform, they cannot launch jobs against CDE hosts.
6. **All secrets in inventory are Ansible Vault encrypted** — vault password stored as an AAP credential (zero-knowledge to engineers using the job templates).

---

## Sources

1. [Developing collections — Ansible Community Documentation](https://docs.ansible.com/ansible/latest/dev_guide/developing_collections.html)
2. [Migrating Roles to Roles in Collections on Galaxy — Ansible Community Documentation](https://docs.ansible.com/ansible/latest/dev_guide/migrating_roles.html)
3. [Good Practices for Ansible (redhat-cop)](https://redhat-cop.github.io/automation-good-practices/)
4. [Collection structure — Ansible Community Documentation](https://docs.ansible.com/ansible/latest/dev_guide/developing_collections_structure.html)
5. [Collection Galaxy metadata structure — Ansible Community Documentation](https://docs.ansible.com/projects/ansible/latest/dev_guide/collections_galaxy_meta.html)
6. [Versioning and Release Strategy for Ansible Engineering Maintained Certified Collections — Red Hat Customer Portal](https://access.redhat.com/articles/4993781)
7. [Distributing collections — Ansible Community Documentation](https://docs.ansible.com/projects/ansible/latest/dev_guide/developing_collections_distributing.html)
8. [Roles & Collections — Adfinis Ansible Guide](https://docs.adfinis.com/ansible-guide/roles_collections.html)
9. [How to set up your GitOps directory structure — Red Hat Developer](https://developers.redhat.com/articles/2022/09/07/how-set-your-gitops-directory-structure)
10. [Ansible Automation Platform RBAC: Role-Based Access Control for Enterprise Teams — AnsiblePilot](https://www.ansiblepilot.com/articles/ansible-automation-platform-rbac-role-based-access-control-enterprise-teams)
11. [Installing collections — Ansible Community Documentation](https://docs.ansible.com/ansible/latest/collections_guide/collections_installing.html)
12. [How to Version Control Ansible Galaxy Dependencies — OneUptime Blog](https://oneuptime.com/blog/post/2026-02-21-how-to-version-control-ansible-galaxy-dependencies/view)
13. [What's New and Next in Private Automation Hub — Red Hat Blog](https://www.redhat.com/en/blog/whats-new-and-next-in-private-automation-hub)
14. [Setup the Automation Hub (Galaxy NG) using Ansible — C2 Platform](https://c2platform.org/docs/howto/awx/galaxy/)
15. [Digitally signing Ansible Content Collections using private automation hub — Red Hat Blog](https://www.redhat.com/en/blog/digitally-signing-ansible-content-collections-using-private-automation-hub)
16. [Ansible Molecule — Official Documentation](https://docs.ansible.com/projects/molecule/)
17. [Ansible Collection Role Testing with Molecule — AnsiblePilot](https://www.ansiblepilot.com/articles/ansible-collection-role-testing-with-molecule)
18. [Continuous integration — Ansible Molecule Documentation](https://docs.ansible.com/projects/molecule/ci/)
19. [About code owners — GitHub Docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
20. [Code Owners — GitLab Docs](https://docs.gitlab.com/user/project/codeowners/)
21. [Sample Ansible setup — Ansible Community Documentation](https://docs.ansible.com/projects/ansible/latest/tips_tricks/sample_setup.html)
22. [How to build your inventory — Ansible Community Documentation](https://docs.ansible.com/projects/ansible/latest/inventory_guide/intro_inventory.html)
23. [Introducing Ansible Molecule with Ansible Automation Platform — Red Hat Developer](https://developers.redhat.com/articles/2023/09/13/introducing-ansible-molecule-ansible-automation-platform)
24. [Testing Ansible Automation with Molecule — End Point Dev Blog](https://www.endpointdev.com/blog/2025/03/testing-ansible-with-molecule/)
25. [Ansible Automation Hub — Red Hat](https://www.redhat.com/en/technologies/management/ansible/automation-hub)
26. [Role-based access control enhancements in Red Hat Ansible Automation Platform 2.5 — Red Hat Blog](https://www.redhat.com/en/blog/role-based-access-control-enhancements-red-hat-ansible-automation-platform-25)
27. [GitHub - redhat-cop/automation-good-practices](https://github.com/redhat-cop/automation-good-practices)
28. [Example CI/CD Pipeline for an Ansible Collection — C2 Platform](https://c2platform.org/docs/tutorials/git-workflow/6-cicd/gitcicd/collections/gitlab-cicd-collection/)
29. [Ansible Lint — galaxy rule documentation](https://docs.ansible.com/projects/lint/rules/galaxy/)
30. [How to Use Ansible with Polyrepo Structure — OneUptime Blog](https://oneuptime.com/blog/post/2026-02-21-how-to-use-ansible-with-polyrepo-structure/view)
