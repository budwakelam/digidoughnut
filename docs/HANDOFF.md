# DigiDoughnut Platform: Handoff (end of Phase 6, start of Phase 7 "More AI companies + updates")

Written 2026-10-07 (evening). Read this first, then `docs/handoff-notes.md` (running log, newest
at the bottom), then the spec `digidoughnut-platform-spec-2026-10-06.md` (claude.ai Project).
Anything marked "Oran's call" is his: ask, don't decide.

## Where everything is

- Repo `budwakelam/digidoughnut`, branch **`platform-phase-1`**. `master` = original POC +
  the live noticeboard (`noticeboard/notes.json`, served by GitHub Pages).
- Build: `node build.mjs` → `dist/<program>.html`. Rebuild after committing (the support report
  shows the commit). Before a handoff, diff the last file sent to Oran against the repo build.
- Tests (headless Chromium, fakes only): `platform_test.py` 110 · `ai_test.py` 61 ·
  `setup_test.py` 200 · `helper_test.py` 79 · `sync_test.py` 101 · `agent_test.py` 91 ·
  `QR_DECODER=<path to node script> pair_test.py` 22 (the decoder is 6 lines of node: jsqr +
  pngjs; it is run as `node $QR_DECODER file.png`). Ignore Playwright's `CancelledError` noise;
  the last line is the verdict.
- Files sent to Oran: demo14 (agent, first build), demo15 (Penny shows the agent's question,
  Muse's fixes), **demo16** (Backup & new versions). Oran's Muse run of demo14 PASSED.
  demo13 (offline + backup) and demo15/16 not yet run by Oran.
- Oran's Firebase test project: "etsy" (etsy-d95c1), Spark plan, Realtime Database us-central1,
  Anonymous sign-in on, short rules published. Oran has **Muse** (not Dots; Grok Bot unsure).

## Modules (platform/js, load order in build.mjs)

dd.core · dd.store · dd.errors · dd.ui · dd.diag · dd.pair · dd.ai · dd.notes · dd.setup ·
dd.helper · dd.sync · dd.backup · **dd.agent (Phase 6)**. dd.core calls `dd.agent.attach`
before `dd.sync.attach` (an agent link picks the ledger).

## Phase 6: what was built

- **The API is the buyer's own Firebase** (Oran's call: no DigiDoughnut server). Under the
  ledger, `agent/`: `view` (summary text + data and tools as JSON text + server `updatedAt`),
  `inbox/<id>` (`{tool, args, at}`), `done/<id>` (`{ok, message, tool, at}` or `{waiting:true}`).
- Instructions run with the program's **own tools** (the same contract as Penny), one at a time,
  oldest first by server time, across all open devices (claimed with `runTransaction`; a claim
  goes stale after 60 s). Args are checked against the tool's params. The view is written in the
  same update as `done`, so a result implies a fresh view. A retried instruction whose result
  exists is dropped (PUT with the agent's own id is safe to retry). Results pruned after 7 days.
- **An instruction waits** in the database until the program is open somewhere; the agent is
  told so, and may open its **agent link** (`#ddagent=<b64url {v,s,f}>`, never expires,
  reusable) to run it now. API-only agents just wait for the buyer.
- **Big changes** (tools with `confirm`) wait for the buyer's Yes on their own device: a notice
  at the top AND a box inside Penny's window ("Penny can still help with anything else"). Never
  on a copy opened from the agent link. Penny's prompt knows about the waiting question.
- **"Copy instructions for my agent"** (setup step 5, needs step 4): `dd.agent.brief()` —
  REST sign-in, read, PUT/POST an instruction, read/stream the result, the actions with inputs,
  rules. No Google AI code in it. The sheet says plainly that anyone with the instructions can
  read and change the data, and that Meta gets what Muse reads.
- **Disconnect my agent** = `dd.sync.newAddress()`: old ledger emptied and marked
  `meta/moved`; the buyer's other devices stop, keep their data and say "scan again"
  (`sync_moved`); this device moves to a new ledger and opens the QR sheet.
- Example data: the agent's first change removes only items whose id is in `exampleData()`
  (**example ids must stay fixed in every program**) and keeps anything the buyer typed.
- Program convention (demo shows it): tools that target one record accept its **id**, and
  words that match more than one record are refused with every match and its id.
- **Backup & new versions** (footer + live sync sheet): says "backed up live in your own
  Firebase" or "saved on this device only", the last backup date, the three ways to a new
  version (same place + same file name, live sync, backup file + Restore), and a gentle monthly
  nudge when data lives on one device only.

## Decisions log (Oran) — Phase 6

| Topic | Decision |
| --- | --- |
| Agent access | Through the buyer's own Firebase (REST), no DigiDoughnut server |
| Setup | Step 5 "Connect your AI agent", needs live sync (step 4) |
| When the app is closed | The instruction waits; "it happens when you next open the app" |
| Big changes from an agent | Wait for the buyer's Yes on their own device |
| Security wording | Say plainly: anyone with the instructions can read and change the data |
| Program updates | Through the Etsy download link: Oran replaces the file, buyers re-download. No key or update gate (no date-based keys: anything in the file can be read) |
| Backup | Make it obvious (footer + sync sheet); say live sync already keeps a live copy |

## Still open from Phase 5/6

1. Oran's runs: demo13 (offline both devices incl. the same item; backup → clear → restore →
   Undo; upload over the old file), demo15 (Penny's box while Muse waits; re-copy the
   instructions — they changed), demo16 (Backup & new versions on PC + iPhone).
2. Oran reported "Penny wasn't working while the agent's change waited". Not reproduced (tests
   show Penny editing fine). If it happens again: get the support report from that moment.
3. Muse said example items were kept as real after its first add. Not reproduced; most likely
   "Keep these" had been tapped. Asked Oran.
4. Firebase create-project screenshots; watch the "etsy" inbox for any "insecure rules" email.
5. Agent panel (forms) for browsing-only agents: not built, Muse didn't need it.
6. Undo for an agent's change only shows on the device that ran it. Each agent sign-in makes a
   new anonymous user (harmless).
7. Tombstones: `times/` entries for deleted items stay (~60 bytes each); prune after ~60 days if a
   program deletes a lot.

---

## Phase 7: more AI companies, and "update available" (to plan with Oran, then build)

**Oran's ask (2026-10-07):** future-proof the AI side ("Gemini may not be free tomorrow"), and
let buyers use other AI companies in setup step 2, with Google as the free default.

### What already copes (audited 2026-10-07)

- Model names: never baked in. dd.ai lists Google's models, ranks Flash / Flash-Lite, races
  slow ones, falls back on busy or retired models. New Gemini models are picked up by themselves.
- The noticeboard (`dd.notes`, weekly, `noticeboard/notes.json`) can carry: help links, wizard
  button labels, one notice, model prefer/avoid hints, and code-recognition patterns. It can
  **never** change where codes or data are sent (deliberate: if the GitHub account were taken
  over, nobody could redirect buyers' codes).

### The gaps

1. Only one AI company (Google) is built in (`ai.providers`, `ai.adapters.gemini`).
2. The noticeboard can't add a company (by design; keep it so — Oran's call 1 below).
3. No "a newer version is ready" notice for the program file itself.

### Proposed plan (for Oran to approve)

1. **Several companies built in**, switched on/off, set as default, marked free, by the
   noticeboard. Three dialects cover nearly everyone: Gemini (have it), OpenAI-style chat
   completions with tools, Anthropic messages with tools. Candidates — free: Google (default),
   Groq, OpenRouter (free models), Mistral (free tier); paid: OpenAI, Anthropic (needs the
   `anthropic-dangerous-direct-browser-access` header), xAI, DeepSeek. **Before promising any:
   live-test each one from a browser page** (does it allow direct calls from a web page / CORS?
   is the free tier still real? does tool calling work?). Rule 1 and rule 3 apply.
2. **Setup step 2 becomes a choice**: "Free with Google (recommended)" stays the big button;
   "Use a different AI company" opens a picker with the same wizard engine per company. Code
   detection already exists (`ai.detectProvider`). Storage already has `backup` next to `main`
   in `dd_ai_connections_v1`: a second company Penny falls back to.
3. **"My own AI server"** (advanced): the buyer types an OpenAI-compatible address themselves
   (their choice, their risk; e.g. something on their own computer).
4. **"Update available"**: the noticeboard lists the newest version per program; a program
   that's behind shows "A newer version is ready", the Etsy re-download note and the
   "Backup & new versions" steps (same place + same file name).

### Oran's calls (asked 2026-10-07, not yet answered)

1. Keep the rule that the noticeboard can't add new addresses (a new company = a program
   update)? Recommended: yes.
2. Which companies at launch? Suggested: Google, Groq, OpenRouter, OpenAI, Anthropic; the rest
   after live tests.
3. Turn on the backup code (a second company Penny falls back to)? Suggested: yes, optional.
4. If Google drops its free tier, may the noticeboard change the default free company for
   everyone (Google-code buyers get a "switch" message)?

### Build order

1. Answers to the four calls. 2. Live browser tests per company (scratch page, real keys from
Oran where needed; report CORS, free tier, tool calling, model list). 3. Adapters (openai,
anthropic) behind the same neutral tools/history; per-company error mapping to the seven
friendly types. 4. Step 2 picker + per-company wizards (Oran's screenshots for each sign-up).
5. Backup company + fallback in `ai.chat`. 6. Noticeboard: `providers` (on/off, default, free,
models), `latest` per program; validation stays strict. 7. Tests with fakes per dialect.
8. Gate: Oran's PC + iPhone with Google and one other company.

## Rules learned the hard way (keep these)

1. Try every model; remember the one that worked; race slow ones. 2. Never refuse a code on a
format guess. 3. Oran's screenshots beat docs. 4. Diagnostics show in-flight requests.
5. Drills leave no trace. 6. Never report done without Oran's run on the buyer's device class.
7. Check a host's security headers and overlays. 8. Accept buyers' own names for things.
9. Toasts never block clicks; sheets never close on a stray click; focus without scrolling.
10. Example data never travels; always say what does. 11. Never hand Firebase an offline write
to send blindly; merge first. 12. An SDK's "local" view includes our unconfirmed writes: don't
treat it as the database's answer. 13. **After finishing one queued item, look at the queue
again: a listener may not fire twice for the same picture.** 14. **Anything that checks a key
inside the HTML can be read: don't build security on it.**

## Working with Oran

Architect and reviewer; the builder builds. Plain language, short numbered test steps. He
dictates: verify names. He tests by uploading `dist/*.html` and sends the support report and
screenshots; send him the built file every time. Brand: **DigiDoughnut** (D-O-U-G-H, no S).
Commit messages end with the Co-Authored-By / Claude-Session lines; push to `platform-phase-1`.
