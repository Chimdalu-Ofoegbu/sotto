// Sotto UI server (zero-dep) — now LIVE on Canton.
//
// Serves the Claude Design UI and drives the real flow through the JSON Ledger API
// (via ../backend/ledger.mjs). The three POV views are computed from genuine
// PARTY-SCOPED ledger reads, so the privacy contrast the UI shows is protocol-
// enforced by Canton, not simulated. Runs in WSL next to the sandbox (server-side
// calls hit 127.0.0.1:7575); the browser reaches this server on 0.0.0.0:3000.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as L from '../backend/ledger.mjs';

const PORT = process.env.PORT || 3000;
const DIR = (f) => fileURLToPath(new URL('./' + f, import.meta.url));
const ASSET_FACE = 25000000, RESERVE = 24600000;
// Scenario bid book (matches the design's numbers).
const BOOK = {
  normal:   { A: 24812500, B: 24790000 },
  single:   { A: 24812500, B: null },
  tie:      { A: 24800000, B: 24800000 },
  rollback: { A: 24812500, B: 24790000, shortBidder: 'A', shortEscrow: 24650000 },
};
let sc = null; // live scenario state

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { r(d ? JSON.parse(d) : {}); } catch { r({}); } }); });
const hhmmss = () => new Date().toISOString().slice(11, 19);
const idOf = (party) => sc && party === sc.bidderA ? 'A' : (sc && party === sc.bidderB ? 'B' : null);

async function publish(windowMs = 45000) {
  const s = Date.now().toString().slice(-5);
  const bank = await L.allocateParty('Bank' + s);
  const seller = await L.allocateParty('Acme' + s);
  const bidderA = await L.allocateParty('Meridian' + s);
  const bidderB = await L.allocateParty('Halcyon' + s);
  const assetCid = await L.create(bank, 'Holding', { issuer: bank, owner: seller, instrument: 'ASSET', quantity: String(ASSET_FACE) });
  const deadlineMs = Date.now() + windowMs;
  const deadline = new Date(deadlineMs).toISOString();
  const auctionCid = await L.create(seller, 'Auction', {
    seller, invitedBidders: [bidderA, bidderB],
    assetDescription: 'U.S. Treasury Bill · 26-week', assetQuantity: String(ASSET_FACE), reserve: String(RESERVE), deadline,
  });
  const invA = await L.create(seller, 'BidInvitation', { seller, bidder: bidderA, deadline });
  const invB = await L.create(seller, 'BidInvitation', { seller, bidder: bidderB, deadline });
  sc = { bank, seller, bidderA, bidderB, assetCid, auctionCid, invA, invB, deadlineMs, cleared: false, rollback: false, winnerId: null, times: {}, bidAmt: {} };
  return sc;
}

async function placeBid(which, amount) {
  if (!sc) throw new Error('No auction — publish first');
  if (Date.now() >= sc.deadlineMs) throw new Error('Bidding window has closed');
  const bidder = which === 'A' ? sc.bidderA : sc.bidderB;
  const inv = which === 'A' ? sc.invA : sc.invB;
  const q = String(amount);
  const cashCid = await L.create(sc.bank, 'Holding', { issuer: sc.bank, owner: bidder, instrument: 'CASH', quantity: q });
  await L.exercise(bidder, 'BidInvitation', inv, 'PlaceSealedBid', { amount: q, cashCid });
  sc.times[which] = hhmmss(); sc.bidAmt[which] = Number(amount);
}

// Underfunded bid (short-escrow scenario): build SealedBid + Escrow directly so the
// locked cash is less than the bid. Clearing to it will roll the whole tx back (INV-2).
async function placeShortBid(which, amount, escrowAmount) {
  const bidder = which === 'A' ? sc.bidderA : sc.bidderB;
  // Bank issues the (insufficient) locked cash directly to the clearing party so we get a
  // valid cid the Escrow can reference; the locked amount is deliberately < the bid amount,
  // so clearing to this bid will fail Settle's check and roll the whole transaction back.
  const lockedCash = await L.create(sc.bank, 'Holding', { issuer: sc.bank, owner: sc.seller, instrument: 'CASH', quantity: String(escrowAmount) });
  const esc = await L.create(bidder, 'Escrow', { bidder, clearingParty: sc.seller, cashIssuer: sc.bank, amount: String(amount), lockedCash, auctionDeadline: new Date(sc.deadlineMs).toISOString() });
  await L.create(bidder, 'SealedBid', { bidder, seller: sc.seller, amount: String(amount), escrow: esc, auctionDeadline: new Date(sc.deadlineMs).toISOString() });
  sc.times[which] = hhmmss(); sc.bidAmt[which] = Number(amount);
}

async function stageScenario(name) {
  const book = BOOK[name] || BOOK.normal;
  await publish(8000); // short window — bids are placed instantly server-side
  if (name === 'rollback') {
    await placeBid('B', book.B);
    await placeShortBid('A', book.A, book.shortEscrow);
  } else {
    if (book.A) await placeBid('A', book.A);
    if (book.B) await placeBid('B', book.B);
  }
  sc.scenarioName = name;
  return sc;
}

async function clear() {
  if (!sc) throw new Error('No auction');
  if (Date.now() < sc.deadlineMs) throw new Error('Auction deadline not reached');
  if (sc.cleared) return sc;
  const allBids = await L.activeContracts(sc.seller, 'SealedBid');
  try {
    await L.exercise(sc.seller, 'Auction', sc.auctionCid, 'Clear', { assetCid: sc.assetCid, bids: allBids.map((b) => b.contractId) });
    sc.cleared = true; sc.rollback = false;
    for (const which of ['A', 'B']) {
      const p = which === 'A' ? sc.bidderA : sc.bidderB;
      const h = await L.activeContracts(p, 'Holding');
      if (h.some((x) => x.payload.instrument === 'ASSET' && x.payload.owner === p)) sc.winnerId = which;
    }
  } catch (e) {
    sc.cleared = true; sc.rollback = true; // atomic: nothing moved
  }
  return sc;
}

// ---- per-POV view-model, computed ONLY from this party's own scoped reads ----
// This is where UI-layer privacy is enforced: a bidder's response is built solely
// from contracts that bidder is a stakeholder of, so it cannot contain the other
// bidder's bid, nor (for a loser) the winner's identity or the cleared price.
async function viewModel(as) {
  if (!sc) return { ready: true, phase: 'draft' };
  const party = as === 'seller' ? sc.seller : as === 'A' ? sc.bidderA : sc.bidderB;
  const passed = Date.now() >= sc.deadlineMs;
  const [sb, esc, hold] = await Promise.all([
    L.activeContracts(party, 'SealedBid'), L.activeContracts(party, 'Escrow'), L.activeContracts(party, 'Holding'),
  ]);
  const escById = {}; for (const e of esc) { const id = idOf(e.payload.bidder); if (id) escById[id] = e.payload; }
  const seen = { A: null, B: null };
  for (const b of sb) {
    const id = idOf(b.payload.bidder); if (!id) continue;
    let escrowVal = escById[id] ? Number(escById[id].amount) : Number(b.payload.amount);
    // Only the seller owns the locked cash, so only the seller can detect a short escrow.
    if (as === 'seller' && escById[id]) { const lc = hold.find((x) => x.contractId === escById[id].lockedCash); if (lc) escrowVal = Number(lc.payload.quantity); }
    seen[id] = { amount: Number(b.payload.amount), escrow: escrowVal, t: sc.times[id] || '' };
  }
  const phase = sc.cleared ? (sc.rollback ? 'rollback' : 'settled') : (passed ? 'locked' : 'open');
  const ownsAsset = hold.some((x) => x.payload.instrument === 'ASSET' && x.payload.owner === party);
  const vm = {
    ready: true, phase, deadlineMs: sc.deadlineMs, cleared: sc.cleared, rollback: sc.rollback,
    bids: seen, respCount: (seen.A ? 1 : 0) + (seen.B ? 1 : 0),
    names: { seller: 'Acme Treasury', A: 'Meridian Capital', B: 'Halcyon Asset Mgmt' },
  };
  if (as === 'seller') {
    vm.winnerId = sc.cleared && !sc.rollback ? sc.winnerId : null;
    vm.winnerAmount = vm.winnerId && sc.bidAmt[vm.winnerId] != null ? sc.bidAmt[vm.winnerId] : null;
  } else {
    // Bidder need-to-know only: their own bid amount (their data), and win/lose from
    // whether THEY now hold the asset. Never the other bid, winner id, or cleared price.
    vm.bidPlaced = sc.bidAmt[as] != null;
    vm.myBidAmount = vm.bidPlaced ? sc.bidAmt[as] : null;
    vm.myIsWinner = sc.cleared && !sc.rollback && ownsAsset;
    vm.myIsLoser = sc.cleared && !sc.rollback && vm.bidPlaced && !ownsAsset;
  }
  return vm;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(readFileSync(DIR('index.html'))); return; }
    if (req.method === 'GET' && /^\/[\w.-]+\.(js|css|svg|png)$/.test(url.pathname)) {
      const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      try { res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }); res.end(readFileSync(DIR(url.pathname.slice(1)))); } catch { res.writeHead(404); res.end('nf'); }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, await viewModel(url.searchParams.get('as') || 'seller'));
    if (req.method === 'POST' && url.pathname === '/api/publish') { await publish(); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && url.pathname === '/api/bid') { const b = await readBody(req); await placeBid(b.which, b.amount); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && url.pathname === '/api/clear') { await clear(); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && url.pathname === '/api/scenario') { const b = await readBody(req); await stageScenario(b.name); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && url.pathname === '/api/reset') { sc = null; return send(res, 200, { ok: true }); }
    res.writeHead(404); res.end('not found');
  } catch (e) { send(res, 400, { error: String(e.message || e) }); }
}).listen(PORT, '0.0.0.0', () => console.log(`Sotto UI (LIVE on Canton) on http://localhost:${PORT}`));
