# STATUS — Sotto

_Last updated: 2026-06-24 — **all four phases complete** within session scope. All invariants
green in Daml Script and re-asserted over the JSON Ledger API; three-view UI live._

## Version Pins (reproducibility)

| Component | Version | Notes |
|-----------|---------|-------|
| OS (build) | Ubuntu 26.04 LTS (WSL2) | host: Windows 11 |
| JDK | Eclipse Temurin **17.0.19+10** | portable, `~/jdk17` (no sudo) |
| dpm (CLI) | **1.0.17** | `~/.dpm` (no sudo) |
| dpm SDK / Daml / Canton | **3.5.1** | `daml-script`, `codegen` components 3.5.1 |
| Node | v24 (Win) / v20+ (WSL) | zero-dep UI + JSON-API client |
| GSD | 1.40.0 | model_profile = inherit |

Restore the build env in any WSL shell: `source ~/.sotto-env.sh`. Fresh install:
`bash scripts/install-toolchain.sh`.

## What's Done (Phases 1–4)
- **Guardrails:** `model_profile: inherit` (verified via `init plan-phase`); git `commit-msg`
  hook strips any Claude co-author/`Generated with` trailer (verified on real commits); author
  = the user, on every commit.
- **Phase 1 — Recon & toolchain:** JDK 17 + dpm 3.5.1 installed no-sudo; versions pinned;
  JSON Ledger API confirmed reachable.
- **Phase 2 — Daml model & privacy proof:** `Holding`, `Auction`, `BidInvitation`, `Escrow`,
  `SealedBid` + `Clear`. **INV-1 hard gate GREEN** via party-scoped Daml Script. All 10 tests
  pass (INV-1..INV-5 + audit checks). Bid direction behind one constant.
- **Phase 3 — Backend & E2E:** thin JSON Ledger API v2 client; full list→escrow→bid→clear→
  settle→refund flow; **INV-1/INV-2 re-asserted at the API layer with party-scoped reads**
  (11 assertions); reproducible `make demo` (`scripts/demo.sh`).
- **Phase 4 — Frontend, audit, docs:** full audit sweep green; README + DEMO.md written. UI:
  faithfully ported the Claude Design handoff (`frontend/`, themed multi-screen) and **wired it
  live to Canton** — every POV view is built from real party-scoped ledger reads, so a bidder's
  screen genuinely cannot contain the other's bid and a loser never learns the cleared price
  (verified live end-to-end). Open `http://localhost:3000` (run `node frontend/server.mjs`).

## Audit Sweep (2026-06-24) — all green
1. **Invariants (`dpm test`):** 10/10 `ok` — INV-1..INV-5 + `testAuditNoDoubleEscrow`,
   `testAuditNoReplayClear`, `testInv2RollbackOnInsufficientEscrow`.
2. **Relabel path:** flip `highestBidWins` True→False builds cleanly and back — a true
   single-constant change.
3. **E2E over JSON API (`backend/demo.mjs`):** 11/11 party-scoped assertions pass
   (INV-1, INV-2, INV-4).
4. **No off-ledger plaintext aggregation:** backend/UI use only single-party (`readAs`) scoped
   queries; no admin/omniscient reads.

## Known Issues / Notes
- Build warning: tests share the package with `daml-script` (cosmetic; DAR works on the
  sandbox). Optional polish: split into model-only + test packages.
- The sandbox binds loopback (`127.0.0.1:7575`); the UI runs in WSL bound to `0.0.0.0:3000`
  and reaches the API server-side (see DECISIONS D-009).

## Blockers
- None.

## Deviations from the Handoff (with blocking reasons)
- **Canton Quickstart → dpm `sandbox`** (D-003): no make/sudo/Docker-WSL-integration; all
  guarantees preserved (real Canton, JSON Ledger API, one participant/many parties, atomic DvP,
  LocalNet-only).
- **Next.js → zero-dep Node UI** (D-010): `node_modules` on `/mnt/c` WSL is prohibitively slow
  and budget was reserved for mandatory deliverables; the handoff says the side-by-side view
  "is the product, not the design" and a thin UI is acceptable. Same demo-legibility outcome.

## Human-Gated Follow-ups (out of scope this session)
- DevNet/TestNet/MainNet deploy + validator whitelisting + onboarding-secret flow.
- Full OIDC authentication.
- Splice Token Standard integration.
- Commit-reveal privacy enhancement (would blind even the clearing party).
- Pitch deck and 3-minute video (script in DEMO.md).
- Optional: port the UI to Next.js + TypeScript; split the Daml test package.

## How to Resume / Run
1. Ubuntu WSL2: `source ~/.sotto-env.sh` (or `bash scripts/install-toolchain.sh` on a fresh box).
2. `cd /mnt/c/Users/Ben/Desktop/B3NSAG3/Hackathons/Sotto`.
3. Invariants: `make test` (model is one package; tests are a separate `daml/test` package).
4. LocalNet + demo: `make start && make demo` (or `bash scripts/sandbox.sh` then `bash scripts/demo.sh`).
5. UI: `node frontend/server.mjs` → open http://localhost:3000.
