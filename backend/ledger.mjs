// Thin Sotto client for the Canton JSON Ledger API v2.
//
// Deliberately small and transport-isolated: the rest of the app (demo script,
// integration tests, Next.js API routes) speaks only through these functions, so
// swapping JSON<->gRPC would touch only this file (handoff: thin client interface).
//
// Party-scoping note: the LocalNet sandbox runs with auth disabled, so a caller's
// "scope" is the `actAs`/`readAs` party it names. Crucially, Canton enforces
// contract VISIBILITY at the protocol level regardless — a `readAs:[B]` query can
// only ever return what B is a stakeholder of. That is what makes the INV-1
// re-assertion at this layer meaningful, not an omniscient/admin read.

export const BASE = process.env.SOTTO_JSON_API || 'http://localhost:7575';
// Package-NAME template ref (Daml 3.x): resolves to the deployed `sotto` model package
// regardless of its content hash, so rebuilds/repackaging don't require code changes.
export const tid = (entity) => `#sotto:Sotto:${entity}`;

async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let d; try { d = JSON.parse(text); } catch { d = text; }
  if (r.status >= 400) {
    throw new Error(`${method} ${path} -> HTTP ${r.status}: ${typeof d === 'string' ? d : JSON.stringify(d)}`);
  }
  return d;
}

let _seq = 0;
const cmdId = (p = 'cmd') => `${p}-${Date.now()}-${_seq++}`;

export async function allocateParty(hint) {
  const d = await api('POST', '/v2/parties', { partyIdHint: hint });
  return d.partyDetails.party;
}

export async function ledgerEnd() {
  const d = await api('GET', '/v2/state/ledger-end');
  return d.offset;
}

// Submit commands as a single transaction acting as `actAs`. Returns the tx.
// Retries the brief post-startup race where the DAR is uploaded but its package
// name isn't resolvable yet (PACKAGE_NAMES_NOT_FOUND) — `readyz` precedes vetting.
async function submit(actAs, commands) {
  let lastErr;
  for (let i = 0; i < 10; i++) {
    try {
      const d = await api('POST', '/v2/commands/submit-and-wait-for-transaction', {
        commands: { commands, commandId: cmdId(), actAs: [actAs], userId: 'sotto-demo' },
      });
      return d.transaction;
    } catch (e) {
      lastErr = e;
      const m = String(e);
      // Retry the brief post-startup package-vetting window (readyz precedes vetting).
      if (m.includes('PACKAGE_NAMES_NOT_FOUND') || m.includes('PACKAGE_SELECTION_FAILED') || m.includes('consistently vetted')) {
        await new Promise((r) => setTimeout(r, 1500)); continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export async function create(actAs, entity, createArguments) {
  const tx = await submit(actAs, [{ CreateCommand: { templateId: tid(entity), createArguments } }]);
  const ev = tx.events.find((e) => e.CreatedEvent);
  return ev.CreatedEvent.contractId;
}

// Exercise a choice; returns the full transaction (caller can inspect events).
export async function exercise(actAs, entity, contractId, choice, choiceArgument) {
  return submit(actAs, [{ ExerciseCommand: { templateId: tid(entity), contractId, choice, choiceArgument } }]);
}

// Created contract ids of a given entity that appear in a transaction's events.
export function createdOf(tx, entity) {
  return (tx.events || [])
    .filter((e) => e.CreatedEvent && e.CreatedEvent.templateId.endsWith(`:Sotto:${entity}`))
    .map((e) => e.CreatedEvent.contractId);
}

// PARTY-SCOPED active-contract-set query. Returns [{contractId, templateId, payload}]
// visible to `party`. Optionally filter to one entity. This is NOT omniscient — it
// is exactly what `party` is a stakeholder of.
export async function activeContracts(party, entity = null, { debug = false } = {}) {
  const activeAtOffset = await ledgerEnd();
  const filter = {
    filtersByParty: {
      [party]: { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }] },
    },
  };
  const d = await api('POST', '/v2/state/active-contracts', { filter, verbose: true, activeAtOffset });
  if (debug) console.error('RAW ACS:', JSON.stringify(d).slice(0, 1200));
  const entries = Array.isArray(d) ? d : (d.result || d.activeContracts || []);
  const out = [];
  for (const e of entries) {
    const ce =
      e?.contractEntry?.JsActiveContract?.createdEvent ||
      e?.JsActiveContract?.createdEvent ||
      e?.activeContract?.createdEvent ||
      e?.createdEvent ||
      (e?.CreatedEvent ? e.CreatedEvent : null);
    if (!ce) continue;
    out.push({
      contractId: ce.contractId,
      templateId: ce.templateId,
      payload: ce.createArgument || ce.createArguments || ce.payload,
    });
  }
  return entity ? out.filter((c) => c.templateId.endsWith(`:Sotto:${entity}`)) : out;
}
