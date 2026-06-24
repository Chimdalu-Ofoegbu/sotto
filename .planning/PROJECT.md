# Sotto — Private Sealed-Bid OTC Execution on Canton

## What This Is

Sotto is a private sealed-bid OTC block-execution app on Canton. A seller lists a
tokenized asset block; invited counterparties submit **sealed bids no other bidder can
see**; the seller (acting as clearing party) clears to the best bid, and asset-for-cash
**settles atomically as a single delivery-versus-payment (DvP) transaction**. Losing
bidders get their escrow back and never learn the winning price.

Built for the **Build on Canton Hackathon (Encode Club)** — track: *Private DeFi &
Capital Markets*. Authoritative spec: `sotto-claude-code-handoff.md` (root).

## Core Value

The ONE thing that must work: **Canton enforces bidder-versus-bidder confidentiality
natively at the protocol level** — no trusted external auctioneer holding plaintext bids,
no ZK circuit. The privacy proof (**INV-1**) is the most important artifact in the build.
If the demo cannot show that bidder B's ledger view excludes bidder A's bid, the
submission has failed its core claim.

**Priority ordering (breaks every tie — protect higher items, cut from the bottom):**
1. Privacy guarantee (bidder-vs-bidder, protocol-enforced)
2. Atomicity guarantee (single-transaction DvP — both legs or neither)
3. Demo legibility (privacy contrast visible and reproducible)
4. Everything else (UI polish, feature count, extra bid types)

## Honest Boundary (do not overclaim)

The clearing party **does** see the bids it consumes — inherent to running a sealed-bid
auction. The defensible Sotto claim is **bidder-vs-bidder** confidentiality with no
external auctioneer and no ZK circuit, protocol-enforced. We never claim the clearing
party is blind. Commit-reveal (which would narrow even the clearing party's view) is out
of scope this session — noted as a future enhancement.

## Requirements

See `.planning/REQUIREMENTS.md`. All requirements derive from the handoff's acceptance
invariants (INV-1..INV-5), the Daml contract surface, and the additional audit checks.

## Key Decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| Daml contracts built/tested with **dpm** | Handoff-locked toolchain (Daml 3.x package manager) | Locked |
| **dpm `sandbox`** (local JVM Canton + JSON Ledger API) instead of Docker `make`-driven Canton Quickstart | Quickstart needs `make`+sudo+Docker-WSL-integration, none available; dpm sandbox preserves all guarantees (real Canton, 1 participant hosting many parties → sub-tx privacy, atomic DvP, party-scoped JSON API, LocalNet-only). Deviation logged. | Deviation (blocking reason) — see DECISIONS.md |
| Frontend: **Next.js + TypeScript** | Handoff-locked; multi-party side-by-side view is the product | Locked |
| Minimal custom **Holding** template (ASSET/CASH); no Splice Token Standard | Handoff-locked; integration overhead, no demo scoring benefit | Locked |
| LocalNet dev auth only; **no full OIDC** | Handoff-locked; OIDC is a DevNet concern | Locked |
| **Bid direction behind one constant** — default *highest-bid-wins* (OTC block trade) | Handoff-locked; relabel to procurement reverse-auction must be a 1-line change | Locked |
| Bids are **independent contracts** referencing the auction; auction consumed only at clear | Handoff contention note — avoid serialization on the shared auction contract | Locked |
| `SealedBid` stakeholders = **bidder (signatory) + seller/clearing party (observer) only** | INV-5 — never the other bidders, never a backend identity | Locked |
| Run build inside **Ubuntu WSL2**, repo on Windows side (`/mnt/c/...`) | Linux toolchain; keep git/docs in the user's project folder | Decided |
| GSD subagents on **`model_profile: inherit`** | User directive — subagents use session model (Opus 4.8), not a pinned tier | Decided |

Full rationale and any further deviations: root `DECISIONS.md`.

## Context

- **Host:** Windows 11; build runs in **Ubuntu 26.04 WSL2** (git/node/npm present).
- **Toolchain (no-sudo):** portable JDK 17 (Temurin) + `dpm` (`~/.dpm`); `dpm sandbox`
  for the local Canton ledger + JSON Ledger API. No Docker, no `make`, no sudo.
- **Out of scope (human-gated):** DevNet/TestNet/MainNet, validator whitelisting, full
  OIDC, Splice Token Standard, commit-reveal, pitch deck & video.
- **Stop conditions:** handoff Phase 3 (GSD Phase 4) acceptance passes, **or** ~700k
  token budget reached — whichever first. Checkpoint before stopping.

## Evolution

This document evolves at phase transitions. After each phase: move
validated/invalidated requirements, log decisions, refresh context.

---
*Last updated: 2026-06-24 after initialization*
