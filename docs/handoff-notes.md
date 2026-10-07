# Notes for the handoff (running list)

Collected as decisions come up; folded into handoff.md later.

## AI companies beyond Google (decided 2026-10-07: noted, not built yet)

- The platform is built for more companies: each is a registry entry in `platform/js/dd.ai.js`
  plus an adapter ("plug"). Only the Google adapter exists today (launch lineup: Google only).
- **OpenAI-style adapter** (~1 day): covers OpenAI, DeepSeek, OpenRouter, Groq, Mistral, xAI and
  most newcomers. Recommended first, with OpenRouter as a hidden backup in case Google's free
  plan shrinks (Google's free Flash models were overloaded 2026-10-06/07).
- **Anthropic adapter** (~half a day): needs Anthropic's extra browser-access header.
- Before adding any company, check at build time: does it allow calls straight from a web page
  (CORS)? Free plan or paid only? How does it treat data (one-line privacy note in setup)?
- Paid-only companies (OpenAI, Anthropic, DeepSeek) go under "More options", never the default.

## Model rule (2026-10-07)

- Try every usable model until one answers (Flash / Flash-Lite alternating, newest first);
  remember the one that worked; re-fetch Google's list if all known models fail; new model names
  rank automatically. Also in the platform spec, section 3.1.

## Codes (2026-10-07)

- Never refuse a pasted code because of its format: Google decides. Format patterns are only a
  hint for which company a code belongs to.
- Since 2026-05-28 AI Studio creates only "auth keys" (start "AQ."); older "AIza" standard keys
  are being retired. Oran's AQ. key is proven from a web page (file, tiiny, iPhone) with the
  x-goog-api-key header on the native endpoint. Note: AQ. keys are reported NOT to work on
  Google's OpenAI-compatible endpoint, so keep using the native Gemini endpoint.
- Setup copy must not promise any code prefix.

## Phone pairing / QR (built 2026-10-07, pulled forward from Phase 5 at Oran's request)

- `platform/js/dd.pair.js` + vendored qrcode-generator. Link format `#dd=1~time~id~k<code>~d*<b64 JSON>`;
  code-only QR on a tiiny address is 41x41. Expires after 10 minutes, one-time id, removed from
  the address bar on arrival, works when re-scanned into an open tab.
- Still to do in Phase 5: sync details (s/f pieces), iPhone Home Screen hand-off, Firebase wizard.

## Phase 3, round 1 (2026-10-07)

- Code masking no longer depends on any company's format (Oran: OpenAI/Anthropic codes are
  coming, don't over-specify). The support report hides (1) every code saved in this browser,
  exactly, wherever it appears; (2) any 24+ character run mixing upper case, lower case and digits;
  (3) known prefixes and the usual carriers (key=, Bearer, x-api-key, the QR link's k piece).
- Google's code pattern is now a prefix hint only (AQ. / AIza). connect() asks Google about
  anything 10+ characters long; only shorter text is answered locally.
- dd.setup is in the build. Card on every program (opt out with `setup: false` in DD_PROGRAM).
  "Turn on the helper" wizard complete and tested (tests/setup_test.py, 68 checks).
- Oran's decisions: Firebase wizard waits for Phase 5 ("Coming soon" until then). Real
  iPhone+PC sync via QR passed. Gate tester comes at the end; for now Oran tests each round.

## Phase 3, round 2 (2026-10-07): "Put it on your phone"

- Oran's real run of round 1 passed (PC + iPhone).
- tiiny.host checked live 2026-10-07 (pricing page + Oran's logged-in dashboard): free plan =
  1 active project, 3 MB uploads, 5,000 visits/month, tiiny banner; link stays online while the
  owner logs in once every 3 months; a "Start your free trial" popup (Solo, turns paid after
  7 days) whose way out is "Skip"; projects have "Upload file" and "Update" (keeps the address).
  Logged-out sign-up and upload screens NOT seen yet: Oran to screenshot.
- Wizard: 6 screens. After upload, the buyer pastes the new address and one button opens it with
  the code + numbers carried in the link (dd.pair.makeLink with base + maxLink 60000), so nothing
  typed into the file version is lost. Hosted card row then offers "Send to my phone".
- OPEN, Oran's call: free plan holds ONE program per tiiny account (see reply 2026-10-07).

## Hosting findings (2026-10-07, later)

- **Neocities free plan is unusable**: it sends `connect-src 'self' data: blob:` (checked on
  digidoughnut.neocities.org), so the page can't reach Google, Firebase or the noticeboard. The
  helper reported "no internet". Its wizard is kept but parked (`setup.hostChoices = ["tiiny"]`).
- The platform now detects this: a `securitypolicyviolation` within 5 s of a failed request
  -> error type `host_blocked` ("The website hosting this page won't let the helper reach
  Google"), the model search stops at once, and the support report lists blocked addresses.
- Oran: GitHub Pages (the buyer's own free account) is to be the number one host. Next.
- GitHub Pages wizard built (first choice; tiiny second; Neocities parked). Buyer's own free
  account, repo `<username>.github.io`, address `https://<username>.github.io/<file>`, so every
  DigiDoughnut program they buy shares one address (and one helper code). Steps from GitHub docs
  2026-10-07; logged-out sign-up/new-repo/upload/Pages screens NOT yet seen: Oran to screenshot.
  Wizard checks the address is live (Pages allows reading its answers) before moving on.
  Mandatory 2FA applies to "contributors" (releases, apps, org owners), not a plain upload.
  GitHub's Pages terms forbid running an online business/SaaS on Pages; a buyer hosting a
  personal tool is most likely fine (grey area for business tools like Profit Coach).

## Setup Center, Oran's run of GitHub (2026-10-07, later)

- Oran named his repo "etsy" and made it Private first: Pages then shows "Upgrade or make this
  repository public to enable Pages" (fix: Settings > General > Danger Zone > Change visibility >
  Change to public > "I have read and understand these effects"). His site: digidoughnut.github.io/etsy/.
- Wizard now suggests repo name "digidoughnut" (address <user>.github.io/digidoughnut/<file>),
  lets the buyer type another name, warns Private won't work, and the wait screen has
  "GitHub shows a different address?" to paste what GitHub shows. Any repo on one account
  shares the origin <user>.github.io, so programs still share the helper code.
- Confirmed labels from Oran's screenshots: upload page "Drag files here to add them to your
  repository" / "choose your files" / "Commit changes"; empty repo "Quick setup" box with
  "uploading an existing file"; Pages: Source "Deploy from a branch", Branch "None" -> main,
  "/ (root)", Save; repo page "Deployments: github-pages" with a green tick when live.
- Chooser: "Easy to set up" / "Looks after itself" bars (GitHub 3/5 & 5/5, tiiny 4/5 & 2/5) and
  a third choice "My own website or another host" (general rules + address; the live helper
  gets hosting facts in its instructions for host-specific steps).
- Wizards are sticky (a click beside them doesn't close; ✕/Finish later/Esc do), show Continue
  once opened, have a moving picture + "Your turn" line per screen, and an always-open helper
  chat stuck to the bottom of the window.

## Phase 4: the helper with hands (2026-10-07, evening)

- Oran: the corner bubble isn't handy; WHERE the helper sits is a per-program choice and should
  be prominent. Name defaults to "Penny", changeable per program. Undo and saved chat: yes.
- New module `platform/js/dd.helper.js` (loads after dd.setup). Program contract:
  `helper: false | {name, face, role, greeting, place, slot}`, `tools[]` (now may carry
  `confirm` + `yesLabel`), `summarizeForAI(ctx)`, `knowledge`, `suggestions`.
  `place` = "side" | "inline" | "bubble" | "none", or `{computer, phone}` (default
  `{computer:"side", phone:"inline"}`; breakpoint 960 px; "side" on a narrow screen becomes
  "inline"; the chat moves live when the window crosses the line, keeping the conversation).
- Undo: every reply that changed data gets "↩ Undo" (snapshot before/after; last 5 kept in
  `dd_<id>_undo_v1`). If the buyer changed things since, a friendly confirm first.
- Big changes: a tool with `confirm` is NOT run by the AI; a Yes/No shows under the reply and only
  the buyer's tap runs it (no waiting inside the AI's 90 s budget). Questions expire on reload.
- Saved chat: `dd_<id>_chat_v1`, last 40 messages, "New chat" clears. Never in the QR, never
  synced; Privacy sheet says so. The AI gets the last 16 messages as plain text only (no old
  tool parts, so no thought-signature trouble), plus Undo/No notes.
- No code: the window shows "Penny needs a free access code" + "Turn on Penny"; asking opens
  the wizard (`setup.needAI`) and the typed question stays in the box.
- Try again (busy/timeout/etc.), "Fix my access code" (bad/blocked code), Stop while working.
- `dd.ctx()` exposed by core; `dd.helper.ask(text)` lets program buttons use the helper.
- aitest sets `helper: false` (it has its own test chat). Demo has 4 tools: add_item,
  set_done, remove_item, clear_list (confirm).
- Tests: `python3 tests/helper_test.py` → 64 checks (fake Google that calls the tools).
- Noticeboard: `master`'s notes.json replaced with the platform format, so Pages serves it.
- Restored three Phase 3 finishing touches that were in Oran's demo8 but never pushed: the
  wizard header icon + service tag, the grey "Step by step" box, and `pointer-events:none` on
  toasts. (Lesson: before a handoff, diff the last file sent to Oran against the repo build.)
- Host banners: tiiny.host lays a ~42 px "Shared with tiiny.host" bar across the bottom (Oran's
  screenshot), which covered Penny's message box. `dd.ui.measureHostBars` finds any full-width
  fixed bar at the top/bottom edge that isn't ours and sets `--dd-host-top/--dd-host-bottom`;
  the side column, bubble, corner button, toasts and page padding use them. Re-measured at
  load, 0.5-10 s, on resize, and when the host adds elements. Logged in the support report.
- QR: Oran expected his list to come across. It didn't because it was EXAMPLE data (never sent).
  The QR sheet now always says what it carries and why anything stays behind (example data,
  or too big for one square -> step 4 will move it). Programs name their data with
  `dataLabel` (demo: "list").
- Slow Penny on Oran's iPhone (tiiny, 2026-10-07 2:48 PM): three models in a row gave NO answer
  for 12 s each, then gemini-flash-lite-latest answered in 2.8 s (39.6 s turn). dd.ai.chat now
  RACES: a model silent for `limits.hedge` (6 s) gets the next model asked alongside it (up to
  3 at once); the first answer wins, the rest are cancelled (`inflight` list; Stop aborts all).
  The winner is remembered and asked first next time. Logged as "also asking <model>".
  connect() is still sequential (12 s per model). helper_test: 79 checks.

## Phase 5: keep devices in step (2026-10-07, late afternoon) — engine built, wizard provisional

- Oran's calls: **anonymous sign-in** (not open rules: Google emails buyers an "insecure rules"
  warning for open rules); **backup/restore in this phase** (safety net if sync mangles data).
- New `platform/js/dd.sync.js` (after dd.helper). Firebase Realtime Database + Authentication
  (Anonymous), SDK 12.19.0 by `import()` from gstatic (13.0.0 shipped 2026-10-07; wait).
  Setup code shared per web address `dd_firebase_config_v1`; per program `dd_<id>_sync_id_v1`
  (32 hex), `dd_<id>_sync_on_v1`, `dd_<id>_sync_base_v1` (base + unconfirmed paths).
  Ledger `/sync/<program>/<ledger>`: `meta/{v,schema}`, `lists/<name>/order` ("o:" + ids),
  `lists/<name>/items/<id>` = the item's JSON TEXT (Firebase drops nulls/empties and mangles
  arrays; sealed text comes back exactly), `fields/<key>` = JSON text. Default split: top-level
  arrays whose items all have a string id are lists; programs can give `sync:{toParts,fromParts}`
  or `sync:false`. Keys escaped (. # $ [ ] / % ,).
- Three-way merge per path (base / this device / database): untouched here -> take theirs;
  changed here -> keep ours and push. First join: union by id, database wins the same id, this
  device's extras go last. Paths sent but not yet confirmed are kept on the device ("pend"), so a
  change made offline survives a reload (the SDK forgets unsent writes on close). Echoes are
  no-ops by content. Example data never travels; an empty database never replaces example data.
  Schema: a newer `meta/schema` stops this device ("Update needed"); an older one is migrated.
- QR: pieces `s` (ledger) and `f` (setup code, hidden from the "came across" toast). With sync
  on, the `d` piece is left out and the sheet says the list comes through live sync. A pairing
  link in the address delays the resume so the phone joins the scanned ledger.
- Header chip: In step / Offline / Connecting… / Not in step / Update needed; tap = sheet
  (Add my phone, Try again, Turn off on this device). Setup step 4: wizard, then "Settings".
- Rules (`dd.sync.rules`, shown in the wizard): signed-in only, 32-char ledgers, only the
  shapes above. RTDB regex has no {n}: use `$ledger.length == 32`.
- Wizard `setup.wizards.sync` is PROVISIONAL: 8 screens written from Firebase docs, not yet
  checked against Oran's screenshots (rule 3). Database is made BEFORE the web app is
  registered so the config includes databaseURL; parseConfig guesses
  `https://<projectId>-default-rtdb.firebaseio.com` when it's missing ("address guessed" in the
  report). Labels go through L() keys `fb_*`.
- New `platform/js/dd.backup.js`: footer "Backup" -> "Your <dataLabel>" sheet. Download
  `<program-name>-backup-YYYY-MM-DD.json` ({dd:1, kind:"backup", program, schemaVersion, data});
  restore checks program, version (older migrated, newer refused), validateData, asks first,
  offers Undo; it's a replaceData so sync carries it. Example data can't be backed up.
- New error types: sync_config, sync_auth, sync_rules, sync_offline, sync_newer, sync_file,
  backup_bad. Privacy sheet updated (own Google account, secret address, signs in; backups).
- Tests: `tests/fakefirebase.py` (HTTP + server-sent events fake RTDB with the same rules,
  anonymous sign-in, pending-write behaviour like the SDK, `window.__fakeNet(false)` = offline)
  and `tests/sync_test.py` → 78 checks, two contexts (computer + iPhone 13): phone->computer
  (the POC's unsolved bug), both ways, offline both sides, offline change + reload, undo/clear,
  backup/restore through sync, newer version, friendly errors, file://.
- STILL TO DO: Oran's screenshots -> verify/fix the wizard + pictures; Oran's PC + iPhone run on
  github.io with his real Firebase project; watch his inbox a few days for any Firebase rules
  email (we expect none with auth != null, but it's unverified).
