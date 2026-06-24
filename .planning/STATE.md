# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-24)

**Core value:** Canton enforces bidder-vs-bidder bid confidentiality at the protocol level — no external auctioneer, no ZK. INV-1 is the headline proof.
**Current focus:** Complete — all four phases delivered (session scope).

## Current Position

Phase: 4 of 4 (complete)
Status: DONE within session scope. INV-1 hard gate GREEN in Daml Script and re-asserted over the JSON Ledger API (party-scoped). Atomic DvP (INV-2) + INV-3/4/5 green. Three-view UI live. Full audit sweep green. README + DEMO.md written.
Last activity: 2026-06-24 — audit sweep green; README/STATUS/DECISIONS finalized.

Progress: [██████████] 100% (v1 scope)

## Accumulated Context

### Decisions
Full log in DECISIONS.md. Headlines:
- dpm `sandbox` instead of Docker Quickstart (D-003); zero-dep Node UI instead of Next.js (D-010) — both logged deviations, guarantees preserved.
- Toolchain: JDK 17.0.19 + dpm 3.5.1, no-sudo in Ubuntu WSL2.
- Privacy design: per-bidder `BidInvitation` hides even the act of bidding.
- GSD subagents on `model_profile: inherit`; no Claude git attribution (commit-msg hook).

### Pending Todos
None.

### Blockers/Concerns
None. Optional polish: Next.js port; split Daml test package; commit-reveal (out of scope).

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Human-gated | DevNet/OIDC/Splice/commit-reveal/pitch+video | Out of scope | Init |

## Session Continuity

Last session: 2026-06-24
Stopped at: All phases complete & committed; audit sweep green; docs finalized.
Resume file: None (see STATUS.md "How to Resume / Run").
