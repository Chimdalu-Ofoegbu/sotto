# STATUS — Sotto

_Last updated: 2026-06-24 — Phase 1 (Recon & Blocker Check) in progress._

## Version Pins (reproducibility)

| Component | Version | Notes |
|-----------|---------|-------|
| OS (build) | Ubuntu 26.04 LTS (WSL2) | host: Windows 11 |
| Host shell | PowerShell + Git Bash | WSL invoked via PowerShell (path-safe) |
| JDK | _pending verify_ | Eclipse Temurin 17 (portable, `~/jdk17`) |
| dpm | _pending verify_ | manual tarball install (`~/.dpm`) |
| Daml SDK / Canton | _pending verify_ | resolved by `dpm install` per project `daml.yaml` |
| Node | (present) | for Next.js frontend |
| GSD | 1.40.0 | model_profile = inherit |

> Pins are filled in as Phase 1 verifies each tool. **Reproducibility depends on these.**

## What's Done
- Guardrails: `model_profile: inherit` (verified); git attribution hook strips any Claude
  co-author/`Generated with` trailer (verified on a real commit). Author = the user.
- `.gitignore` (secrets + Daml/Canton/Node artifacts) and `.gitattributes` (LF) committed.
- GSD planning scaffold: PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md; root
  DECISIONS.md + this STATUS.md.
- Environment recon complete; no-sudo toolchain path chosen and authorized.

## In Progress
- Phase 1: installing portable JDK 17 + dpm in Ubuntu WSL2 (no sudo).

## What's Left
- Phase 1: verify toolchain, pin versions, trivial cross-party privacy check, JSON Ledger
  API responds.
- Phase 2: Daml model + `Clear`; INV-1..INV-5 green in Daml Script (INV-1 hard gate).
- Phase 3: JSON Ledger API E2E flow; re-assert INV-1/INV-2 at API layer; `make demo`.
- Phase 4: Next.js three-view UI; audit sweep; README + demo script.

## Known Issues / Risks
- `dpm` on Ubuntu 26.04 (a very new release) is unverified — Phase 1 will confirm.
- `/mnt/c` cross-filesystem Daml builds may be slow (acceptable; fallback documented in DECISIONS D-005).
- Frontend (Windows) → `dpm sandbox` JSON API (WSL) will rely on WSL2 localhost forwarding.

## Blockers
- None currently. (If `dpm` cannot run no-sudo on Ubuntu 26.04, that becomes the Phase 1
  blocker per the handoff and will be recorded here with exact errors.)

## Deviations from the Handoff (with blocking reasons)
- **Canton Quickstart → dpm `sandbox`** — see DECISIONS.md **D-003**. No make/sudo/Docker
  WSL-integration available; guarantees preserved.

## Human-Gated Follow-ups (out of scope this session)
- DevNet/TestNet/MainNet deployment + validator IP whitelisting + onboarding-secret flow.
- Full OIDC authentication.
- Splice Token Standard integration.
- Commit-reveal privacy enhancement (would narrow even the clearing party's visibility).
- Pitch deck and 3-minute video.

## How to Resume
1. Open Ubuntu WSL2; `source ~/.sotto-env.sh` (sets JAVA_HOME + PATH for JDK/dpm).
2. `cd /mnt/c/Users/Ben/Desktop/B3NSAG3/Hackathons/Sotto`.
3. Read `.planning/STATE.md` for current position, then continue the current phase.
4. GSD: `gsd-sdk progress` shows status; plan with `/gsd-plan-phase <N>`, execute with
   `/gsd-execute-phase <N>`.
