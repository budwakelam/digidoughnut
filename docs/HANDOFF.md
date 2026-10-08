# DigiDoughnut Platform: Handoff (end of Phase 5, start of Phase 6 "Connect your AI agent")

Written 2026-10-07 (evening). Read this first, then `docs/handoff-notes.md` (running log, newest
at the bottom), then the spec `digidoughnut-platform-spec-2026-10-06.md` (claude.ai Project).
Anything marked "Oran's call" is his: ask, don't decide.

## Where everything is

- Repo `budwakelam/digidoughnut`, branch **`platform-phase-1`**. `master` = original POC +
  the live noticeboard (`noticeboard/notes.json`, served by GitHub Pages).
- Build: `node build.mjs` → `dist/<program>.html`. Rebuild after committing (the support report
  shows the commit). Before a handoff, diff the last file sent to Oran against the repo build.
- Tests (headless Chromium, fakes only): `platform_test.py` 110 · `ai_test.py` 61 ·
  `setup_test.py` 200 · `helper_test.py` 79 · `sync_test.py` 90 ·
  `QR_DECODER=<node jsqr+pngjs script> pair_test.py` 22. Ignore Playwright's `CancelledError`
  noise; the last line is the verdict. The QR decoder is 6 lines of node (jsqr + pngjs).
- Files sent to Oran: demo11 (sync, passed both ways on his PC + iPhone, tiiny), demo12 (wizard
  from his screenshots, short rules), **demo13** (newest edit wins, held offline changes,
  reconnect nudge) — demo12 and demo13 not yet run by Oran.
- Oran's Firebase test project: "etsy" (etsy-d95c1), Spark plan, Realtime Database us-central1,
  Anonymous sign-in on, short rules published.

## Modules (platform/js, load order in build.mjs)

dd.core · dd.store · dd.errors · dd.ui · dd.diag · dd.pair · dd.ai · dd.notes · dd.setup ·
dd.helper · **dd.sync · dd.backup (Phase 5)**. Next: **dd.agent** (Phase 6).

## Phase 5: what was built

- **dd.sync**: Firebase Realtime Database + Anonymous sign-in (Oran's call, so Google doesn't
  email buyers an "insecure rules" warning). SDK 12.19.0 by `import()` from gstatic (13.0.0
  shipped 2026-10-07; wait for it to settle). Setup code shared per web address
  (`dd_firebase_config_v1`), one ledger per program (`/sync/<program>/<32-hex id>`).
  Each item travels as sealed JSON text; `times/<path with |>` holds Firebase-clock edit times.
- **Merging** (three-way, per item): untouched here → take theirs; changed here → keep ours;
  **both changed → the newer edit wins** (Oran 2026-10-07, option a; Firebase's clock via
  `.info/serverTimeOffset`; no time = this device wins). First join: union by id, database wins.
- **Offline**: changes are HELD on the device (not handed to Firebase's queue, which would send
  them blindly on reconnect and overwrite a newer edit). On reconnect: read the database
  (`get`), merge by time, then send. Held/unconfirmed changes survive a reload. Reads older
  than our last write are ignored. Firebase shows our sent-but-unconfirmed writes as if stored:
  only HELD changes may be forgotten when they match the database.
- **Phone joins by scan**: QR pieces `s` (ledger) + `f` (setup code). With sync on the list
  isn't put in the QR; the sheet says it comes through live sync.
- **Header chip** In step / Offline / Connecting… / Not in step / Update needed → sheet.
  **Reconnect nudge** when a phone page comes back from the background.
- **Stale sign-in heals**: if the database says no, sign out, sign in afresh, try once (≤1/min).
- **Setup step 4 wizard**: screens checked against Oran's screenshots (see the comment above
  `setup.wizards.sync`); the create-project screens are still unseen. Short rules
  (`dd.sync.rules`): signed-in + 32-char ledger only.
- **dd.backup**: footer "Backup" → download `<name>-backup-YYYY-MM-DD.json`, restore with checks
  (program, version, validateData), confirm, Undo; restore syncs like any change.

## Decisions log (Oran) — Phase 5

| Topic | Decision |
| --- | --- |
| Sync security | (b) Anonymous sign-in, not open rules |
| Backup/restore | Build in Phase 5 |
| Rules length | Short (his POC had 11 lines; 46 was excessive) |
| Same item changed on two devices | (a) Newest edit wins (whole item) |
| iPhone background | Expected: syncs when the page is open again; nudge added |

## Phase 5: still open

1. Oran's run of demo13: offline on both devices incl. the same-item case; backup → clear →
   restore → Undo; upload over the old file and check sync resumes with no questions.
2. Screenshots of Firebase's create-project screens (name, Gemini / Analytics switches).
3. Watch the "etsy" project's inbox for a few days for any Firebase "insecure rules" email.
4. Pictures for the sync wizard screens (the hero/done ones exist; console mock-ups are simple).
5. Tombstones: `times/` entries for deleted items stay in the database (~60 bytes each). Prune
   ones older than ~60 days if a program deletes a lot.

---

## Phase 6: Connect your AI agent (to plan, then build)

**Oran's ask (2026-10-07):** "add a fourth setup option: connect an agent like Muse or Dots or
Grokbots." The setup card already has four steps, so this is probably a fifth, optional step
("Connect your AI agent"). **Oran's call:** its place and wording.

### What these agents are (checked 2026-10-07, from news coverage, not their docs)

| Agent | Who | Launched | Access | How it reaches other things |
| --- | --- | --- | --- | --- |
| Muse | Meta | announced 2026-09-08 | US first (iOS, Android, web, WhatsApp); free + paid tiers | its own cloud computer and browser (navigates sites, fills forms); writes custom connectors for services with an API or CLI |
| Dots | OpenAI | announced 2026-09-29 | ChatGPT Pro / Business Premium first | its own cloud computer and browser; "4,000+ apps" through its plugin ecosystem; Slack and Teams |
| Grok Bot | xAI | ~Aug 2026, with Grok 4.6 | desktop + mobile app; pricing still settling | plugin panel (Gmail, Drive, Calendar, Slack, Notion…); its own cloud computer with browser, files and terminal; "teach a task" |

None of the coverage mentions MCP or a way for an outside website to register itself. Every
one of them has **its own cloud browser**. Oran is in Canada: Muse may not be available to him.
**First job: verify with Oran which agents he can actually use, and take screenshots.**

### The core problem

The program's data lives in each browser's storage. An agent's cloud browser is just another
device, with empty storage. So an agent can only see and change the buyer's data the same way the
phone does: **by joining live sync**. Step 4 (sync) is therefore a prerequisite for step 5.

### Proposed design (for Oran to approve)

1. **Agent link**: like the phone QR (`dd.pair.makeLink`), carrying `s` + `f` (and optionally
   `k`, so Penny works for the agent too). Unlike the phone QR it can't expire in 10 minutes or
   be single-use: an agent may open it hours later, and some agents start a fresh browser for
   every task. **Oran's call:** lifetime (forever until revoked? 30 days?) and whether the access
   code goes in it.
2. **Instructions card**: a "Copy instructions for my agent" button that produces a short
   plain-text brief to paste into Muse / Dots / Grok Bot: what the program is, the link, what it
   may do, what it must ask the buyer first. Generated from `DD_PROGRAM` (name, knowledge, tools).
3. **Agent panel** (`#agent` or `?agent=1` on the link): a plain, stable section of the page made
   for a browsing agent: the current data as text (`summarizeForAI`) and one simple form per
   program tool (`DD_PROGRAM.tools`: name, description, labelled inputs, a button), with clear
   result messages. It reuses the contract Penny already uses, so every program gets it free.
   Also `window.dd.agent.call(name, args)` for agents that can run page scripts.
4. **Big changes** (tools with `confirm`, e.g. "Clear the list"): today only the buyer's tap runs
   them. **Oran's call:** agents can't run them at all / they run but leave an Undo notice / they
   wait for the buyer to approve on their own device.
5. **Revoking**: everyone with the ledger id has full access. "Disconnect my agent" = move this
   program to a new ledger and re-join the buyer's own devices (one QR scan). Say so plainly.
6. **Support report**: an "Agent" section (link made, panel opened, tool calls, last result).
7. **Privacy sheet**: what the agent company receives (the buyer's data, via the agent's
   browser), in plain words, as with the Google note for Penny.

### Not proposed (yet)

- **MCP server / API connector**: needs a server DigiDoughnut runs (e.g. a small Cloudflare
  Worker), which breaks the "no backend" design. Possible later; Oran's call.
- **Agents talking to Firebase directly** (REST + anonymous sign-in): Muse might write such a
  connector itself, but it bypasses the program's checks (validateData). Only if browsing fails.

### Build order

1. With Oran: which agents he has; can each one's browser open a github.io page, keep storage
   between tasks, click buttons, read page text, run scripts? (Screenshots beat docs.)
2. `dd.agent` module: agent link, instructions card, agent panel, `window.dd.agent`, diag.
3. Setup step 5 + wizard (same engine, pictures, "Your turn", helper chat).
4. Tests: a fake "agent" browser context that opens the link, uses the panel, and the buyer's
   device sees the change through sync.
5. Gate: Oran's real agent changes his list and his PC + iPhone show it.

## Rules learned the hard way (keep these)

1. Try every model; remember the one that worked; race slow ones. 2. Never refuse a code on a
format guess. 3. Oran's screenshots beat docs. 4. Diagnostics show in-flight requests.
5. Drills leave no trace. 6. Never report done without Oran's run on the buyer's device class.
7. Check a host's security headers and overlays. 8. Accept buyers' own names for things.
9. Toasts never block clicks; sheets never close on a stray click; focus without scrolling.
10. Example data never travels; always say what does. 11. **Never hand Firebase an offline write
to send blindly; merge first.** 12. **An SDK's "local" view includes our unconfirmed writes:
don't treat it as the database's answer.**

## Working with Oran

Architect and reviewer; the builder builds. Plain language, short numbered test steps. He
dictates: verify names. He tests by uploading `dist/*.html` and sends the support report and
screenshots; send him the built file every time. Brand: **DigiDoughnut** (D-O-U-G-H, no S).
Commit messages end with the Co-Authored-By / Claude-Session lines; push to `platform-phase-1`.

Sources for the agent table: businesstoday.in and yourstory.com (Dots, 2026-09-29/30),
therundown.ai and pbs.org (Muse, 2026-09-08), mindstudio.ai and aiweekly.co (Grok Bot).
