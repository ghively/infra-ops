# Resolve `governanceEvents` authority — index vs audit

- Status: Accepted (2026-07-17)
- Date: 2026-07-17
- Priority: 6
- Deciders: repo owner
- Related: `docs/architecture.md` §7, `scripts/lib/state-store.js`, `scripts/hooks/governance-capture.js`, `scripts/hooks/governance-ledger.js`

## Context and problem statement

The design correctly separates the mutable **State Store** from the append-only
**Audit Ledger** (`governance-ledger.jsonl`, fingerprinted, PCI Req 10). But governance
events are written to **both**:

- `governance-capture` → State Store `governanceEvents` collection — mutable, capped at
  1,000 entries, 30-day TTL.
- `governance-ledger` → the JSONL — authoritative, tamper-evident.

So a lossy, capped copy of audit data sits beside the tamper-evident one. If the JSONL
is authoritative for Req 10 (it is), then `governanceEvents` is a redundant mirror that
*looks* like audit and silently drops records under the cap/TTL. The design does not
state which is authoritative or what `governanceEvents` is *for*, and a busy period
(>1,000 events) silently discards State-Store governance records.

## Decision drivers

- Two governance sinks with different retention semantics is an audit-explainability
  liability.
- PCI Req 10.5.1 expects retained audit history; anything that looks like audit but
  silently truncates is a finding waiting to happen.
- The State Store is genuinely useful as a *fast, queryable* view — but only if it is
  labeled as such and not mistaken for the record of truth.

## Considered options

1. **`governanceEvents` = queryable index into the ledger** — explicitly document it as
   a non-authoritative, best-effort recent-events view; loss under cap/TTL is expected
   and fine; the JSONL is the sole record of truth. No retention change needed.
2. **`governanceEvents` = audit → exempt from pruning** — give the collection
   per-collection retention that exempts it from the 1,000-cap/30-day TTL, making it a
   second durable audit store.
3. **Drop `governanceEvents`** — write governance events only to the ledger; add a
   read helper over the JSONL for anything that needs to query recent events.

## Decision outcome

**Proposed: Option 1.** The ledger is already the tamper-evident record of truth;
duplicating durability into the State Store (Option 2) creates two things to reconcile
and two retention policies to defend. Labeling `governanceEvents` as a disposable
query cache (Option 1) resolves the ambiguity with zero code churn and keeps the fast
read path. Option 3 is cleaner conceptually but removes a useful queryable surface and
is more work than Option 1 for no compliance gain.

### Consequences

- Good: one authoritative audit store; the State Store copy is honestly scoped as a
  cache, so its loss is a non-event.
- Good: no retention special-casing in `state-store.js`.
- Bad: requires a doc/label change and a guarantee that nothing treats
  `governanceEvents` as authoritative (grep the readers).
- Neutral: does not fix the separate concurrent-write loss in `state-store.js` (that is
  a code-quality item, tracked elsewhere) — but this decision means governance *audit*
  no longer depends on that store's durability.
