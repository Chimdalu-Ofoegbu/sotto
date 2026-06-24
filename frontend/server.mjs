// Sotto three-view demo server (zero-dependency Node).
//
// Why not Next.js (handoff-locked)? A Next.js install on the WSL /mnt/c mount is
// prohibitively slow, and the handoff states the side-by-side multi-party view "is
// the product, not the design" and that a thin UI is acceptable. This delivers the
// identical demo-legibility outcome — three PARTY-SCOPED ledger views proving the
// privacy contrast — with no build step. Logged in DECISIONS.md (D-010).
//
// Runs in WSL next to the sandbox: server-side calls hit 127.0.0.1:7575 directly;
// the browser (on Windows) reaches this server via localhost:3000 (0.0.0.0 bind).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as L from '../backend/ledger.mjs';

const PORT = process.env.PORT || 3000;
const INDEX = fileURLToPath(new URL('./index.html', import.meta.url));
let sc = null; // current scenario

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { r(d ? JSON.parse(d) : {}); } catch { r({}); } }); });

async function setup() {
  const s = Date.now().toString().slice(-5);
  const bank = await L.allocateParty('Bank' + s);
  const seller = await L.allocateParty('Seller' + s);
  const bidderA = await L.allocateParty('BidderA' + s);
  const bidderB = await L.allocateParty('BidderB' + s);
  const assetCid = await L.create(bank, 'Holding', { issuer: bank, owner: seller, instrument: 'ASSET', quantity: '1000.0' });
  const deadlineMs = Date.now() + 45000;
  const deadline = new Date(deadlineMs).toISOString();
  const auctionCid = await L.create(seller, 'Auction', {
    seller, invitedBidders: [bidderA, bidderB],
    assetDescription: 'Acme Corp 1,000-unit block', assetQuantity: '1000.0', reserve: '500.0', deadline,
  });
  const invA = await L.create(seller, 'BidInvitation', { seller, bidder: bidderA, deadline });
  const invB = await L.create(seller, 'BidInvitation', { seller, bidder: bidderB, deadline });
  sc = { bank, seller, bidderA, bidderB, assetCid, auctionCid, invA, invB, deadline, deadlineMs, cleared: false, winner: null };
  return meta();
}

function meta() {
  if (!sc) return { ready: false };
  return {
    ready: true, deadline: sc.deadline, deadlineMs: sc.deadlineMs, cleared: sc.cleared, winner: sc.winner,
    labels: { [sc.seller]: 'Seller', [sc.bidderA]: 'Bidder A', [sc.bidderB]: 'Bidder B', [sc.bank]: 'Bank' },
    parties: { seller: sc.seller, bidderA: sc.bidderA, bidderB: sc.bidderB },
  };
}

async function placeBid(which, amount) {
  if (!sc) throw new Error('Set up the auction first');
  const bidder = which === 'A' ? sc.bidderA : sc.bidderB;
  const inv = which === 'A' ? sc.invA : sc.invB;
  const q = String(amount);
  const cashCid = await L.create(sc.bank, 'Holding', { issuer: sc.bank, owner: bidder, instrument: 'CASH', quantity: q });
  await L.exercise(bidder, 'BidInvitation', inv, 'PlaceSealedBid', { amount: q, cashCid });
}

async function clear() {
  if (!sc) throw new Error('Set up the auction first');
  if (Date.now() < sc.deadlineMs) throw new Error('Auction has not reached its deadline yet');
  const allBids = await L.activeContracts(sc.seller, 'SealedBid');
  await L.exercise(sc.seller, 'Auction', sc.auctionCid, 'Clear', { assetCid: sc.assetCid, bids: allBids.map((b) => b.contractId) });
  sc.cleared = true;
  // Determine winner: whoever now owns the ASSET block.
  for (const [which, p] of [['A', sc.bidderA], ['B', sc.bidderB]]) {
    const h = await L.activeContracts(p, 'Holding');
    if (h.some((x) => x.payload.instrument === 'ASSET' && x.payload.owner === p)) sc.winner = which;
  }
  return meta();
}

async function view(which) {
  if (!sc) return { bids: [], holdings: [], escrows: [], auctions: [] };
  const party = which === 'seller' ? sc.seller : which === 'A' ? sc.bidderA : sc.bidderB;
  const [bids, holdings, escrows, auctions] = await Promise.all([
    L.activeContracts(party, 'SealedBid'), L.activeContracts(party, 'Holding'),
    L.activeContracts(party, 'Escrow'), L.activeContracts(party, 'Auction'),
  ]);
  return { bids, holdings, escrows, auctions };
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(readFileSync(INDEX)); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/meta') return send(res, 200, meta());
    if (req.method === 'GET' && url.pathname === '/api/view') return send(res, 200, await view(url.searchParams.get('party')));
    if (req.method === 'POST' && url.pathname === '/api/setup') return send(res, 200, await setup());
    if (req.method === 'POST' && url.pathname === '/api/bid') { const b = await readBody(req); await placeBid(b.which, b.amount); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && url.pathname === '/api/clear') return send(res, 200, await clear());
    res.writeHead(404); res.end('not found');
  } catch (e) { send(res, 400, { error: String(e.message || e) }); }
}).listen(PORT, '0.0.0.0', () => console.log(`Sotto UI on http://localhost:${PORT} (0.0.0.0:${PORT})`));
