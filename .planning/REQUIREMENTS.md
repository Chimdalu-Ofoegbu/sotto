# Requirements: Sotto

Derived from the authoritative handoff (`sotto-claude-code-handoff.md`): acceptance
invariants INV-1..INV-5, the Daml contract surface, additional audit checks, and
judge-facing deliverables. REQ-IDs flow into phase success criteria and plan `must_haves`.

## v1 Requirements

### Daml Model (MODEL)
- [ ] **MODEL-01**: `Holding` template — on-ledger asset, parameterized ASSET vs CASH; signatory issuer, owner field. Both asset block and bidder cash exist on-ledger.
- [ ] **MODEL-02**: `Auction` template — created by seller; carries asset ref, invited-bidder list, reserve/floor, deadline. Invited bidders may observe *terms* only. Not consumed by bid submission.
- [ ] **MODEL-03**: `Escrow` template — bidder cash locked for a specific auction; clearing party is a stakeholder so it is consumable atomically at clear.
- [ ] **MODEL-04**: `SealedBid` template — signatory bidder; observer seller/clearing-party only (never other bidders, never a backend identity); references the bidder's `Escrow` and bid amount.
- [ ] **MODEL-05**: `Clear` choice on `Auction` — single transaction: consumes winning `SealedBid` + `Escrow`, transfers asset `Holding` to winner, winning cash to seller, releases every losing `Escrow`. Exercisable only by seller/clearing party.
- [ ] **MODEL-06**: Bid direction behind **one constant** — default highest-bid-wins; relabel to lowest-bid (procurement reverse-auction) is a single config change.
- [ ] **MODEL-07**: Deadline enforced against **ledger time** (`getTime`), not wall-clock.

### Privacy (PRIV) — protocol-enforced
- [ ] **PRIV-01 (INV-1, HARD GATE)**: Before clearing, a party-scoped query as bidder B returns no `SealedBid`/`Escrow` created by bidder A and no reference to A's amount. Verified two ways: (a) party-scoped Daml Script query, (b) JSON Ledger API query under B's own auth scope. No omniscient/admin query.
- [ ] **PRIV-04 (INV-4)**: After clearing, losing bidders learn only that they lost and that escrow was returned — not the winning amount (unless a clearing price is deliberately published as a separate explicit choice).
- [ ] **PRIV-05 (INV-5)**: Only stakeholders on any `SealedBid` are its bidder and the seller/clearing party. No backend service identity, no other bidder. Backend never aggregates plaintext bids off-ledger.

### Atomic Settlement (DVP)
- [ ] **DVP-02 (INV-2)**: Clearing transfers asset→winner and cash→seller in one transaction. Failing-path test: insufficient/invalid winning escrow → entire clear rolls back (no asset moves, no cash moves, nothing half-consumed).

### Authorization (AUTHZ)
- [ ] **AUTHZ-03 (INV-3)**: Only seller/clearing party can `Clear`. A bidder cannot exercise `Clear`, cannot read another bidder's `SealedBid`/`Escrow`, and cannot modify/withdraw their own bid after the deadline.

### Backend & E2E (API)
- [ ] **API-01**: JSON Ledger API client (thin transport interface so transport is swappable).
- [ ] **API-02**: Onboard parties on the LocalNet participant — seller + ≥2 bidders.
- [ ] **API-03**: Full programmatic flow — list asset, bidders escrow cash, submit 2 sealed bids, clear, settle, release losing escrow.
- [ ] **API-04**: Integration tests re-assert INV-1 and INV-2 at the **API layer** with party-scoped auth.
- [ ] **API-05**: `make demo` (or equivalent) — deterministic bootstrap: named fixture parties, fixed amounts, sample bids; reproducible.

### Frontend (UI)
- [ ] **UI-01**: Distinct authenticated views for seller + 2 bidders.
- [ ] **UI-02**: Privacy contrast visible — bidder A submits; bidder B's screen does not show it; seller sees both.
- [ ] **UI-03**: Seller clears; winner receives asset; settlement shown atomic.
- [ ] **UI-04**: Loser view — receives escrow back, does not see winning price.

### Audit & Docs (AUDIT / DOC)
- [ ] **AUDIT-01**: Phase-3 sweep — all invariants + additional checks (no bid after deadline; same escrow not committed twice; cannot clear archived/non-existent bid; clearing not replayable; no privilege escalation onto others' contracts).
- [ ] **AUDIT-02**: Relabel path (highest↔lowest bid) still works after the sweep.
- [ ] **DOC-01**: Judge-facing README — problem, Canton differentiator, architecture, run instructions incl. `make demo`, and exact commands a judge runs to verify INV-1 and INV-2.
- [ ] **DOC-02**: STATUS.md (version pins, done/left, blockers, human-gated follow-ups, resume) + DECISIONS.md (every non-obvious choice, bid direction, transport).
- [ ] **DOC-03**: Timed demo script.

## Out of Scope (v1)
- DevNet/TestNet/MainNet deployment, validator whitelisting, onboarding-secret flow — multi-day external wait.
- Full OIDC authentication — DevNet concern.
- Splice Token Standard integration — overhead, no demo scoring benefit.
- Commit-reveal privacy enhancement — would narrow clearing-party visibility; future work.
- Pitch deck & 3-minute video — human will handle.

## Traceability

| Phase | Requirements |
|-------|--------------|
| 1 — Recon & Blocker Check | (environment gate; precondition for all) |
| 2 — Daml Model & Privacy Proof | MODEL-01..07, PRIV-01, PRIV-04, PRIV-05, DVP-02, AUTHZ-03 |
| 3 — Backend, Escrow & E2E | API-01..05, PRIV-01 (API layer), DVP-02 (API layer) |
| 4 — Frontend, Audit & Demo | UI-01..04, AUDIT-01, AUDIT-02, DOC-01..03 |
