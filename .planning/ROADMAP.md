# Roadmap: Sotto

## Overview

Four phases take Sotto from a verified toolchain to a live, reproducible three-view
privacy demo. The journey front-loads the hardest guarantee: the Daml model and its
**INV-1 privacy proof** (a hard gate) come before any backend or UI. Each later layer
re-asserts privacy and atomicity so a leak at any layer fails the build. GSD phases are
1-based and map to the handoff's Phase 0–3 respectively.

> **Phase mapping:** GSD Phase 1 = handoff Phase 0 · GSD Phase 2 = handoff Phase 1
> (INV-1 hard gate) · GSD Phase 3 = handoff Phase 2 · GSD Phase 4 = handoff Phase 3.

## Phases

- [x] **Phase 1: Recon & Environment Blocker Check** - Verify the no-sudo Daml toolchain and prove cross-party privacy works in this environment at all.
- [x] **Phase 2: Daml Model & Privacy Proof** - Implement templates + `Clear`; all five invariants green in Daml Script; INV-1 hard gate.
- [ ] **Phase 3: Backend, Escrow & E2E Multi-Party Flow** - JSON Ledger API drives the full list→settle cycle; re-assert INV-1/INV-2 at the API layer; `make demo`.
- [x] **Phase 4: Frontend, Audit Sweep & Live Demo** - Three authenticated views show the privacy contrast; full audit sweep; README + demo script.

## Phase Details

### Phase 1: Recon & Environment Blocker Check
**Goal**: A working, version-pinned Daml toolchain and a proven sub-transaction privacy primitive in this environment.
**Depends on**: Nothing (first phase)
**Requirements**: (environment gate)
**Success Criteria** (what must be TRUE):
  1. `dpm` and `daml`-equivalent build/test commands run; JDK 17 usable; versions pinned in STATUS.md.
  2. A trivial two-party contract: party A sees it, party B does not, via a party-scoped query (not omniscient).
  3. The JSON Ledger API (via `dpm sandbox`) responds.
**Plans**: 1 plan

Plans:
- [ ] 01-01: Install/verify toolchain, pin versions, trivial cross-party visibility check.

### Phase 2: Daml Model & Privacy Proof
**Goal**: The full contract surface with all five invariants passing in Daml Script; INV-1 verified party-scoped.
**Depends on**: Phase 1
**Requirements**: MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05, MODEL-06, MODEL-07, PRIV-01, PRIV-04, PRIV-05, DVP-02, AUTHZ-03
**Success Criteria** (what must be TRUE):
  1. `Holding`, `Auction`, `Escrow`, `SealedBid`, and the `Clear` choice exist and compile.
  2. **INV-1 (HARD GATE)**: a party-scoped Daml Script query as bidder B excludes bidder A's `SealedBid`/`Escrow`/amount — green.
  3. INV-2 atomic DvP (incl. failing-path rollback), INV-3 authorization, INV-4 loser confidentiality, INV-5 no external plaintext holder — all green.
  4. Bid direction sits behind a single constant (relabel = 1-line change).
**Plans**: TBD

Plans:
- [ ] 02-01: TBD (set during plan-phase)

### Phase 3: Backend, Escrow & E2E Multi-Party Flow
**Goal**: The full flow driven programmatically through the JSON Ledger API, with privacy and atomicity re-asserted at the API layer and a reproducible `make demo`.
**Depends on**: Phase 2
**Requirements**: API-01, API-02, API-03, API-04, API-05, PRIV-01, DVP-02
**Success Criteria** (what must be TRUE):
  1. Parties onboarded (seller + ≥2 bidders); scripted run completes list→escrow→bid→clear→settle→release.
  2. Integration tests re-assert INV-1 and INV-2 through the API with **party-scoped auth** (not omniscient).
  3. `make demo` reproducibly provisions named fixtures, the asset, and sample bids.
**Plans**: TBD

Plans:
- [ ] 03-01: TBD (set during plan-phase)

### Phase 4: Frontend, Audit Sweep & Live Demo
**Goal**: A live three-view product that visibly demonstrates privacy + atomicity, a clean audit sweep, and judge-facing docs.
**Depends on**: Phase 3
**Requirements**: UI-01, UI-02, UI-03, UI-04, AUDIT-01, AUDIT-02, DOC-01, DOC-02, DOC-03
**Success Criteria** (what must be TRUE):
  1. Seller + 2 bidder views: A submits, B's screen does not show it, seller sees both, seller clears, winner gets asset, loser gets escrow back and does not see the winning price.
  2. Full audit sweep green (all invariants + additional checks); no plaintext bid aggregation in backend; relabel path still works.
  3. README (with judge verification commands for INV-1/INV-2) and timed demo script written; audit sweep logged in STATUS.md.
**Plans**: TBD

Plans:
- [ ] 04-01: TBD (set during plan-phase)

## Progress

**Execution Order:** 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Recon & Blocker Check | 1/1 | Complete | 2026-06-24 |
| 2. Daml Model & Privacy Proof | 1/1 | Complete | 2026-06-24 |
| 3. Backend, Escrow & E2E | 1/1 | Complete | 2026-06-24 |
| 4. Frontend, Audit & Demo | 1/1 | Complete | 2026-06-24 |
