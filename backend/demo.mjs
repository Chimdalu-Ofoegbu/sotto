// Sotto end-to-end demo + integration test, driven entirely through the JSON
// Ledger API v2 with PARTY-SCOPED reads. Re-asserts INV-1 (privacy) and INV-2
// (atomic DvP) at the API layer — not just in Daml Script.
//
// Deterministic scenario: asset block 1,000 units, reserve 500; Bidder A bids
// 800 (loses), Bidder B bids 950 (wins). Run: `node backend/demo.mjs`.
import * as L from './ledger.mjs';
import { writeFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
  passed++;
  log('   ✓ ' + msg);
}
const qty = (h) => Number(h.payload.quantity);

(async () => {
  log('═'.repeat(64));
  log(' Sotto — sealed-bid OTC clearing over the JSON Ledger API (party-scoped)');
  log('═'.repeat(64));

  // 1) Parties (unique per run so the demo is re-runnable on a live sandbox).
  const s = Date.now().toString().slice(-6);
  const bank = await L.allocateParty('Bank' + s);
  const seller = await L.allocateParty('Seller' + s);
  const bidderA = await L.allocateParty('BidderA' + s);
  const bidderB = await L.allocateParty('BidderB' + s);
  log('\n[1] Parties onboarded on the LocalNet participant:');
  log('    seller  =', seller);
  log('    bidderA =', bidderA);
  log('    bidderB =', bidderB);

  // 2) Issuance: asset block to seller; cash to each bidder.
  log('\n[2] Issuing on-ledger holdings (real DvP legs)...');
  const assetCid = await L.create(bank, 'Holding', { issuer: bank, owner: seller, instrument: 'ASSET', quantity: '1000.0' });
  const cashA = await L.create(bank, 'Holding', { issuer: bank, owner: bidderA, instrument: 'CASH', quantity: '800.0' });
  const cashB = await L.create(bank, 'Holding', { issuer: bank, owner: bidderB, instrument: 'CASH', quantity: '950.0' });
  log('    asset block (1000) -> seller; cash 800 -> A, 950 -> B');

  // 3) Auction + private per-bidder invitations.
  const deadline = new Date(Date.now() + 12000).toISOString();
  log('\n[3] Seller lists the auction (reserve 500, deadline ~12s out)...');
  const auctionCid = await L.create(seller, 'Auction', {
    seller, invitedBidders: [bidderA, bidderB],
    assetDescription: 'Acme Corp 1,000-unit block', assetQuantity: '1000.0',
    reserve: '500.0', deadline,
  });
  const invA = await L.create(seller, 'BidInvitation', { seller, bidder: bidderA, auctionCid });
  const invB = await L.create(seller, 'BidInvitation', { seller, bidder: bidderB, auctionCid });

  // 4) Sealed bids (each escrows its cash atomically).
  log('\n[4] Bidders submit sealed bids (A=800, B=950)...');
  await L.exercise(bidderA, 'BidInvitation', invA, 'PlaceSealedBid', { amount: '800.0', cashCid: cashA });
  await L.exercise(bidderB, 'BidInvitation', invB, 'PlaceSealedBid', { amount: '950.0', cashCid: cashB });

  // 5) INV-1 (HARD GATE) at the API layer, party-scoped.
  log('\n[5] INV-1 — bidder-vs-bidder confidentiality (party-scoped JSON queries):');
  const bBids = await L.activeContracts(bidderB, 'SealedBid');
  assert(bBids.length === 1, "B's scoped query returns exactly its own 1 bid");
  assert(bBids.every((c) => c.payload.bidder === bidderB), "B's view contains NO SealedBid created by A");
  const bEsc = await L.activeContracts(bidderB, 'EscrowedCash');
  assert(bEsc.every((c) => c.payload.bidder === bidderB), "B's view contains NO EscrowedCash created by A");
  const aBids = await L.activeContracts(bidderA, 'SealedBid');
  assert(aBids.every((c) => c.payload.bidder === bidderA), "A's view contains NO SealedBid created by B");
  // No bid amount of the other party appears anywhere in B's scoped view.
  const bAll = await L.activeContracts(bidderB);
  assert(!JSON.stringify(bAll).includes('"800.0'), "B never sees A's bid amount (800)");

  // 6) Wait for the (ledger-time) deadline, then clear.
  log('\n[6] Waiting for the auction deadline...');
  await sleep(13000);

  log('\n[7] Seller clears to the best qualifying bid (single atomic transaction)...');
  const allBids = await L.activeContracts(seller, 'SealedBid'); // seller sees all (it is observer)
  assert(allBids.length === 2, 'seller (clearing party) sees BOTH bids');
  const clearTx = await L.exercise(seller, 'Auction', auctionCid, 'Clear', {
    assetCid, bids: allBids.map((c) => c.contractId),
  });

  // 8) INV-2 atomic DvP, verified party-scoped.
  log('\n[8] INV-2 — atomic delivery-vs-payment (party-scoped JSON queries):');
  const bHold = await L.activeContracts(bidderB, 'Holding');
  assert(bHold.some((h) => h.payload.instrument === 'ASSET' && qty(h) === 1000 && h.payload.owner === bidderB),
    'winner B received the 1,000-unit asset block');
  const sHold = await L.activeContracts(seller, 'Holding');
  assert(sHold.some((h) => h.payload.instrument === 'CASH' && qty(h) === 950 && h.payload.owner === seller),
    'seller received the 950 winning cash');
  const aHold = await L.activeContracts(bidderA, 'Holding');
  assert(aHold.some((h) => h.payload.instrument === 'CASH' && qty(h) === 800 && h.payload.owner === bidderA),
    'loser A had its 800 escrow refunded');

  // 9) INV-4 loser confidentiality.
  log('\n[9] INV-4 — loser confidentiality:');
  const aBidsAfter = await L.activeContracts(bidderA, 'SealedBid');
  assert(aBidsAfter.length === 0, 'loser A sees no bids post-clear (never learns the 950 winning price)');
  const aAll = await L.activeContracts(bidderA);
  assert(!JSON.stringify(aAll).includes('"950.0'), "loser A's view never contains the winning amount (950)");

  // Persist party ids for the frontend to consume.
  writeFileSync(new URL('./parties.json', import.meta.url),
    JSON.stringify({ bank, seller, bidderA, bidderB, auctionCid }, null, 2));

  log('\n' + '═'.repeat(64));
  log(` ALL ${passed} API-LAYER ASSERTIONS PASSED — INV-1, INV-2, INV-4 hold over JSON API`);
  log('═'.repeat(64));
})().catch((e) => { console.error('\nDEMO FAILED:', e.message); process.exit(1); });
