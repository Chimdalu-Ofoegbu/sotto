# Sotto — timed demo script (~3 minutes)

Pre-roll (before recording): toolchain installed, then
```bash
make start        # sandbox up on :7575  (or: bash scripts/sandbox.sh)
node frontend/server.mjs   # UI on http://localhost:3000
```

| Time | Show | Say |
|------|------|-----|
| 0:00–0:20 | Title slide / README top | "Sotto runs private sealed-bid OTC block trades on Canton. No trusted auctioneer, no ZK circuit — bidder-vs-bidder privacy is enforced by the protocol, and settlement is atomic." |
| 0:20–0:45 | Terminal: `cd daml && dpm test` | "Five invariants in Daml Script. The hard gate, `testInv1Privacy`, queries the ledger **as bidder B** and proves B cannot see A's bid. All green." |
| 0:45–1:40 | Browser `localhost:3000` → **Set up auction**, then submit **Bidder A = 800** | "Three columns — each is a *party-scoped* view of the same ledger. Watch A's column and the Seller's column show A's sealed bid… and **Bidder B's column stays empty**. B cannot see that A even bid. That absence is the whole product." |
| 1:40–2:05 | Submit **Bidder B = 950**; point at each column | "Now B bids. B sees only its own bid; A still sees only its own; the Seller — the clearing party — sees both, which is inherent and honest." |
| 2:05–2:35 | Wait for the deadline, click **Clear auction** | "One transaction: the asset block goes to the winner B, the 950 cash goes to the seller, and the loser A's escrow is refunded — atomically. A's column shows the refund but **never the 950 winning price**." |
| 2:35–2:55 | Terminal: `bash scripts/demo.sh` (tail) | "And the same privacy + atomicity hold through the JSON Ledger API with party-scoped reads — eleven assertions, green. Verify it yourself with these two commands." |
| 2:55–3:00 | README "Verify the claims" | "Rock-solid model, protocol-enforced privacy, atomic DvP. That's Sotto." |

**Reset between takes:** click **Reset auction** in the UI (allocates fresh parties); the run
is deterministic (asset 1000, reserve 500, A=800 loses, B=950 wins).
