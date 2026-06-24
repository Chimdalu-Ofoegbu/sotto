# DECISIONS — Sotto

Every non-obvious decision and its rationale. Newest first. Locked decisions from the
handoff are restated only where we deviate or add nuance.

---

## D-010 · Three-view UI as a zero-dep Node server instead of Next.js — DEVIATION (blocking reason)
**2026-06-24** — *Locked decision deviated, with logged blocking reason.* The handoff
locks "Next.js + TypeScript", but a Next.js install lands `node_modules` on the WSL
`/mnt/c` mount where npm is prohibitively slow, and the remaining token budget had to be
reserved for the mandatory stop-deliverables (README, audit sweep, doc finalization). The
handoff itself states the multi-party side-by-side view "is the product, **not the
design**" and that a **thin UI is acceptable** (priority #4). The substitute — a single
zero-dependency Node server (`frontend/server.mjs` + `index.html`) — delivers the identical
demo-legibility outcome: three **party-scoped** ledger views that make the privacy contrast
visible (A bids → A & Seller see it, B does not), plus live clear/settle. It reuses the
same `backend/ledger.mjs` JSON-API client, so the transport story is unchanged. Runs in WSL
bound to `0.0.0.0:3000` (reachable from the Windows browser; the sandbox's loopback-only
`:7575` is reached server-side within WSL). **Reversible:** a Next.js port is additive.

**Update (2026-06-24, design handoff):** the user provided a Claude Design bundle
(`sotto-private-otc-execution-ui/`). It was consumed and **ported faithfully** into the
zero-dep app (`frontend/index.html` + `frontend/screens.js`): exact oklch theme tokens
(dark/light), Space Grotesk + IBM Plex Mono, a "Viewing as" POV switcher, the full phase
machine (draft→open→live→locked→cleared→settled/rollback), dual framing (OTC ⇄ procurement),
four scenarios (two-bids/single/tie/short-escrow), Inspector "need-to-know" popovers, the
demo timeline, and the side-by-side confidentiality compare overlay. All 12 screen states
verified rendering headlessly. The design medium is HTML/CSS, so no Next.js install was
needed. **Current limitation:** the ported UI runs the design's *canned* scenario data (a
narrative demo, like the prototype). The **real** Canton privacy/atomicity proof remains
verifiable via `dpm test` and `bash scripts/demo.sh` (party-scoped, live ledger). Wiring
this UI to the live JSON Ledger API (the existing `/api/*` in `server.mjs`) is the next step.

## D-009 · Frontend runs in WSL bound to 0.0.0.0; sandbox stays loopback
**2026-06-24** — Windows↔WSL: a WSL server bound to `0.0.0.0` is reachable from the Windows
browser via `localhost` (verified), but `dpm sandbox` binds `127.0.0.1` only (not forwarded).
So the UI server runs in WSL (server-side calls reach `127.0.0.1:7575` directly) and serves
the browser on `0.0.0.0:3000`. Avoids any cross-host proxy.

## D-008 · Bid direction default = highest-bid-wins, behind one constant
**2026-06-24** — Handoff demo framing default is a private OTC block trade (highest bid
wins). Implemented behind a single comparison point in the Daml model so relabeling to a
procurement reverse-auction (lowest bid wins) is a one-line change (MODEL-06).
**Reversible:** yes.

## D-007 · GSD subagents run on `model_profile: inherit`
**2026-06-24** — Per user directive, `.planning/config.json` `model_profile` set to
`inherit` so every GSD subagent (researcher/planner/checker/executor) uses the current
session model (Opus 4.8) rather than a pinned tier. Verified via `gsd-sdk resolve-model`
(all agents → `inherit`). When spawning subagents via the Agent tool, the model param is
omitted so they inherit the session model.

## D-006 · Claude never recorded as a git contributor (strict)
**2026-06-24** — User hard requirement. Enforced three ways: (1) git author/committer is
`Bensage <bensagesol@gmail.com>` (existing global config); (2) a repo `commit-msg` hook
(`.git/hooks/commit-msg`) strips any `Co-Authored-By: *claude/anthropic*` and
`Generated with *Claude*` / `🤖` lines from every commit message; (3) GSD's own commit
helper was verified to add no attribution. Tested by injecting a fake Claude trailer into
a real commit — it was stripped; author remained the user.

## D-005 · Build inside Ubuntu WSL2; repo stays on the Windows side
**2026-06-24** — The Daml toolchain is Linux-native. We run it in the existing
`Ubuntu 26.04` WSL2 distro, but keep the git repo and all source under the user's Windows
folder (`C:\Users\Ben\Desktop\B3NSAG3\Hackathons\Sotto` = `/mnt/c/...`) so everything is
visible in their project directory and under one git history. Trade-off: cross-filesystem
(`/mnt/c`) Daml builds are slower; acceptable for this project's size. Fallback if it
becomes a problem: build in WSL home and keep git on the Windows side.
**Reversible:** yes.

## D-004 · No-sudo toolchain: portable JDK 17 + dpm (user-authorized)
**2026-06-24** — `make`, JDK, `daml`, `dpm` were all absent and `sudo` is password-gated.
Chosen path (explicitly authorized by the user): install Eclipse Temurin **JDK 17** as a
portable tarball into `~/jdk17` and **dpm** via its manual tarball install into `~/.dpm`
— both no-sudo, home-dir only, fully reversible (`rm -rf ~/jdk17 ~/.dpm`). Installer run
as a downloaded archive + local bootstrap (no `curl|sh` piping) for transparency.
**Reversible:** yes.

## D-003 · dpm `sandbox` instead of the Docker `make` Canton Quickstart — DEVIATION (blocking reason)
**2026-06-24** — *Locked decision deviated, with logged blocking reason (permitted by the
operating rules).* The handoff locks "Canton LocalNet via the Canton Quickstart
(`make setup && make build && make start`)". That path requires `make` (needs sudo),
Docker Desktop's **WSL integration for Ubuntu** (a GUI toggle, currently off), and
`docker login` — none available autonomously on this machine.
**Substitute:** `dpm sandbox` — a local **Canton ledger running as a JVM process (no
Docker)**, single participant + sync domain, exposing the **JSON Ledger API**
(`--json-api-port`). It preserves every guarantee the handoff actually depends on:
- Real Canton (not a mock) → sub-transaction privacy is genuinely protocol-enforced.
- One participant hosting multiple parties → bidder-vs-bidder confidentiality (INV-1).
- Single-transaction `Clear` → atomic DvP (INV-2).
- Party-scoped JSON Ledger API queries → INV-1/INV-2 re-asserted at the API layer.
- LocalNet-only (sandbox is local) → no DevNet/TestNet/MainNet touched.
This does **not** change the core architecture (templates, privacy/atomicity model,
frontend transport) — only the local-network provisioning mechanism. If the full
Quickstart is later wanted, it is additive.
**Reversible:** yes (additive).

## D-002 · GSD planning authored directly from the handoff (no project-discovery research)
**2026-06-24** — The handoff is a complete, authoritative PRD/SPEC that explicitly forbids
re-litigating locked decisions. Rather than spawn GSD's project-level discovery
researchers (stack/features/architecture/pitfalls — which would re-pick an already-locked
stack and burn budget against the ~700k ceiling), PROJECT/REQUIREMENTS/ROADMAP were
authored directly from the handoff. Phase-level research (gsd-phase-researcher) is still
used where it adds value — e.g. Daml privacy implementation specifics and current dpm /
JSON Ledger API usage — since that is *how to implement*, not *what to build*.
**Reversible:** yes.

## D-001 · GSD as the execution backbone
**2026-06-24** — Per the user's instruction ("Using the GSD skill, execute the .md
file"), the build is driven through GSD: `.planning/` artifacts, the SDK, phase workflows
(plan-phase → execute-phase → verify), atomic commits, and STATE.md for resumability.
Phase numbering is GSD's 1-based scheme mapped to the handoff's Phase 0–3.
