# Claude Code Build Handoff: Sotto (Private Sealed-Bid OTC Execution on Canton)

You are building a hackathon submission for the Build on Canton Hackathon (Encode Club). Primary track: Private DeFi & Capital Markets. The product is named Sotto. Build end-to-end, autonomously, and stop at the conditions defined below. Treat this document as authoritative. Do not re-litigate locked decisions.

## Mission

Build a working private sealed-bid OTC block-execution app named Sotto on Canton. A seller lists a tokenized asset block. Multiple invited counterparties submit sealed bids that no other bidder can see. The seller, acting as the clearing party, clears to the best bid, and asset-for-cash settles atomically as a single delivery-versus-payment (DvP) transaction. Losing bidders get their escrow back and do not learn the winning price.

The entire value proposition is that Canton enforces bidder-versus-bidder confidentiality natively at the protocol level, with no trusted external auctioneer holding plaintext bids and no ZK circuit. If the demo cannot prove that one bidder's ledger view excludes another bidder's bid, the submission has failed its core claim. That privacy proof is the most important artifact in this build.

## Naming (thread consistently)

-- Repository and root package: `sotto`.
-- Daml package and module namespace: `Sotto`.
-- UI title and product name in all copy: Sotto.
-- Brand tone: quiet, confidential, sotto voce. Do not invent a tagline; keep it understated.

## Priority ordering (use this to break every tie)

When any trade-off appears, sacrifice in this order, protecting the higher items:
1. The privacy guarantee (bidder-versus-bidder confidentiality, protocol-enforced).
2. The atomicity guarantee (single-transaction DvP, both legs or neither).
3. Demo legibility (the privacy contrast is visible and reproducible).
4. Everything else (UI polish, feature count, extra bid types).

A rock-solid model with a thin UI beats a pretty UI on a shaky model. If budget forces a cut, cut from the bottom of this list.

## Locked decisions (do not deviate without logging a blocking reason)

-- Contracts: Daml, built with dpm (Daml package manager). Tests: Daml Script.
-- Network for this session: Canton LocalNet only, via the Canton Quickstart (`make setup && make build && make start`). Do not touch DevNet, TestNet, or MainNet.
-- Multiple parties are hosted on the single LocalNet participant. This is sufficient to prove sub-transaction privacy across parties.
-- Backend: JSON Ledger API. Fall back to the gRPC Ledger API only if a hard blocker forces it, and log the reason.
-- Frontend: Next.js + TypeScript. The multi-party, side-by-side view is the product, not the design. If a separate Sotto design spec is provided, consume it instead of inventing your own visual language.
-- Auth: LocalNet development auth is acceptable for the local demo. Do not build full OIDC. OIDC is a DevNet concern and is out of scope.
-- Asset and cash representation: a minimal custom `Holding` template. Do not integrate the Splice Token Standard in this session; it adds integration overhead for no scoring benefit at the demo stage. Note it in STATUS.md as optional future polish.
-- Atomic settlement requires both legs to be on-ledger and consumable in one transaction. Bidders must escrow cash on-ledger up front (see escrow mechanics below). A one-sided transfer is not a settlement and breaks the core claim.
-- Demo framing default: private OTC block trade (highest bid wins). A relabel to a procurement reverse-auction (lowest bid wins) must remain a single config change. Keep bid-direction logic behind one constant.
-- Pin the exact Canton Quickstart and Daml SDK versions present in the environment and record them in STATUS.md. Canton versions move and DevNet resets; reproducibility depends on the pin.

## Operating rules

-- Work autonomously. Tilt every fork toward the recommended path and the priority ordering above. When a choice is not covered here, is reversible, and is low-cost, pick the simplest option that preserves the privacy and atomicity guarantees, log it in DECISIONS.md, and continue. Only stop to surface a decision if it is irreversible, security-relevant, or changes the core architecture.
-- Commit to git after every passing phase and before any risky change. Small, frequent commits.
-- Never commit secrets: onboarding secrets, JWTs, local signing keys, or `.env` files. Add a `.gitignore` for these on the first commit. The submission repo will be public; a leaked secret in a public repo is a real failure.
-- Maintain DECISIONS.md (every non-obvious choice and why) and STATUS.md (current state, version pins, what is done, what is left, known issues, how to resume).
-- Check for blockers before building on top of anything. Phase 0 exists for this. Do not thrash against a broken environment; if the toolchain itself is broken, stop and report.
-- Audit and test as you go, not at the end. Every phase has exit criteria that must pass before the next phase starts.

## Stop conditions

Stop when either is true, whichever comes first:
-- Phase 3 acceptance criteria all pass, or
-- Context usage reaches approximately 700k of the 1M token window.

Treat 700k as a hard ceiling, not a target. You cannot measure your own context precisely, so estimate conservatively and stop early rather than overrun. Before stopping for any reason, finalize STATUS.md and DECISIONS.md, commit, and write the resume instructions. Do not start a phase you cannot plausibly finish within the remaining budget; checkpoint instead.

## Build target: Daml contract surface

Implement at least these templates. Names are suggestions; the invariants below are not.

-- `Holding`: a simple on-ledger asset, parameterized by instrument type (ASSET block vs CASH). Signatory issuer, owner field. Both the asset block and the bidders' cash exist on-ledger so settlement is a real DvP.
-- `Auction`: created by the seller. Carries asset reference, invited bidder list, reserve or floor, and deadline. Invited bidders may be observers of the auction terms (terms are not secret). The auction contract is not where bids live, and must not be a consuming dependency of bid submission (see contention note).
-- `Escrow`: a bidder's cash locked for a specific auction, with the clearing party as a stakeholder so it can be consumed atomically at clear. Without this, the atomic DvP silently degrades into a two-step transfer.
-- `SealedBid`: created by a bidder. Signatory: the bidder. Observer: the seller (clearing party) only. Never the other bidders. References the bidder's `Escrow` and the bid amount. This is the privacy-critical template.
-- Clearing: a `Clear` choice on `Auction`, exercisable only by the seller or designated clearing party, that in a single transaction consumes the winning `SealedBid` and its `Escrow`, transfers the asset `Holding` to the winner, transfers the winning cash to the seller, and releases every losing `Escrow` back to its bidder. One transaction, so it is atomic by construction.

### Contention note
Do not make bid submission exercise a consuming choice on the shared `Auction` contract, or every bidder will contend on the same contract and submissions will serialize or fail. Bids are independent contracts that reference the auction; the auction is consumed only once, at clear.

### Time note
Enforce the deadline against ledger time (Daml `getTime`), not wall-clock time, and test deadline logic with ledger time.

## Acceptance invariants (mandatory tests, must all pass)

-- INV-1 Privacy (the headline test, hard gate): before clearing, query the ledger as bidder B and assert B's active contract set and transaction stream contain no `SealedBid` or `Escrow` created by bidder A, and no reference to A's amount. Verify this two ways: a party-scoped Daml Script query, and a query through the JSON Ledger API using B's own auth scope. Do not use an omniscient or admin query for this test; an omniscient query that "sees everything" proves nothing about privacy. If this cannot be made green, see the Phase 1 hard gate.
-- INV-2 Atomic DvP: clearing transfers asset to winner and cash to seller in one transaction. Add a failing-path test where the winning bidder's escrow is insufficient or invalid, and assert the entire clear rolls back: no asset moves, no cash moves, no bid or escrow is half-consumed.
-- INV-3 Authorization: only the seller or clearing party can clear. Assert a bidder cannot exercise `Clear`, cannot read another bidder's `SealedBid` or `Escrow`, and cannot modify or withdraw their own bid after the deadline.
-- INV-4 Loser confidentiality: after clearing, assert losing bidders learn only that they lost and that escrow was returned. They do not learn the winning bid amount unless a clearing price is deliberately published as a separate, explicit choice.
-- INV-5 No external trusted plaintext holder: assert the only stakeholders on any `SealedBid` are its bidder and the seller or clearing party. Confirm no backend service identity and no other bidder appears as a stakeholder, and that the backend never aggregates plaintext bids off-ledger. Visibility is protocol-enforced, not server-enforced.

### Additional audit checks (run in the Phase 3 sweep)
-- A bidder cannot submit or edit a bid after the deadline.
-- The same `Escrow` cannot be committed to two auctions (no double-spend of locked cash).
-- The seller cannot clear to an archived or non-existent bid.
-- Clearing cannot be replayed: a second `Clear` on an already-cleared auction fails cleanly.
-- A bidder cannot escalate to observer or signatory on another bidder's contracts through any choice.

## Honest boundary (do not overclaim, do not gold-plate)

The clearing party does see the bids it consumes; this is inherent to running a sealed-bid auction and is true of sealed-bid auctions generally. The defensible Sotto claim is bidder-versus-bidder confidentiality with no external auctioneer and no ZK circuit, enforced by the protocol. Do not claim the clearing party is blind. A commit-reveal scheme that would narrow even the clearing party's visibility is explicitly out of scope for this session; note it in STATUS.md as a possible enhancement, and do not build it.

## Phases

### Phase 0: Recon and blocker check
Verify the environment before writing application logic. Confirm the Canton Quickstart starts cleanly, record the version pins, confirm Daml SDK and dpm are usable, and confirm the JSON Ledger API is reachable. Create a trivial two-party contract and confirm party A sees it and party B does not, proving sub-transaction privacy works in this environment at all, with a party-scoped query.
Exit criteria: LocalNet runs, version pins recorded, the trivial cross-party visibility check behaves correctly, JSON Ledger API responds. If any of this fails after a reasonable attempt, stop and write the blocker into STATUS.md with the exact error and what you tried.

### Phase 1: Daml model and unit tests (INV-1 is a hard gate)
Implement the templates and the `Clear` choice. Write Daml Script tests covering INV-1 through INV-5. Get them all green.
Hard gate: Phase 1 cannot exit until INV-1 is green via a party-scoped query. If INV-1 cannot be made green after honest effort, halt the entire build, do not proceed to Phase 2, and write a clear account in STATUS.md of why, because the strategic pick itself depends on this guarantee and needs human reconsideration.
Exit criteria: all five invariants pass in Daml Script, INV-1 verified party-scoped, bid direction behind a single config point.

### Phase 2: Backend, escrow, and end-to-end multi-party flow
Wire the JSON Ledger API. Onboard the parties (seller plus at least two bidders) on the LocalNet participant. Implement the full flow programmatically: list asset, bidders escrow cash, submit two sealed bids, clear, settle, release losing escrow. Add integration tests that drive the flow through the API and re-assert INV-1 and INV-2 at the API layer using party-scoped auth, not just in Daml Script. Build a deterministic seed or bootstrap script (target a single `make demo`) that provisions named fixture parties, the asset, and sample bids, so the demo and the video are reproducible.
Exit criteria: a scripted end-to-end run completes a full list-to-settlement cycle, integration tests pass, privacy and atomicity hold through the API with party-scoped auth, and `make demo` reproducibly sets up the scenario.

### Phase 3: Frontend, audit sweep, and live local product
Build the Next.js UI with distinct authenticated views for the seller and the two bidders. The demo must visibly show: bidder A submits a bid, bidder B's screen does not show it, the seller sees both, the seller clears, the winner receives the asset, the loser receives escrow back and does not see the winning price, and settlement is atomic. Run the full audit sweep (all invariants plus the additional audit checks), confirm no plaintext bid aggregation in the backend, confirm the relabel path still works, and re-run everything green. Write the judge-facing README (below) and a timed demo script.
Exit criteria: all tests and audit checks green, the three-view privacy demo works locally end-to-end and reproducibly via `make demo`, the README and demo script are written, the audit sweep is logged in STATUS.md. Then stop.

## Out of scope for this session (human-gated, do not attempt)

-- DevNet, TestNet, or MainNet deployment, and any validator IP whitelisting or onboarding-secret flow. DevNet whitelisting is a multi-day external wait.
-- Full OIDC authentication.
-- The Splice Token Standard integration.
-- A commit-reveal privacy enhancement.
-- The pitch deck and the 3-minute video.
Flag each of these in STATUS.md as a follow-up the human will handle.

## README (judge-facing, required)

The repository is public and the README is what a judge reads first. It must include: the problem statement, the specific Canton differentiator (native sub-transaction privacy and atomic DvP, versus a trusted auctioneer or a ZK circuit), the architecture (templates, parties, the clearing transaction), exact run instructions including `make demo`, and the privacy and atomicity claims with the exact commands a judge can run to verify INV-1 and INV-2 themselves.

## Implementation Notes

-- Write INV-1 first and treat any regression as stop-the-line. It is the entire claim.
-- Keep the asset block and the cash as real on-ledger holdings, with cash escrowed up front, so the clear is a genuine atomic DvP. A one-sided transfer undercuts the core claim.
-- Do not make invited bidders observers of each other anywhere in the model. The auction terms can be shared; a bid never can.
-- Do not let bid submission contend on the shared auction contract. Bids are independent contracts referencing the auction.
-- The clearing party seeing bids is correct and inherent; keep DECISIONS.md and all copy accurate on this and never overclaim blindness.
-- Prefer clarity over feature count. Two bidders proving privacy and one atomic clear beats five half-working bid types.
-- If you must fall back from JSON API to gRPC, isolate the change behind a thin client interface so the relabel and the frontend do not care which transport is used.
-- Re-assert privacy at every layer it can leak: Daml Script, the API integration tests with party-scoped auth, and the live UI. A leak at any layer is a failure.
-- Make the demo deterministic: named fixtures, fixed amounts, reproducible via `make demo`, so the video can be re-shot identically.

## On stop, deliver

-- STATUS.md: version pins, what is done, what is left, known issues and blockers, the human-gated follow-ups, and exact resume instructions.
-- DECISIONS.md: every non-obvious decision and its rationale, including the chosen bid direction and any transport fallback.
-- README: the judge-facing content above, including the verification commands.
-- A clean git history with the final state committed and no secrets in the tree.
