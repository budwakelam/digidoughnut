# DigiDoughnut Platform: Handoff (end of Phase 2, start of Phase 3)

Written 2026-10-07. For the next builder session. Read this first, then the two source docs:
1. "DigiDoughnut Platform — Build Plan v1" (Oran's attached plan, 2026-10-06)
2. `digidoughnut-platform-spec-2026-10-06.md` (in the claude.ai Project; includes section 3.8, the
   Setup Center spec, and the model rule in 3.1)
Where they conflict: the plan wins, then this handoff's decisions log. Anything marked "Oran's call"
is his: ask, don't decide.

## Where everything is

- Repo `budwakelam/digidoughnut` (public), branch **`platform-phase-1`**. Default branch `master`
  still holds only the original POC. Nothing merged yet.
- Build: `node build.mjs` (no dependencies) → `dist/<program>.html`, one self-contained file each.
- Tests (headless Chromium via Playwright; all against fakes, never real Google):
  - `python3 tests/platform_test.py` → 110 checks (desktop + emulated iPhone, file + hosted)
  - `python3 tests/ai_test.py` → 60 checks (fake Google: busy, silent, retired, quotas, new models)
  - `QR_DECODER=<node script using jsqr+pngjs> python3 tests/pair_test.py` → 22 checks (QR made,
    read back from a screenshot, opened on an emulated iPhone)
  - Run all three before every push. Emulation is never the gate: Oran tests on his iPhone.
- Programs: `programs/demo` (tiny list), `programs/aitest` (internal AI gate page, never sold).
- Profit Coach POC: `profit-coach/index.html` (sync reload fix applied, see Phase 0).

## Platform modules (platform/js, load order in build.mjs)

| Module | Job | State |
| --- | --- | --- |
| dd.core | boot, events, device detection, program contract, example-data notice | done |
| dd.store | storage names, data envelope, schema upgrades, recovery copy | done |
| dd.errors | 7 friendly AI error types + storage types, masked support log | done |
| dd.ui | frame, footer + Privacy sheet, status, notices, sheets, confirm, toast | done |
| dd.diag | triple-click footer support report (codes masked) | done |
| dd.pair | "Send to my phone" QR (vendored qrcode-generator, MIT) | done (sync pieces in Phase 5) |
| dd.ai | Google adapter, model rule, timeouts, Stop, drills, speed check | done (Google only) |
| dd.notes | weekly noticeboard: help links, labels, notice, model hints, code patterns | done; needs GitHub Pages on |
| dd.setup | Setup Center + wizards | **DRAFT, not in build.mjs yet** (see Phase 3) |

## Phase status

- **Phase 0 (POC sync bug):** root cause found: POC never remembered "sync on", so any reload
  silently stopped syncing; plus a timestamp gate that could drop real updates. Fixed in
  `profit-coach/index.html`, approved by Oran on code review. Headless two-device test 8/8.
  **Real iPhone+PC sync confirmation not reported yet.** Ask Oran before Phase 5.
- **Phase 1 (skeleton):** passed. Demo on tiiny.host, iPhone (Chrome) and Windows Chrome.
- **Phase 2 (AI layer):** passed 2026-10-07. Desktop (file + tiiny) and iPhone (via QR) with
  Oran's real AQ. code, while Google's gemini-3.8-flash was overloaded: fallback to Flash-Lite
  answered in ~1 s. Google only (Oran's decision).
- **Pulled forward from Phase 5 at Oran's request:** QR pairing of the AI code (+ small data).
- **Phase 3 (Setup Center):** started. `platform/js/dd.setup.js` is a first draft written to
  spec 3.8: card/chip with 4 self-ticking steps, wizard engine (screens as data, progress,
  Back/Next, Start over, I'm stuck, Finish later, resume), scripted Q&A bank + live AI once the
  code works, and the full "Turn on the helper" wizard (7 screens). NOT yet: added to build.mjs,
  CSS, tests, the tiiny.host wizard, the Firebase wizard. Untested. Review it before building on it.

## Decisions log (Oran)

| Topic | Decision |
| --- | --- |
| Assembly script | Yes (developer-only; buyer gets one file) |
| Repo | Stays public for now (Render); obfuscate at ship time |
| AI companies at launch | **Google only.** Adapter stays provider-agnostic. Others noted for later (below) |
| Noticeboard file | **Yes**: help links, one-line notices, model hints, **label corrections**. Must be disclosed in plain words (done: footer → Privacy). Never carries API addresses |
| Wizard chat | Phase 3 has a live AI chat inside the wizard; Penny's hands come in Phase 4, same window |
| tiiny.host step | Gets the full wizard treatment |
| Region answer | US for Canada/US, Belgium (europe-west1) for UK. **Confirm against Firebase's live list at build time** |
| Setup spec | Section 3.8 (popup wizard, one action per screen, exact labels, "you can ignore this", start over, resumable, scripted-then-live help) |
| One-page product | Every program ships as a single HTML file. Non-negotiable |

## Rules learned the hard way (2026-10-07) — keep these

1. **Model rule:** try EVERY usable model until one answers (Flash/Flash-Lite alternating, newest
   first); remember the one that worked and try it first next time; if all known models fail,
   re-fetch Google's list once (new models). 12 s per model while others remain, 90 s per message,
   Stop always visible. Only wrong code / blocked code / offline / Stop end the search early.
   Google overloads whole families ("503 high demand", gemini-3.6–3.8 Flash in Sept–Oct 2026).
2. **Never refuse a code on a format guess.** Google decides. Patterns only hint which company.
3. **Codes:** AI Studio has created only "auth keys" (AQ.…) since 2026-05-28; old AIza keys are
   being retired. AQ. keys work from the browser on the native endpoint with the
   `x-goog-api-key` header (proven). Reported NOT to work on Google's OpenAI-compatible endpoint.
   Setup copy must not promise any prefix.
4. **Verify against live sources before designing**, and design failure paths exhaustively. The
   first three Phase 2 attempts failed in front of Oran because of untested assumptions.
5. **Diagnostics must show in-flight requests** ("waiting for Google"), not only finished ones.
6. **Test drills must leave no trace** in real state.
7. Never report a feature done without Oran's run on the buyer's device class.

## Open items

- **GitHub Pages** for the noticeboard: repo Settings → Pages → branch `platform-phase-1`
  (until merged). Until then the support report shows "noticeboard · Load failed" (harmless).
- **Google AI Studio button labels** in the helper wizard come from Google's docs ("Create API
  key", "API Keys", "Copy"). Couldn't check the logged-in screens: walk it once with Oran's
  account, then correct via `labels` in `noticeboard/notes.json`.
- Timeout message says "Tap Try again": the real helper's Try again button arrives in Phase 4.
- Privacy wording in the footer Privacy sheet: shown to Oran, not formally approved.
- Plan decisions still open: #5 Undo (Phase 4), #6 save chat (Phase 4), #7 code in QR in
  production (built as on-by-default with warning + switch; confirm), #8 anonymous sign-in
  (Phase 5), #10 picture-guide site, #11 privacy/terms (UK/EEA, 18+, consumer use) before listing.
- **Other AI companies (noted, not built):** OpenAI-style adapter (~1 day) covers OpenAI,
  DeepSeek, OpenRouter, Groq, Mistral, xAI; recommended first, with OpenRouter as a hidden backup.
  Anthropic adapter (~½ day, needs its browser-access header). Check CORS, free/paid, privacy per
  company at build time. Paid-only companies go under "More options".

## Next steps (Phase 3)

1. Review `dd.setup.js`; add to `build.mjs` after dd.notes; add CSS (card, chip, steps, wizard,
   dots, ask box, chips) to `dd.ui.css`; call `dd.setup.start(program)` from `dd.start`.
2. Tests: card ticks itself, fold/unfold, resume mid-wizard, Start over, I'm stuck, scripted
   answers for every 3.8 question, live answer when connected (fake Google), connect inside the
   wizard, phone warning, just-in-time `dd.setup.needAI()`.
3. tiiny.host wizard ("Put it on your phone"): verify tiiny's current screens and limits first;
   ends with "bookmark this address and always use it" and then Send to my phone.
4. Firebase wizard: build in Phase 3 or with sync in Phase 5 (sync engine is Phase 5). Ask Oran.
5. Gate (plan): a non-technical tester finishes "Turn on the helper" unaided in under 5 minutes.

## Working with Oran

- He's the architect and reviewer; the builder builds. Plain language, short test steps,
  numbered. He tests by uploading `dist/*.html` to tiiny.host and sending the footer support
  report (triple-tap). Send him the built file directly every time.
- Brand: **DigiDoughnut**, one word, D-O-U-G-H, no S.
- Commit messages end with the Co-Authored-By / Claude-Session lines; push to `platform-phase-1`.
