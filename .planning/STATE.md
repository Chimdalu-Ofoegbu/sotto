# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-24)

**Core value:** Canton enforces bidder-vs-bidder bid confidentiality at the protocol level — no external auctioneer, no ZK. INV-1 is the headline proof.
**Current focus:** Phase 1 — Recon & Environment Blocker Check

## Current Position

Phase: 1 of 4 (Recon & Environment Blocker Check)
Plan: 1 of 1 in current phase
Status: In progress — toolchain installing (no-sudo JDK17 + dpm in Ubuntu WSL2)
Last activity: 2026-06-24 — guardrails set (model_profile=inherit, commit-msg attribution hook verified); GSD planning scaffold authored; toolchain install running.

Progress: [█░░░░░░░░░] ~5%

## Accumulated Context

### Decisions

Full log in root DECISIONS.md / PROJECT.md Key Decisions. Recent:
- Use **dpm `sandbox`** (no-Docker JVM Canton + JSON Ledger API) instead of the Docker `make` Canton Quickstart — blocking reason: no make/sudo/Docker-WSL-integration. Guarantees preserved. (User-authorized toolchain install.)
- Build in Ubuntu WSL2; repo stays on Windows side at /mnt/c/...
- GSD subagents run on `model_profile: inherit` (session model = Opus 4.8).
- Bid direction default = highest-bid-wins, behind one constant.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 3/4 will need the JSON Ledger API reachable from the Windows-side Next.js dev server → WSL `dpm sandbox` port; confirm port forwarding (WSL2 localhost forwarding usually automatic).
- Building Daml on /mnt/c (cross-filesystem) may be slow; acceptable for project size. Fallback: build in WSL home, keep git on Windows side.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Human-gated | DevNet/OIDC/Splice/commit-reveal/pitch+video | Out of scope | Init |

## Session Continuity

Last session: 2026-06-24
Stopped at: Toolchain install in progress; planning scaffold complete.
Resume file: None (see STATUS.md for resume instructions)
