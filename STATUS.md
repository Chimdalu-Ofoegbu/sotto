# STATUS — Sotto

_Last updated: 2026-06-24 — Phases 1–2 complete (INV-1 hard gate GREEN). Phase 3 in progress._

## Version Pins (reproducibility)

| Component | Version | Notes |
|-----------|---------|-------|
| OS (build) | Ubuntu 26.04 LTS (WSL2) | host: Windows 11 |
| JDK | Eclipse Temurin **17.0.19+10** | portable, `~/jdk17` (no sudo) |
| dpm (CLI) | **1.0.17** | `~/.dpm` (no sudo) |
| dpm SDK / Daml / Canton | **3.5.1** | `daml-script`, `codegen`, etc. components 3.5.1 |
| Node | present | for Next.js frontend (Phase 4) |
| GSD | 1.40.0 | model_profile = inherit |

Env restored in any WSL shell via `source ~/.sotto-env.sh` (sets `JAVA_HOME` + `PATH`).

## What's Done
- **Guardrails:** `model_profile: inherit` (verified via `init plan-phase`); git attribution
  hook strips any Claude co-author/`Generated with` trailer (verified on a real commit);
  author = the user.
- **Phase 1 — Recon & toolchain:** JDK 17 + dpm 3.5.1 installed no-sudo in Ubuntu WSL2;
  versions pinned. dpm `build`/`test`/`sandbox` confirmed working.
- **Phase 2 — Daml model & privacy proof (INV-1 hard gate GREEN):** `Holding`, `Auction`,
  `Escrow`, `SealedBid`, `BidInvitation` templates + `Clear` choice. **All 10 Daml Script
  tests pass**, including `testInv1Privacy` (party-scoped query — the hard gate),
  `testInv2AtomicDvp` + rollback, `testInv3Authorization`/`NoLateChanges`,
  `testInv4LoserConfidentiality`, `testInv5NoExternalHolder`, and audit checks
  (no-double-escrow, no-replay-clear). Bid direction behind one constant (`highestBidWins`).
- GSD planning scaffold + DECISIONS.md committed.

## In Progress (Phase 3)
- `dpm sandbox` (local Canton + JSON Ledger API) launched; onboarding parties and driving
  the E2E flow through the JSON Ledger API; re-asserting INV-1/INV-2 at the API layer with
  party-scoped auth; `make demo` bootstrap.

## What's Left
- Phase 3: JSON Ledger API client + integration tests (party-scoped); `make demo`.
- Phase 4: Next.js three-view UI; full audit sweep; README + demo script.

## Known Issues / Risks
- Build warning: tests share the package with `daml-script` (cosmetic; DAR works on the
  sandbox). Optional polish: split into model-only + test packages.
- `/mnt/c` cross-filesystem builds are slower than WSL-native (acceptable; sandbox runtime
  files kept in WSL home).
- Frontend (Windows) → sandbox JSON API (WSL :7575) relies on WSL2 localhost forwarding.

## Blockers
- None.

## Deviations from the Handoff (with blocking reasons)
- **Canton Quickstart → dpm `sandbox`** — DECISIONS.md **D-003**. No make/sudo/Docker-WSL
  integration available; all guarantees preserved (real Canton, JSON Ledger API, one
  participant hosting many parties, atomic DvP, LocalNet-only).

## Human-Gated Follow-ups (out of scope this session)
- DevNet/TestNet/MainNet deploy + validator whitelisting + onboarding-secret flow.
- Full OIDC authentication.
- Splice Token Standard integration.
- Commit-reveal privacy enhancement.
- Pitch deck and 3-minute video.

## How to Resume
1. Ubuntu WSL2: `source ~/.sotto-env.sh`.
2. `cd /mnt/c/Users/Ben/Desktop/B3NSAG3/Hackathons/Sotto`.
3. Daml: `cd daml && dpm build && dpm test` (re-runs INV-1..INV-5).
4. Sandbox: `dpm sandbox --dar daml/.daml/dist/sotto-0.1.0.dar --json-api-port 7575`.
5. Read `.planning/STATE.md` for position; continue Phase 3.
