/* ============================================================================
   SOTTO — working demo app, WIRED TO THE LIVE CANTON LEDGER.
   This file replaces the original front-end-only simulation. Every state shown
   here comes from a PARTY-SCOPED read of the real ledger via the Sotto backend
   (/api/state?as=…). The privacy contrast is therefore protocol-enforced, not
   faked in the view layer: a bidder's POV literally never receives a rival's
   value because the ledger never hands it over.

   Backend contract (see ../backend/ledger.mjs + ../frontend/server.mjs):
     GET  /api/state?as=seller|A|B   -> party-scoped view-model
     POST /api/publish               -> seller lists a block (opens a ~75s window)
     POST /api/bid {which:'A'|'B',amount}
     POST /api/clear                 -> atomic clear+settle (only after deadline)
     POST /api/scenario {name}       -> stages a deterministic scenario
     POST /api/reset
   All /api/* calls require the per-run token (?token=… / x-sotto-token header).
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- parties: UI key <-> backend key ---------- */
  var PARTIES = {
    seller:   { name: "Acme Treasury",      role: "SELLER",   short: "ACME",     api: "seller" },
    meridian: { name: "Meridian Capital",   role: "BIDDER A", short: "MERIDIAN", api: "A" },
    halcyon:  { name: "Halcyon Asset Mgmt", role: "BIDDER B", short: "HALCYON",  api: "B" }
  };
  var BIDDERS = ["meridian", "halcyon"];
  var RESERVE = 24600000, FACE = 25000000;
  var SUGGESTED = { meridian: 24812500, halcyon: 24655000 }; // pre-filled bid amounts
  var STAGES = ["listed", "bidding", "sealed", "cleared", "settled"];
  var STAGE_LABEL = { listed: "LISTED", bidding: "BIDDING", sealed: "SEALED", cleared: "CLEARED", settled: "SETTLED" };

  /* ---------- token + api plumbing ---------- */
  var qs = new URLSearchParams(location.search);
  var TOKEN = qs.get("token") || readLS("sotto-token") || "";
  if (TOKEN) writeLS("sotto-token", TOKEN);
  function readLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function writeLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: { "Content-Type": "application/json", "x-sotto-token": TOKEN },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  /* ---------- client state ---------- */
  var ui = { party: "seller" };                 // whose POV the operator is viewing/acting as
  var vm = { ready: false, phase: "draft", bids: { A: null, B: null } }; // server-provided, party-scoped
  var clientPhase = null;                        // transient 'cleared' settling override
  var busy = false;                              // an action is in flight
  var settling = false;                          // the clear animation is playing (pause polling)
  var auto = { on: false, timers: [] };          // auto-run scenario
  var deadlineNudged = false;                    // one-shot refresh when the countdown hits 0
  var sellerBook = { A: null, B: null };         // amounts the seller saw at close (Clear consumes the bids)

  function apiOf(p) { return PARTIES[p].api; }
  function isBidder(p) { return BIDDERS.indexOf(p) !== -1; }
  function curPhase() { return clientPhase || (vm && vm.phase) || "draft"; }
  function bidsObj() { return (vm && vm.bids) || { A: null, B: null }; }
  function respCount() { var b = bidsObj(); return (b.A ? 1 : 0) + (b.B ? 1 : 0); }

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function usd(n) { return n == null ? "—" : "$" + Math.round(Number(n)).toLocaleString("en-US"); }
  function mmss(ms) {
    if (ms == null) return "—";
    var s = Math.max(0, Math.round(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function remainingMs() { return (vm && vm.deadlineMs) ? (vm.deadlineMs - Date.now()) : null; }

  /* ---------- fetch + act ---------- */
  function refresh() {
    var as = apiOf(ui.party);
    return api("GET", "/api/state?as=" + as).then(function (d) {
      if (d && !d.error) { vm = d; }
      render();
    }, function () { render(); });
  }
  function act(promise) {
    if (busy) return Promise.resolve();
    busy = true;
    return Promise.resolve(promise).then(function (r) {
      busy = false;
      if (r && r.error) toast(r.error);
      deadlineNudged = false;
      return refresh();
    }, function (e) { busy = false; toast(String(e && e.message || e)); return refresh(); });
  }

  /* ---------- actions ---------- */
  function publish() { act(api("POST", "/api/publish")); }
  function submitBidFromForm() {
    var el = $("#bidinput");
    var amount = el ? Number(String(el.value).replace(/[^0-9.]/g, "")) : 0;
    if (!amount || amount <= 0) { toast("Enter a valid bid amount."); return; }
    if (amount < RESERVE) toast("Below the " + usd(RESERVE) + " reserve — it won't clear, but it's recorded.");
    act(api("POST", "/api/bid", { which: apiOf(ui.party), amount: amount }));
  }
  function doClear() {
    if (busy || settling) return;
    if (curPhase() !== "locked") { toast("Clearing unlocks when the bidding deadline passes."); return; }
    // Optimistic settling animation, then the real atomic clear on the ledger.
    settling = true;
    clientPhase = "cleared";
    render();
    runSettleAnim();
    var hold = reduceMotion ? 250 : 2200;
    setTimeout(function () {
      clientPhase = null;
      busy = true;
      api("POST", "/api/clear").then(function (r) {
        busy = false; settling = false;
        if (r && r.error) toast(r.error);
        refresh().then(function () {
          if (curPhase() === "rollback") toast("Clear rolled back — escrow short. Nothing moved.");
          else toast("Settled atomically. Losing escrow returned in full.");
        });
      }, function (e) { busy = false; settling = false; toast(String(e)); refresh(); });
    }, hold);
  }
  function resetDemo() { clearAuto(); act(api("POST", "/api/reset")); }

  /* ---------- auto-run: stage a real two-bid scenario, narrate, clear ---------- */
  function step(delay, fn) { auto.timers.push(setTimeout(fn, delay)); }
  function clearAuto() { auto.timers.forEach(clearTimeout); auto.timers = []; auto.on = false; }
  function autoRun() {
    if (auto.on) return;
    clearAuto(); auto.on = true;
    toast("Auto-run: staging a two-bid auction on the ledger…");
    setParty("seller");
    api("POST", "/api/reset")
      .then(function () { return api("POST", "/api/scenario", { name: "normal" }); })
      .then(function (r) { if (r && r.error) throw new Error(r.error); return refresh(); })
      .then(function () {
        if (!auto.on) return;
        var end = (vm && vm.deadlineMs) || (Date.now() + 12000);
        var win = Math.max(3000, end - Date.now());
        step(Math.round(win * 0.06), function () { setParty("meridian"); toast("Meridian's sealed bid is in — visible only to Meridian and the seller."); });
        step(Math.round(win * 0.40), function () { setParty("halcyon"); toast("Now Halcyon. Notice Meridian's bid is nowhere on this screen — by protocol."); });
        step(Math.round(win * 0.74), function () { setParty("seller"); toast("Seller's view. Values stay sealed until the deadline closes."); });
        waitForLockedThenClear(end);
      })
      .catch(function (e) { auto.on = false; toast("Auto-run failed: " + (e && e.message || e)); });
  }
  function waitForLockedThenClear(end) {
    var tries = 0;
    (function attempt() {
      if (!auto.on) return;
      var wait = Math.max(400, (end + 700) - Date.now());
      step(wait, function () {
        if (!auto.on) return;
        refresh().then(function () {
          if (!auto.on) return;
          if (curPhase() === "locked") {
            doClear();
            step(reduceMotion ? 900 : 3200, function () {
              setParty("halcyon");
              toast("The loser's view: escrow returned in full, the winning price still hidden.");
              auto.on = false;
            });
          } else if (++tries < 25) { attempt(); }
          else { auto.on = false; }
        });
      });
    })();
  }

  /* ---------- party switch ---------- */
  function setParty(p) { ui.party = p; refresh(); }

  /* ============================ RENDER ============================ */
  function render() {
    renderSwitcher();
    renderStepper();
    renderStatus();
    renderGuidance();
    renderAction();
    renderBids();
    renderSettleVisibility();
    renderViewChip();
    renderLedger();
    updateCountdowns();
  }

  function renderSwitcher() {
    $all(".party-tab").forEach(function (t) {
      t.setAttribute("aria-pressed", String(t.dataset.party === ui.party));
    });
  }

  function stepCursor() {
    switch (curPhase()) {
      case "draft": return 0;
      case "open": return 1;
      case "locked": return 2;
      case "cleared": return 3;
      case "settled": return 5;     // all done
      case "rollback": return 5;    // all "done" but the final step is marked failed
      default: return 0;
    }
  }
  function renderStepper() {
    var el = $("#stepper"); if (!el) return;
    var cur = stepCursor();
    var failLast = curPhase() === "rollback";
    el.innerHTML = STAGES.map(function (s, i) {
      var done = i < cur, active = i === cur, fail = failLast && i === 4;
      var cls = "step" + (done && !fail ? " done" : active ? " active" : "");
      var tick;
      if (fail) {
        tick = "<span class='step-tick' style='color:var(--bad)' aria-hidden='true'><svg viewBox='0 0 14 14' width='13' height='13' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><path d='M3.5 3.5l7 7M10.5 3.5l-7 7'/></svg></span>";
      } else if (done) {
        tick = "<span class='step-tick' style='color:var(--good)' aria-hidden='true'><svg viewBox='0 0 14 14' width='13' height='13' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 7.5 6 11l5.5-7'/></svg></span>";
      } else if (active) {
        tick = "<span class='step-tick' style='color:var(--accent-text)' aria-hidden='true'><svg viewBox='0 0 14 14' width='13' height='13' fill='none' stroke='currentColor' stroke-width='2'><circle cx='7' cy='7' r='5' stroke-dasharray='6 4'><animateTransform attributeName='transform' type='rotate' from='0 7 7' to='360 7 7' dur='1.4s' repeatCount='indefinite'/></circle></svg></span>";
      } else {
        tick = "<span class='step-tick' aria-hidden='true'></span>";
      }
      var fillStyle = fail ? " style='width:100%;background:var(--bad)'" : "";
      var st = active ? " aria-current='step'" : "";
      return "<div class='" + cls + "'" + st + ">" +
        "<div class='step-bar'><span class='step-fill'" + fillStyle + "></span></div>" +
        "<div class='step-meta'>" + tick + "<span class='step-label'>" + STAGE_LABEL[s] + "</span></div>" +
        "</div>";
    }).join("");
  }

  function renderStatus() {
    var p = $("#status-pill"); if (!p) return;
    var ph = curPhase();
    var map = {
      draft:    { c: "s-listed",  t: "DRAFT" },
      open:     { c: "s-bidding", t: "BIDDING OPEN" },
      locked:   { c: "s-sealed",  t: "READY TO CLEAR" },
      cleared:  { c: "s-cleared", t: "CLEARING…" },
      settled:  { c: "s-settled", t: "SETTLED" },
      rollback: { c: "s-sealed",  t: "ROLLED BACK" }
    };
    var m = map[ph] || map.draft;
    p.className = "status-pill " + m.c;
    p.textContent = m.t;
    if (ph === "rollback") { p.style.color = "var(--bad)"; p.style.background = "color-mix(in srgb,var(--bad) 14%,transparent)"; }
    else { p.style.color = ""; p.style.background = ""; }
  }

  function renderGuidance() {
    var p = ui.party, ph = curPhase(), txt = "", n = respCount();
    if (p === "seller") {
      if (ph === "draft") txt = "Your block is ready. <b>Publish the listing</b> to open a sealed-bid round — invited desks can then submit bids only you and they can see.";
      else if (ph === "open") txt = n ? "<b>" + n + " sealed bid" + (n > 1 ? "s" : "") + " in.</b> Switch to a bidder to add more. Values are hidden — even from you — until the deadline closes and you clear." : "Bidding is open. <b>Switch to a bidder</b> (above) to submit a sealed bid. Bids stay sealed until you clear.";
      else if (ph === "locked") txt = "Deadline reached. <b>Clear to the best bid</b> — as the clearing party, only now do you see the values.";
      else if (ph === "cleared") txt = "Clearing… asset and cash are crossing in a single atomic transaction.";
      else if (ph === "settled") txt = "Settled. Asset delivered, payment received, losing escrow returned. Switch parties to inspect each line of sight.";
      else if (ph === "rollback") txt = "<b>Rolled back.</b> The winning bid's escrow fell short, so the whole clear reverted — neither leg moved. Reset to run again.";
    } else {
      var placed = !!vm.bidPlaced;
      if (ph === "draft") txt = "No active auction yet. Waiting for the seller to publish the block.";
      else if (ph === "open" && !placed) txt = "Enter your <b>sealed bid</b> below. No other bidder can see it — not now, not after.";
      else if (ph === "open" && placed) txt = "Your bid is <b>sealed</b>. You can't see rivals; they can't see you. Awaiting the deadline.";
      else if (ph === "locked") txt = "Bidding closed. Awaiting the seller's clear. Values stay hidden.";
      else if (ph === "cleared") txt = "Clearing in progress…";
      else if (ph === "settled" && vm.myIsWinner) txt = "<b>You won the block.</b> You never saw a competing price.";
      else if (ph === "settled" && vm.myIsLoser) txt = "<b>Not selected.</b> Your escrow returns in full; the winning price stays hidden from you.";
      else if (ph === "settled") txt = "This round has settled. You did not bid, so there is no outcome for you.";
      else if (ph === "rollback") txt = placed ? "<b>Clear rolled back.</b> Nothing moved — your sealed bid and escrow stand." : "The clear rolled back — nothing moved.";
    }
    var g = $("#guidance-text"); if (g) g.innerHTML = txt;
  }

  function eyeSlash() { return "<span class='mini-eyeslash' aria-hidden='true'></span>"; }

  function renderAction() {
    var el = $("#action"); if (!el) return;
    var p = ui.party, ph = curPhase(), html = "";

    if (isBidder(p)) {
      var placed = !!vm.bidPlaced;
      if (ph === "draft") {
        html = "<div class='action-title'>" + PARTIES[p].name.toUpperCase() + "</div>" +
          "<p class='control-note'>No active auction yet. Waiting for <b>Acme Treasury</b> to publish the block — then you'll be invited to submit a sealed bid.</p>";
      } else if (ph === "open" && !placed) {
        html =
          "<div class='action-title'>SUBMIT YOUR SEALED BID — " + PARTIES[p].name.toUpperCase() + "</div>" +
          "<form class='bidform' id='bidform' novalidate>" +
          "<label for='bidinput'>Bid amount (must meet the " + usd(RESERVE) + " reserve · closes in <span class='mono js-countdown'>" + mmss(remainingMs()) + "</span>)</label>" +
          "<div class='input-wrap'><span class='pre'>$</span>" +
          "<input class='app-input' id='bidinput' inputmode='numeric' autocomplete='off' value='" + SUGGESTED[p].toLocaleString("en-US") + "' aria-label='Bid amount in US dollars' /></div>" +
          "<button class='btn btn-accent' type='submit'>Seal &amp; submit bid →</button>" +
          "<p class='form-help'><span class='lk' aria-hidden='true'>🔒</span>Only you and the seller will ever see this number.</p>" +
          "</form>";
      } else {
        // sealed / locked / outcome — a position card
        var cleared = ph === "settled";
        var won = !!vm.myIsWinner, lost = !!vm.myIsLoser;
        var amt = (vm.myBidAmount != null) ? vm.myBidAmount : (bidsObj()[apiOf(p)] ? bidsObj()[apiOf(p)].amount : null);
        var cls = won ? " win" : lost ? " lose" : "";
        var status, scls;
        if (ph === "rollback") { status = "ROLLED BACK · ESCROW STANDS"; scls = "warn"; }
        else if (!cleared) { status = "SEALED"; scls = "dim"; }
        else if (won) { status = "WON · ASSET RECEIVED"; scls = "good"; }
        else if (lost) { status = "NOT SELECTED"; scls = "warn"; }
        else { status = "SEALED"; scls = "dim"; }
        if (!placed && ph !== "settled") {
          html = "<div class='action-title'>" + PARTIES[p].name.toUpperCase() + "</div><p class='control-note'>You have not placed a bid in this round.</p>";
        } else {
          html =
            "<div class='action-title'>YOUR POSITION — " + PARTIES[p].name.toUpperCase() + "</div>" +
            "<div class='ownbid-card" + cls + "'>" +
            "<span class='ob-k'>YOUR BID</span>" +
            "<span class='ob-v'>" + usd(amt) + "</span>" +
            "<span class='ob-status " + scls + "'>" + status + "</span>" +
            (cleared && lost ? "<span class='escrow-line'><span class='ei' aria-hidden='true'>↩</span><span>Escrow returned in full</span><span class='ev'>" + usd(amt) + "</span></span>" : "") +
            (cleared && won ? "<span class='escrow-line'><span class='ei' aria-hidden='true'>✓</span><span>Asset received · payment sent</span><span class='ev'>" + usd(amt) + "</span></span>" : "") +
            "</div>";
        }
      }
    } else {
      // seller controls
      html = "<div class='action-title'>SELLER CONTROLS — ACME TREASURY</div><div class='seller-controls'>";
      if (ph === "draft") {
        html += "<p class='control-note'>You are the clearing party. <b>Publish</b> the block to open a sealed-bid round. Bids stay sealed — even from you — until the deadline.</p>" +
          "<div class='btn-row'><button class='btn btn-accent' id='publish-btn'>Publish listing &amp; open bidding →</button></div>";
      } else if (ph === "open") {
        var n = respCount();
        html += "<p class='control-note'><b>" + n + "</b> sealed bid" + (n === 1 ? "" : "s") + " received. Values are hidden until you clear. Bidding closes in <b class='mono js-countdown'>" + mmss(remainingMs()) + "</b>.</p>" +
          "<div class='btn-row'><button class='btn btn-ghost' disabled>Clearing unlocks at the deadline</button></div>";
      } else if (ph === "locked") {
        html += "<p class='control-note'>Bidding closed. The sealed bids are now yours to review — <b>clear to the best</b> at or above the reserve. The cleared price is shared only with the winner.</p>" +
          "<div class='btn-row'><button class='btn btn-accent' id='clear-btn'>Clear to best bid →</button></div>";
      } else if (ph === "cleared") {
        html += "<p class='control-note'>Clearing… asset and cash are crossing atomically.</p>";
      } else if (ph === "settled") {
        var wn = vm.winnerId ? PARTIES[vm.winnerId === "A" ? "meridian" : "halcyon"].name : "the winner";
        html += "<p class='control-note'>✓ Settled. <b>" + wn + "</b> received the asset; you received <span class='mono'>" + usd(vm.winnerAmount) + "</span>. Losing escrow was returned.</p>" +
          "<div class='btn-row'><button class='btn btn-ghost' id='reset-inline'>Reset demo ↺</button></div>";
      } else if (ph === "rollback") {
        html += "<p class='control-note'>↺ Clear rolled back — the winning bid's escrow fell short, so <b>nothing moved</b>. State is exactly as before the clear.</p>" +
          "<div class='btn-row'><button class='btn btn-ghost' id='reset-inline'>Reset demo ↺</button></div>";
      }
      html += "</div>";
    }
    el.innerHTML = html;
    wireAction();
  }

  function wireAction() {
    var form = $("#bidform");
    if (form) {
      form.addEventListener("submit", function (e) { e.preventDefault(); submitBidFromForm(); });
      var input = $("#bidinput");
      if (input) input.addEventListener("input", function () {
        var raw = input.value.replace(/[^0-9]/g, "");
        input.value = raw ? parseInt(raw, 10).toLocaleString("en-US") : "";
      });
    }
    var pb = $("#publish-btn"); if (pb) pb.addEventListener("click", publish);
    var cl = $("#clear-btn"); if (cl) cl.addEventListener("click", doClear);
    var ri = $("#reset-inline"); if (ri) ri.addEventListener("click", resetDemo);
  }

  function redactedCell() { return "<span class='redacted'><span class='dots'>••••••••</span></span>"; }
  function row(cls, party, chip, value, tag) {
    return "<li class='" + cls + "'><span class='bp'>" + party + chip + "</span><span class='bv'>" + value + "</span>" + tag + "</li>";
  }

  function renderBids() {
    var el = $("#bids"); if (!el) return;
    var p = ui.party, ph = curPhase(), rows = "";

    if (isBidder(p)) {
      // a bidder sees ONLY their own row + a redacted placeholder for everyone else
      var placed = !!vm.bidPlaced;
      var amt = (vm.myBidAmount != null) ? vm.myBidAmount : (bidsObj()[apiOf(p)] ? bidsObj()[apiOf(p)].amount : null);
      if (placed || ph === "settled") {
        var tag;
        if (ph === "settled" && vm.myIsWinner) tag = "<span class='btag good'>WON</span>";
        else if (ph === "settled" && vm.myIsLoser) tag = "<span class='btag warn'>RETURNED</span>";
        else if (ph === "rollback") tag = "<span class='btag warn'>ROLLED BACK</span>";
        else tag = "<span class='btag dim'>SEALED</span>";
        if (amt != null) rows += row("brow mine", PARTIES[p].name, "<span class='you-chip'>YOU</span>", usd(amt), tag);
      }
      rows += row("brow masked", (ph === "settled" || ph === "rollback") ? "Other bid(s)" : "Other invited bidder(s)", "", redactedCell(),
        "<span class='btag nd'>" + eyeSlash() + "NOT DISCLOSED TO YOU</span>");
      el.innerHTML = "<div class='bids-title'>" + eyeSlash() + " YOUR VIEW — RIVALS ARE SEALED</div><ul class='bidlist'>" + rows + "</ul>";
      return;
    }

    // seller: the clearing party. Bids stay sealed (masked) through 'open'; once
    // bidding CLOSES (locked) the clearing party may review them — the honest
    // boundary stated in the README. Clear consumes the SealedBids, so the
    // settled book is rebuilt from the winner info + what the seller saw at close.
    var b = bidsObj();
    if (b.A) sellerBook.A = b.A.amount;
    if (b.B) sellerBook.B = b.B.amount;

    if (ph === "draft") {
      sellerBook = { A: null, B: null };
      el.innerHTML = "<div class='bids-title'>SEALED BIDS</div><ul class='bidlist'>" +
        row("brow reserve", "Reserve floor", "", usd(RESERVE), "<span class='btag dim'>SET</span>") +
        "<li class='ev-empty'>No auction yet — publish the listing to open bidding.</li></ul>";
      return;
    }

    var title, metR;
    if (ph === "open") {
      ["A", "B"].forEach(function (id) {
        var who = PARTIES[id === "A" ? "meridian" : "halcyon"].name;
        if (b[id]) rows += row("brow", who, "", redactedCell(), "<span class='btag warn'>SEALED</span>");
        else rows += row("brow", who, "", "<span style='color:var(--faint)'>—</span>", "<span class='btag dim'>AWAITING</span>");
      });
      rows += row("brow reserve", "Reserve floor", "", usd(RESERVE), "<span class='btag dim'>SET</span>");
      title = "SEALED BIDS — VALUES HIDDEN UNTIL THE DEADLINE";
    } else if (ph === "locked") {
      var ids = ["A", "B"].filter(function (id) { return b[id]; }).sort(function (x, y) { return b[y].amount - b[x].amount; });
      ids.forEach(function (id, i) {
        var who = PARTIES[id === "A" ? "meridian" : "halcyon"].name;
        var best = i === 0, short = b[id].escrow != null && b[id].escrow < b[id].amount;
        var tag = short ? "<span class='btag warn'>ESCROW SHORT</span>" : best ? "<span class='btag good'>BEST</span>" : "<span class='btag dim'>QUALIFIED</span>";
        rows += row("brow" + (best && !short ? " best" : ""), who, "", usd(b[id].amount), tag);
      });
      metR = ids.length && b[ids[0]].amount >= RESERVE;
      rows += row("brow reserve", "Reserve floor", "", usd(RESERVE), "<span class='btag dim'>" + (metR ? "MET ✓" : "NOT MET") + "</span>");
      title = "SEALED BIDS — REVEALED TO YOU (CLEARING PARTY)";
    } else if (ph === "settled") {
      var wId = vm.winnerId, lId = wId === "A" ? "B" : wId === "B" ? "A" : null;
      if (wId) rows += row("brow best", PARTIES[wId === "A" ? "meridian" : "halcyon"].name, "", usd(vm.winnerAmount), "<span class='btag good'>BEST · CLEARED · SETTLED</span>");
      if (lId) rows += row("brow", PARTIES[lId === "A" ? "meridian" : "halcyon"].name, "", sellerBook[lId] != null ? usd(sellerBook[lId]) : "<span style='color:var(--faint)'>escrow returned</span>", "<span class='btag dim'>RETURNED</span>");
      rows += row("brow reserve", "Reserve floor", "", usd(RESERVE), "<span class='btag dim'>MET ✓</span>");
      title = "BIDS — CLEARED (CLEARING PARTY)";
    } else { // rollback — clear reverted, SealedBids still active
      ["A", "B"].forEach(function (id) {
        var who = PARTIES[id === "A" ? "meridian" : "halcyon"].name;
        if (!b[id]) { rows += row("brow", who, "", "<span style='color:var(--faint)'>—</span>", "<span class='btag dim'>AWAITING</span>"); return; }
        var short = b[id].escrow != null && b[id].escrow < b[id].amount;
        rows += row("brow", who, "", usd(b[id].amount), short ? "<span class='btag warn'>ESCROW SHORT</span>" : "<span class='btag dim'>RETURNED</span>");
      });
      rows += row("brow reserve", "Reserve floor", "", usd(RESERVE), "<span class='btag dim'>SET</span>");
      title = "BIDS — CLEAR ROLLED BACK (NOTHING MOVED)";
    }
    el.innerHTML = "<div class='bids-title'>" + title + "</div><ul class='bidlist'>" + rows + "</ul>";
  }

  function attemptedWinnerAmount() {
    var b = bidsObj();
    var amts = [];
    if (b.A) amts.push(b.A.amount);
    if (b.B) amts.push(b.B.amount);
    return amts.length ? Math.max.apply(null, amts) : null;
  }

  function renderSettleVisibility() {
    var w = $("#settle-wrap"); if (!w) return;
    var ph = curPhase();
    var isWinnerPov = isBidder(ui.party) && !!vm.myIsWinner;
    var show = (ph === "cleared" || ph === "settled" || ph === "rollback") && (ui.party === "seller" || isWinnerPov);
    w.hidden = !show;
    if (!show) return;

    var dvp = $("#settle-wrap .dvp");
    var payEl = $("#dvp-pay"), statusEl = $("#dvp-status");
    var assetFrom = $("#settle-wrap .dvp-asset .leg-from"), cashFrom = $("#settle-wrap .dvp-cash .leg-from");
    var assetAmt = $("#settle-wrap .dvp-asset .leg-amount"), cashAmt = $("#settle-wrap .dvp-cash .leg-amount");

    var winShort = vm.winnerId === "A" ? "MERIDIAN" : vm.winnerId === "B" ? "HALCYON" : "WINNER";

    if (ph === "rollback") {
      if (dvp) { dvp.classList.remove("is-settled"); dvp.classList.add("is-failed"); }
      if (statusEl) statusEl.textContent = "ROLLED BACK ✗";
      if (payEl) payEl.textContent = usd(attemptedWinnerAmount());
      if (assetFrom) assetFrom.innerHTML = "NOT DELIVERED";
      if (cashFrom) cashFrom.innerHTML = "NOT TRANSFERRED";
      if (assetAmt) assetAmt.style.textDecoration = "line-through";
      if (cashAmt) cashAmt.style.textDecoration = "line-through";
      return;
    }

    // cleared (transient) or settled
    if (assetAmt) assetAmt.style.textDecoration = "";
    if (cashAmt) cashAmt.style.textDecoration = "";
    if (payEl) payEl.textContent = usd(vm.winnerAmount != null ? vm.winnerAmount : attemptedWinnerAmount());
    if (assetFrom) assetFrom.innerHTML = "ACME&nbsp;→&nbsp;" + winShort;
    if (cashFrom) cashFrom.innerHTML = winShort + "&nbsp;→&nbsp;ACME";
    if (dvp) dvp.classList.remove("is-failed");
    if (ph === "settled") {
      if (dvp) dvp.classList.add("is-settled");
      if (statusEl) statusEl.textContent = "SETTLED ✓";
    } else {
      if (dvp) dvp.classList.remove("is-settled");
      if (statusEl) statusEl.textContent = "CLEARED";
    }
  }

  function runSettleAnim() {
    var dvp = $("#settle-wrap .dvp"); if (!dvp) return;
    var asset = $("#settle-wrap .dvp-asset"), cash = $("#settle-wrap .dvp-cash"), statusEl = $("#dvp-status");
    if (reduceMotion) { dvp.classList.add("is-settled"); if (statusEl) statusEl.textContent = "SETTLED ✓"; return; }
    dvp.classList.remove("is-settled", "is-failed");
    if (statusEl) statusEl.textContent = "CROSSING…";
    var d = Math.min(dvp.offsetWidth * 0.18, 120);
    asset.style.transition = cash.style.transition = "transform .6s cubic-bezier(.5,0,.2,1)";
    asset.style.transform = "translateX(" + d + "px)";
    cash.style.transform = "translateX(" + (-d) + "px)";
    setTimeout(function () {
      asset.style.transform = cash.style.transform = "translateX(0)";
      dvp.classList.add("is-settled");
      if (statusEl) statusEl.textContent = "SETTLED ✓";
    }, 650);
  }

  function renderViewChip() {
    var p = ui.party, txt;
    if (p === "seller") txt = "As the <b>clearing party</b>, you see the bids you clear — that's the honest boundary. You do <b>not</b> see values before the deadline closes.";
    else {
      var rival = PARTIES[BIDDERS.filter(function (b) { return b !== p; })[0]].name;
      txt = "As a <b>bidder</b>, you see only your own bid. " + rival + "'s price is never disclosed to you — enforced by the protocol, not a setting.";
    }
    var el = $("#view-chip-text"); if (el) el.innerHTML = txt;
  }

  /* party-scoped event log, derived from the live view-model */
  function deriveEvents() {
    var p = ui.party, ph = curPhase(), ev = [], i = 0;
    var T = function () { return "T+" + String(++i).padStart(2, "0"); };
    var b = bidsObj();
    if (p === "seller") {
      if (ph !== "draft") ev.push({ t: T(), x: "<span class='who'>You</span> published the listing — terms shared with both invited desks." });
      ["A", "B"].forEach(function (id) {
        if (b[id]) ev.push({ t: b[id].t || T(), x: "<span class='who'>" + (id === "A" ? "Meridian Capital" : "Halcyon Asset Mgmt") + "</span> submitted a sealed bid — held by the network.", sealed: true });
      });
      if (ph === "locked") ev.push({ t: T(), x: "Deadline passed. Bidding closed — clear to unseal the sealed bids." });
      if (ph === "settled") {
        var wn = vm.winnerId ? (vm.winnerId === "A" ? "Meridian Capital" : "Halcyon Asset Mgmt") : "the winner";
        ev.push({ t: T(), x: "You cleared to <span class='who'>" + wn + "</span> @ " + usd(vm.winnerAmount) + "." });
        ev.push({ t: T(), x: "Atomic settlement complete — asset delivered, cash received in one transaction." });
        ev.push({ t: T(), x: "Losing escrow returned in full." });
      }
      if (ph === "rollback") ev.push({ t: T(), x: "Clear attempted — winning escrow fell short. Rolled back atomically; <span class='who'>nothing moved</span>." });
    } else {
      var placed = !!vm.bidPlaced;
      if (placed) ev.push({ t: T(), x: "<span class='who'>You</span> sealed and submitted a bid" + (vm.myBidAmount != null ? " (" + usd(vm.myBidAmount) + ", escrow locked)" : "") + "." });
      if (ph === "locked") ev.push({ t: T(), x: "Bidding closed. Awaiting the seller's clear." });
      if (ph === "settled" && vm.myIsWinner) ev.push({ t: T(), x: "You won the block. You never saw a competing price." });
      if (ph === "settled" && vm.myIsLoser) ev.push({ t: T(), x: "Not selected. The winning price is not disclosed to you; escrow returned in full." });
      if (ph === "rollback" && placed) ev.push({ t: T(), x: "Clear rolled back — nothing moved. Your sealed bid and escrow stand." });
    }
    return ev;
  }
  function renderLedger() {
    var el = $("#events"); if (!el) return;
    var scope = $("#ledger-scope"); if (scope) scope.textContent = PARTIES[ui.party].short;
    var ev = deriveEvents();
    if (!ev.length) { el.innerHTML = "<li class='ev-empty'>No events visible to you yet.</li>"; return; }
    el.innerHTML = ev.map(function (e) {
      return "<li class='ev'><span class='ev-t'>" + e.t + "</span><span class='ev-x" + (e.sealed ? " ev-sealed" : "") + "'>" +
        (e.sealed ? "<span class='lk' aria-hidden='true'>🔒 </span>" : "") + e.x + "</span></li>";
    }).join("");
  }

  /* ---------- live countdown (1s) — updates text only, no full re-render ---------- */
  function updateCountdowns() {
    var ph = curPhase();
    var rem = remainingMs();
    var label = (ph === "open" && rem != null) ? mmss(rem) : "00:00";
    $all(".js-countdown").forEach(function (n) { n.textContent = label; });
  }

  /* ============================ WIRING ============================ */
  $all(".party-tab").forEach(function (t) {
    t.addEventListener("click", function () { clearAuto(); setParty(t.dataset.party); });
  });
  var resetBtn = $("#reset"); if (resetBtn) resetBtn.addEventListener("click", resetDemo);
  var autoBtn = $("#autorun"); if (autoBtn) autoBtn.addEventListener("click", autoRun);

  /* toast */
  var toastEl = $("#toast"), toastTimer = null;
  function toast(msg) {
    if (!toastEl || !msg) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 3600);
  }

  /* theme (shared with the landing via localStorage) */
  (function theme() {
    var html = document.documentElement, btn = $(".theme-toggle");
    if (!btn) return;
    var stored = readLS("sotto-theme");
    if (stored === "light" || stored === "dark") apply(stored);
    function apply(t) {
      html.setAttribute("data-theme", t);
      var light = t === "light";
      btn.setAttribute("aria-pressed", String(light));
      btn.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
      var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", light ? "#f4f6f8" : "#0a0c0f");
      writeLS("sotto-theme", t);
    }
    btn.addEventListener("click", function () { apply(html.getAttribute("data-theme") === "light" ? "dark" : "light"); });
  })();

  /* ---------- boot: live poll + countdown tick ---------- */
  if (!TOKEN) toast("No access token in the URL — open the demo from the landing page (or append ?token=…).");
  refresh();
  setInterval(function () {
    if (settling || busy) return;          // don't fight the clear animation or an in-flight action
    refresh();
  }, 2000);
  setInterval(function () {
    updateCountdowns();
    // nudge to 'locked' as soon as the window elapses (don't wait for the 2s poll)
    if (curPhase() === "open" && remainingMs() != null && remainingMs() <= 0 && !deadlineNudged && !settling && !busy) {
      deadlineNudged = true; refresh();
    }
  }, 1000);
})();
