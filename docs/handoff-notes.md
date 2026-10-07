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
