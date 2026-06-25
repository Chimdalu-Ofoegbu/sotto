# Sotto — Security Audit

_Date: 2026-06-25 · Scope: full repository at the published commit._
_Method: manual code review of the Daml model, the JSON-Ledger-API client, the network-exposed
UI server, the build/run scripts, and git/secret hygiene; cross-checked against the Daml Script
invariant suite (`make test`) and the live party-scoped API run (`bash scripts/demo.sh`)._

## Remediation & re-audit (2026-06-25)

All findings below were remediated and re-verified. The Daml fixes are proven by named
Daml Script tests (**16/16 pass**, incl. 6 new security regression tests); the server fixes
were verified live. The re-audit also found one *new* issue introduced by a fix (SEC-11) and
fixed it.

| Finding | Status | Fix & evidence |
|---------|--------|----------------|
| SEC-01 escrow custody | **Fixed** | `EscrowedCash` (issuer+bidder-signed) requires **both** bidder and clearing party to `Release` — neither can move it alone. `testSecEscrowLockNoDrain` |
| SEC-02 unauth UI API | **Fixed** | `/api/*` require a per-run token (`?token=` / `x-sotto-token`); no token ⇒ 401. Verified live |
| SEC-03 bid↔auction binding | **Fixed** | `SealedBid`/`EscrowedCash` carry `auctionCid`; `Clear` asserts each bid is for this auction. `testSecBidBoundToAuction` |
| SEC-04 escrow reclaim | **Fixed** | `EscrowedCash.Reclaim` by the bidder after the clearing window. `testSecReclaimAfterGrace` |
| SEC-05 withdraw orphan | **Fixed** | Bids are **binding** (no withdrawal — standard for sealed bids); reclaim after the window. `testSecClearWindowClosed` |
| SEC-06 asset validation | **Fixed** | `Clear` asserts the delivered asset matches the advertised instrument+quantity+owner. `testSecAssetValidated` |
| SEC-07 tie-break | **Fixed** | `SealedBid.submittedAt`; `Clear` breaks ties by earliest submission. `testSecTieBreakEarliest` |
| SEC-08 deadline binding | **Fixed** | `BidInvitation` carries `auctionCid`; `PlaceSealedBid` uses the auction's own deadline |
| SEC-09 static-file exposure | **Fixed** | Explicit allow-list (`/` + `/screens.js` only) — no arbitrary file reads |
| SEC-10 supply chain | **Mitigated** | dpm version pinned (was "latest"); archives integrity-checked pre-extract; provider-signature pinning documented for production |
| **SEC-11 orphaned-escrow DoS** *(found in re-audit)* | **Fixed** | The SEC-05 fix (`CancelByBidder`) could orphan a `SealedBid` from its escrow → a later `Clear` would roll back (griefing). Resolved by binding bids + **mutually-exclusive** clear `(deadline, deadline+grace]` and reclaim `> deadline+grace` windows, so an escrow can never be both reclaimed and cleared. `testSecClearWindowClosed` |

**Residual / accepted (documented):**
- *Malformed/underfunded bid:* an underfunded **winning** bid still rolls the clear back (handoff INV-2), so a griefer can force the clearing party to re-clear excluding bad bids. The clearing party validates its `Clear` inputs. **Low**, inherent to operator-driven clearing.
- *Issuer visibility:* the cash/asset issuer (bank) inherently sees token amounts (issuer-signed `Holding` model, handoff-locked). It never sees a `SealedBid`, so **bidder-vs-bidder privacy is unaffected**. Info.
- *LocalNet dev auth* (no JWT/OIDC) — handoff-scoped out of this session.

**Verdict:** no open critical/high findings; the core claims (bidder-vs-bidder privacy, atomic
DvP) remain proven, and funds-safety + integrity are now enforced by the model. The sections
below are the original (pre-fix) analysis, retained for traceability.

## Trust model (read this first)

Sotto is a **Canton LocalNet demo** whose claim is precise: **bidder-vs-bidder confidentiality
(protocol-enforced) and atomic DvP, with no external auctioneer and no ZK circuit.** Both of
those hold and are proven (see *Verified secure*). The clearing party is, by design and by the
handoff's stated honest boundary, a **trusted auction operator** — it sees the bids it clears.

Findings below are graded twice where it matters: **Production** (what a real OTC venue must
fix) vs **Demo** (impact on this LocalNet submission's actual claims). Several "High/Medium"
items are *accepted, disclosed limitations* of the demo trust model, **not** breaks of the core
privacy/atomicity claims.

## Summary

| ID | Severity (prod / demo) | Area | Finding |
|----|------------------------|------|---------|
| SEC-01 | **High** / Accepted | Daml model | Escrowed cash is a `Holding` owned by the clearing party — it can move/drain it; the "lock" is nominal |
| SEC-02 | Medium / Accepted | UI server | Unauthenticated, `0.0.0.0`-bound, omniscient presenter — any caller can request any POV and drive/reset the auction |
| SEC-03 | Medium / Low | Daml model | `SealedBid`/`Escrow` not bound to a specific `Auction`; `Clear` takes arbitrary bid/asset cids |
| SEC-04 | Medium / Low | Daml model | No escrow-reclaim path if the clearing party never clears (funds locked indefinitely) |
| SEC-05 | Medium / Low | Daml model | `Withdraw` orphans the escrow (bidder loses the bid but can't refund the cash) |
| SEC-06 | Low | Daml model | `Clear` doesn't validate the delivered asset against the auction's advertised quantity |
| SEC-07 | Low | Model/UI | Tie-break is seller-controlled (input order), not "earliest submission" as the UI states |
| SEC-08 | Low | Daml model | `BidInvitation.deadline` is independent of `Auction.deadline` (unequal windows possible) |
| SEC-09 | Low | UI server | Static route serves any `*.js` in `frontend/` (e.g. `/server.mjs` source disclosure) |
| SEC-10 | Low | Supply chain | `install-toolchain.sh` fetches JDK/dpm over HTTPS without checksum/signature pinning |

No **Critical** findings. No secrets in the tree; commit history attribution-clean.

---

## Findings

### SEC-01 · Escrow is custodied by the clearing party (High / Accepted)
**Where:** `daml/daml/Sotto.daml` — `PlaceSealedBid` transfers the bid cash to the seller
(`:138`), the escrowed cash is therefore a `Holding { owner = seller }` (`:168`), and
`Holding.Transfer` is `controller owner` (`:35-37`).
**Issue:** the `Escrow` contract only *references* the locked cash; it does not prevent the
owner (the clearing party) from transferring it. A malicious clearing party can move/drain all
escrowed cash before clearing and simply never clear — bidders have no recourse. (If the seller
both drains *and* clears, `Settle`/`Refund` fail on the archived cid and the whole `Clear` rolls
back — so theft-with-settlement is impossible — but theft-without-settlement is not.)
**Demo impact:** none on the core claims (privacy + atomic DvP still hold); the seller is the
trusted operator. **Production impact:** funds-safety hole.
**Fix:** replace transfer-to-seller with a true lock the clearing party cannot unilaterally
move — e.g. a `LockedHolding` signed by *both* bidder and seller, or hold the value inside
`Escrow` and re-issue via the cash issuer's authority at `Settle`/`Refund` (Daml Finance's
holding+lock pattern). This also resolves SEC-04 and SEC-05.

### SEC-02 · UI server is an unauthenticated omniscient presenter (Medium / Accepted)
**Where:** `frontend/server.mjs:157` (`/api/state?as=…` returns whatever POV is asked for) and
`:165` (`listen(PORT, '0.0.0.0')`).
**Issue:** the server holds all party identities (sandbox auth is disabled) and does **not**
authenticate callers. Anyone who can reach `host:3000` can request `?as=seller` (which sees both
bids + winner + price), place bids, clear, or `POST /api/reset`. The per-POV privacy in the UI
is therefore a *presentation* convenience at this layer — it is **not** enforced against a direct
API caller. The **real** privacy guarantee lives at the ledger and is proven independently
(`dpm test`, party-scoped JSON queries); `viewModel()` is correctly scoped per POV (`:110-145`).
**Why `0.0.0.0`:** required so the Windows browser can reach the WSL server; the sandbox itself
binds loopback only.
**Fix (production):** authenticate each browser as its own party (JWT/OIDC) and have the server
serve only that party's POV; or bind `127.0.0.1` and front it with an authenticating proxy.

### SEC-03 · Bids/escrow not bound to the auction (Medium / Low)
**Where:** `Sotto.daml` — `SealedBid` has no auction reference (`:195-201`); `Clear` accepts an
arbitrary `bids : [ContractId SealedBid]` and `assetCid` (`:63-66`).
**Issue:** nothing in the model enforces that the cleared bids/asset belong to *this* auction or
match its advertised terms. A seller with multiple auctions could cross-wire bids; a bidder
cannot verify their bid is cleared against the intended auction.
**Fix:** add `auctionCid` (or a contract key) to `BidInvitation`/`SealedBid`/`Escrow` and assert
in `Clear` that every consumed bid references this `Auction`.

### SEC-04 · No escrow reclaim if the seller never clears (Medium / Low)
**Where:** `Sotto.daml` — `Escrow.Refund` is `controller clearingParty` only (`:186-188`).
**Issue:** if the clearing party abandons the auction, bidders cannot recover their escrowed
cash. **Fix:** add a bidder-exercisable `Reclaim` after `deadline + grace`.

### SEC-05 · `Withdraw` orphans the escrow (Medium / Low)
**Where:** `Sotto.daml` — `SealedBid.Withdraw` (`:217-222`) is consuming, `controller bidder`,
and returns the escrow cid but performs no refund; `Refund` needs the clearing party. So a
bidder who withdraws loses the bid yet cannot recover the cash, and `Clear` won't refund a bid
no longer in its list. **Fix:** couple withdrawal with a bidder-authorized escrow release (ties
to SEC-01's lock redesign).

### SEC-06 · Delivered asset not validated against terms (Low)
`Clear` transfers `assetCid` to the winner (`:89`) without checking it matches the auction's
`assetQuantity`/issuer. The seller could under-deliver. **Fix:** fetch `assetCid` and assert it
matches the advertised terms.

### SEC-07 · Tie-break is seller-controlled (Low)
`Clear` ranks by amount and breaks ties by `sortOn` stability over the seller-supplied list
order (`:83-84`); there is no submission timestamp in `SealedBid`. The UI copy claims "earliest
sealed submission clears," which the model does not enforce. **Fix:** record a submission time
and tie-break on it, or correct the UI copy.

### SEC-08 · Invitation/auction deadline divergence (Low)
`PlaceSealedBid` checks `BidInvitation.deadline` (`:130`) while `Clear` checks
`Auction.deadline` (`:70`); the seller sets them independently, enabling unequal windows.
**Fix:** derive the invitation deadline from the auction (or reference the auction).

### SEC-09 · Static-file route exposes `frontend/` JS (Low)
`server.mjs:151-154` serves any `[\w.-]+\.(js|css|svg|png)` in `frontend/` — including
`/server.mjs` (source disclosure; harmless here as the repo is public). Path traversal is
**not** possible (the regex excludes `/` and `\`). **Fix:** allow-list `index.html` + `screens.js`.

### SEC-10 · Toolchain downloads not integrity-pinned (Low)
`scripts/install-toolchain.sh` downloads the Temurin JDK and `dpm` over HTTPS and runs them with
no SHA-256/signature verification. HTTPS gives transport security but not artifact integrity.
**Fix:** pin and verify published checksums before extracting/executing.

---

## Verified secure (the core claims hold)

| Guarantee | Evidence |
|-----------|----------|
| **INV-1 — bidder-vs-bidder privacy** | `SealedBid` signatory = bidder, observer = seller **only** (`Sotto.daml:203-204`); per-bidder `BidInvitation` hides even the act of bidding (`:111-118`). Proven by `testInv1Privacy` (party-scoped Daml Script) **and** the party-scoped JSON-API run; the loser's live API response carries no winner id/price/other-bid. |
| **INV-2 — atomic DvP** | `Clear` is a single transaction; `Settle` fetch+asserts the locked cash (`:177-183`) so a bad escrow rolls the whole clear back. Proven by `testInv2AtomicDvp` + `testInv2RollbackOnInsufficientEscrow` and the live short-escrow rollback. |
| **INV-3 — authorization** | `Clear`/`AcceptWin`/`Reject`/`Settle`/`Refund` are clearing-party-controlled; `Withdraw` is bidder-only with a ledger-time deadline. Proven by `testInv3Authorization`/`testInv3NoLateChanges`. |
| **INV-5 — no external plaintext holder** | Only stakeholders on any `SealedBid` are its bidder + the seller; the issuer/bank cannot see bids. Proven by `testInv5NoExternalHolder`. |
| Client reads are party-scoped | `ledger.mjs` queries one party at a time; template refs are code constants (no injection). |
| Repo hygiene | No secrets tracked (scanned); `.gitignore` covers secrets; commit history has zero AI attribution; `sdk-version` pinned (3.5.1). |

## Remediation priority

1. **Funds safety (prod):** real escrow lock → fixes SEC-01, SEC-04, SEC-05.
2. **Integrity (prod):** bind bids/asset to the auction → SEC-03, SEC-06.
3. **Demo hardening:** per-party auth or loopback+proxy on the UI server; allow-list static files → SEC-02, SEC-09.
4. **Supply chain:** pin download checksums → SEC-10.

None of the above block the submission's stated claims; SEC-01/02 are disclosed limitations of
the LocalNet demo trust model and the path to production-grade is documented above.
