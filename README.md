# Sotto — private sealed-bid OTC block execution on Canton

> Quiet markets. A seller lists a tokenized asset block. Invited counterparties submit
> **sealed bids no other bidder can see**. The seller clears to the best bid, and
> asset-for-cash **settles atomically** — one transaction, both legs or neither. Losing
> bidders get their escrow back and never learn the winning price.

Built for the **Build on Canton Hackathon** (Encode Club) · track: *Private DeFi & Capital
Markets*.

---

## The problem

Sealed-bid auctions need bidder-versus-bidder confidentiality. The usual answers are a
**trusted auctioneer** that holds every plaintext bid (a single point of trust and leakage)
or a **ZK circuit** (heavy to build, audit, and run). Settlement then happens *after* the
auction as a separate transfer — leaving a window where one leg can fail.

## Why Canton (the differentiator)

Sotto needs **no trusted auctioneer and no ZK circuit**. Two native Canton properties do the
work:

1. **Sub-transaction privacy (protocol-enforced).** A contract is visible only to its
   stakeholders. A `SealedBid` is signed by its bidder and observed by the seller **only** —
   never by other bidders, never by a backend identity. Bidder B's ledger view simply does
   not contain bidder A's bid. This is enforced by the protocol, not by a server promising to
   keep secrets.
2. **Atomic delivery-versus-payment.** Clearing is a single Daml transaction that consumes
   the winning bid + escrow, moves the asset to the winner, the winning cash to the seller,
   and refunds every losing escrow. One transaction ⇒ atomic by construction.

**Honest boundary.** The seller, as clearing party, *does* see the bids it clears — inherent
to running a sealed-bid auction, and true of sealed-bid auctions generally. Sotto's claim is
precise: **bidder-vs-bidder** confidentiality with no external auctioneer and no ZK. A
commit-reveal scheme that would blind even the clearing party is noted as future work, not
claimed here.

## Architecture

**Parties:** a `Bank`/issuer (issues on-ledger asset + cash holdings), the `Seller` (also the
clearing party), and invited bidders (`A`, `B`, …). Multiple parties are hosted on one Canton
participant — sufficient to prove sub-transaction privacy across parties.

**Daml templates** (`daml/daml/Sotto.daml`):

| Template | Signatory | Observer | Purpose |
|----------|-----------|----------|---------|
| `Holding` | issuer | owner | On-ledger ASSET block / CASH; owner-controlled `Transfer` (issuer authority delegated via the contract). |
| `Auction` | seller | invited bidders | Terms (asset, reserve, deadline). **Never consumed by bidding** — only once, at clear. |
| `BidInvitation` | seller | one bidder | Private per-bidder channel. `PlaceSealedBid` checks the (ledger-time) deadline and creates the bid + escrow — so even the *act* of bidding is invisible to other bidders. |
| `Escrow` | bidder | clearing party | Bidder cash locked for the auction; `Settle` / `Refund` consumed atomically at clear. |
| `SealedBid` | **bidder** | **seller only** | The privacy-critical contract. References the escrow + amount. |

**Clearing** is the `Clear` choice on `Auction` (controller: seller). In one transaction it
selects the best qualifying bid (direction behind a single constant, `highestBidWins`),
delivers the asset to the winner, settles the winning cash to the seller, and refunds the
losers. Bids are **independent contracts** referencing the auction (no contention on a shared
contract).

**Backend:** a thin JSON Ledger API v2 client (`backend/ledger.mjs`) — transport is isolated
behind it. **UI:** three party-scoped views (`frontend/`) that render exactly what each party
can see on the ledger.

## Run it

**Prerequisites** (no sudo, no Docker): JDK 17 + `dpm` (Daml/Canton 3.5 package manager),
installed into your home dir. On Linux/WSL:

```bash
bash scripts/install-toolchain.sh   # installs JDK 17 (Temurin) + dpm into ~/jdk17 and ~/.dpm
source ~/.sotto-env.sh              # JAVA_HOME + PATH
```

**Build + run the invariant tests** (Daml Script, in-memory — no network needed):

```bash
make test            # compile the model + run INV-1..INV-5 (Daml Script, in-memory, no network)
```

**Start LocalNet** (`dpm sandbox` = Canton + JSON Ledger API on :7575) and run the
reproducible end-to-end demo:

```bash
make start    # or: bash scripts/sandbox.sh
make demo     # or: bash scripts/demo.sh   — provisions parties, asset, sample bids, clears
```

**The UI — a landing page + a live three-party demo:**

```bash
node frontend/server.mjs            # prints http://localhost:3000/?token=…  (open that exact URL)
```

The server prints a **tokenized URL** — open it as-is (the `?token=…` is required; the demo's
`/api/*` endpoints reject an untokened caller). You land on the **landing page**; click
**Launch Demo** (the token is carried through automatically) to open the working demo at
`/demo.html`.

In the demo, use the **Viewing / acting as** switcher (Seller / Bidder A / Bidder B) to drive and
watch each party's own ledger view. As the **Seller**, publish the block; as **Bidder A
(Meridian)** submit a sealed bid and watch it **never appear on Bidder B (Halcyon)'s screen**,
while the Seller only sees that bids are in. When the bidding window closes, switch to the Seller
and **Clear to best bid** — asset-for-cash settles atomically, the loser is refunded and never
learns the winning price. **Auto-run scenario** stages the whole two-bid flow in one click;
**Reset** starts over. Every panel is rendered **only** from that party's own party-scoped ledger
reads — the privacy contrast is protocol-enforced, not faked in the view layer.

> `make` not installed? Every target maps to a script: `bash scripts/sandbox.sh`,
> `bash scripts/demo.sh`, `make test   # builds the model + runs the Daml Script suite`.

## Verify the claims yourself

**INV-1 — bidder-vs-bidder confidentiality (the headline), two independent ways:**

```bash
# (a) Party-scoped Daml Script query — the hard gate
make test   # builds the model + runs the Daml Script suite
#   => daml/Sotto/Test.daml:testInv1Privacy: ok
#      asserts a query AS bidder B contains no SealedBid/Escrow created by A, and no A amount.

# (b) Through the JSON Ledger API with party-scoped reads (not an admin/omniscient query)
bash scripts/demo.sh
#   => "INV-1 — bidder-vs-bidder confidentiality (party-scoped JSON queries): ✓ ..."
```

**INV-2 — atomic DvP (and its failing-path rollback):**

```bash
make test   # builds the model + runs the Daml Script suite
#   => testInv2AtomicDvp: ok                  (asset→winner, cash→seller, loser refunded)
#   => testInv2RollbackOnInsufficientEscrow: ok (a bad winning escrow rolls the WHOLE clear back)
bash scripts/demo.sh
#   => "INV-2 — atomic delivery-vs-payment (party-scoped JSON queries): ✓ ..."
```

All invariants are exercised by `dpm test` (Daml Script) and re-asserted at the API layer by
`backend/demo.mjs`:

| Invariant | Meaning | Where verified |
|-----------|---------|----------------|
| INV-1 | bidder-vs-bidder confidentiality | Daml Script (party-scoped) **+** JSON API (party-scoped) |
| INV-2 | atomic DvP + rollback on bad leg | Daml Script + JSON API |
| INV-3 | only seller clears; no post-deadline bid/withdraw; no cross-bidder access | Daml Script |
| INV-4 | loser learns only "you lost + refund", never the winning price | Daml Script + JSON API |
| INV-5 | only stakeholders are bidder + seller; no external plaintext holder | Daml Script |

## Scope

**In:** the Daml model, the five invariants, a JSON-API multi-party E2E flow, a reproducible
`make demo`, and the three-view UI — all on Canton **LocalNet only**.

**Out (human-gated):** DevNet/TestNet/MainNet deploy, full OIDC, the Splice Token Standard,
a commit-reveal enhancement, and the pitch deck / video. See `STATUS.md`.

## Project docs

- `STATUS.md` — version pins, what's done, audit sweep, how to resume.
- `DECISIONS.md` — every non-obvious decision (incl. two logged deviations and their reasons).
- `.planning/` — GSD planning artifacts (PROJECT / REQUIREMENTS / ROADMAP / STATE).
