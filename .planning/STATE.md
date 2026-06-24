# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-24)

**Core value:** Canton enforces bidder-vs-bidder bid confidentiality at the protocol level — no external auctioneer, no ZK. INV-1 is the headline proof.
**Current focus:** Phase 3 — Backend, Escrow & E2E Multi-Party Flow (JSON Ledger API)

## Current Position

Phase: 3 of 4 (Backend, Escrow & E2E Multi-Party Flow)
Plan: starting
Status: Phases 1–2 complete; INV-1 hard gate GREEN in Daml Script. dpm sandbox launched; wiring JSON Ledger API E2E flow.
Last activity: 2026-06-24 — Daml model + all 10 tests green (INV-1..INV-5 + audit); committed. Sandbox booting.

Progress: [████░░░░░░] ~45%

## Accumulated Context

### Decisions
Full log in DECISIONS.md. Recent:
- Toolchain: JDK 17.0.19 + dpm 3.5.1 (CLI 1.0.17), no-sudo in Ubuntu WSL2. Pins in STATUS.md.
- dpm `sandbox` (no-Docker JVM Canton + JSON Ledger API) instead of Docker Quickstart (D-003).
- Privacy design: per-bidder `BidInvitation` makes even the *act* of bidding invisible to other bidders.
- GSD subagents on `model_profile: inherit`.

### Pending Todos
None.

### Blockers/Concerns
- daml-script shares the model package (build warning; cosmetic — DAR works on sandbox). Optional: split packages.
- Frontend (Windows) → sandbox JSON API (WSL :7575) via WSL2 localhost forwarding (Phase 4).

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Human-gated | DevNet/OIDC/Splice/commit-reveal/pitch+video | Out of scope | Init |

## Session Continuity

Last session: 2026-06-24
Stopped at: Phase 2 complete & committed (all invariants green). Sandbox launched for Phase 3.
Resume file: None (see STATUS.md "How to Resume")
