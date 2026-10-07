"""Phase 3 tests: the Setup Center (dd.setup) and code masking, in headless Chromium.

    node build.mjs && python3 tests/setup_test.py

Runs the demo program against a FAKE Google. Proves our side only: the Phase 3 gate is Oran
(and later a non-technical tester) walking the real wizard against Google's real screens.
"""
import json, os, threading, http.server, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist")
SHOTS = os.path.join(ROOT, "tests", "screenshots")
os.makedirs(SHOTS, exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=DIST))
threading.Thread(target=srv.serve_forever, daemon=True).start()
HOSTED = f"http://127.0.0.1:{srv.server_address[1]}/demo.html"
FILE = "file://" + os.path.join(DIST, "demo.html")
NOTES_URL = "https://budwakelam.github.io/digidoughnut/noticeboard/notes.json"
GOOD = "AQ.Ab8RN6TESTfake0123456789abcdefGHIJKLmnop"   # fake, shaped like a new Google auth key

class FakeGoogle:
    """Just enough of Google's Gemini API for the wizard: list models, the tool test, a text answer."""
    def __init__(self): self.asked = []
    def handle(self, route):
        req = route.request; cors = {"Access-Control-Allow-Origin": "*"}
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers={**cors, "Access-Control-Allow-Headers": "content-type,x-goog-api-key", "Access-Control-Allow-Methods": "GET,POST"})
        def ok(body): route.fulfill(status=200, content_type="application/json", headers=cors, body=json.dumps(body))
        if req.headers.get("x-goog-api-key") != GOOD:
            return route.fulfill(status=400, content_type="application/json", headers=cors, body=json.dumps({"error": {"code": 400, "status": "INVALID_ARGUMENT",
                "message": "API key not valid. Please pass a valid API key.", "details": [{"reason": "API_KEY_INVALID"}]}}))
        if req.url.split("?")[0].endswith("/models"):
            return ok({"models": [{"name": "models/gemini-3.8-flash", "supportedGenerationMethods": ["generateContent"]},
                                  {"name": "models/gemini-3.1-flash-lite", "supportedGenerationMethods": ["generateContent"]}]})
        body = json.loads(req.post_data or "{}")
        if "toolConfig" in body:
            return ok({"candidates": [{"content": {"role": "model", "parts": [{"functionCall": {"name": "confirm_ready", "args": {"word": "ready"}}}]}}]})
        self.asked.append(body)
        return ok({"candidates": [{"content": {"role": "model", "parts": [{"text": "LIVE: pick any name you like."}]}}]})
G = FakeGoogle()

results = []
def check(name, ok, extra=""):
    results.append(bool(ok)); print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({extra})" if extra and not ok else ""))

with sync_playwright() as p:
    b = p.chromium.launch()
    def fresh(url=HOSTED, device=None):
        ctx = b.new_context(**(device or {}))
        ctx.route("https://generativelanguage.googleapis.com/**", G.handle)
        ctx.route("https://neocities.org/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<title>Neocities</title>"))
        ctx.route("https://tiiny.host/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<title>tiiny.host</title>"))
        ctx.route(NOTES_URL, lambda r: r.fulfill(status=404, body="", headers={"Access-Control-Allow-Origin": "*"}))
        page = ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" and "404" not in m.text and "400" not in m.text else None)
        page.goto(url); page.evaluate("() => localStorage.clear()"); page.reload()
        return ctx, page, errs
    wiz_step = lambda page: page.inner_text(".dd-wiz-progress")
    def ask(page, q):
        n = page.locator(".dd-ask-msg.bot:not(.pending)").count()
        page.fill("#dd-ask-in", q); page.click("#dd-ask-go")
        page.wait_for_function(f"() => document.querySelectorAll('.dd-ask-msg.bot:not(.pending)').length > {n}", timeout=15000)
        return page.locator(".dd-ask-msg.bot:not(.pending)").last

    # ---------------------------------------------------------------- masking
    print("\n== codes are hidden from the support report, any format ==")
    ctx, page, errs = fresh()
    samples = {
        "Google auth key (AQ.)": "AQ.Ab8RN6LxyzQ0123456789abcdefGHIJKLmnopqrstuv",
        "older Google key (AIza)": "AIzaSyD0123456789abcdefghijklmnopqrstuv",
        "OpenAI-style key": "sk-proj-Abc123DEF456ghi789JKL012mno345PQR678stu",
        "Anthropic-style key": "sk-ant-api03-Abc123DEF456ghi789JKL012mno345PQR678-xyz_AA",
        "unknown format, mixed case": "Zq7Lm2Np9Rs4Tv6Wx8Yb1Cd3Ef5Gh0Jk",
    }
    for label, code in samples.items():
        out = page.evaluate("(c) => { dd.errors.record('test', 'Google said: ' + c + ' failed'); return dd.diag.text(); }", code)
        check(f"{label}: hidden", code not in out and code[6:20] not in out, out[:200])
    keep = ["gemini-3.8-flash-lite-preview-09-2026", "API key expired. Please renew", "2026-10-07T16:21:00.000Z", "HTTP 503 UNAVAILABLE"]
    out = page.evaluate("(k) => { k.forEach(t => dd.errors.record('test', t)); return dd.diag.text(); }", keep)
    for k in keep: check(f"left alone: {k[:30]}", k in out)
    # A saved code in a format nobody has seen (all lower case, so no pattern can catch it).
    odd = "zzlowercaseonlycodenoonehasseen99"
    page.evaluate("(c) => localStorage.setItem('dd_ai_connections_v1', JSON.stringify({ main: { provider: 'google', code: c } }))", odd)
    out = page.evaluate("(c) => { dd.errors.record('test', 'echo ' + c); return dd.diag.text(); }", odd)
    check("a saved code is hidden even in a format no pattern knows", odd not in out, out[-300:])
    out = page.evaluate("() => { dd.errors.record('pair', location.origin + '/demo.html#dd=1~abc~xyz~kAQ.secretSecret123~d*eyJ9'); return dd.diag.text(); }")
    check("the code piece of a phone link is hidden", "secretSecret123" not in out)
    page.evaluate("() => localStorage.clear()")
    check("no page errors", not errs, errs)
    ctx.close()

    # ---------------------------------------------------------------- the card
    print("\n== setup card ==")
    ctx, page, errs = fresh(FILE)
    check("card shows on first visit", page.locator(".dd-setup-card").is_visible())
    check("four steps", page.locator(".dd-step").count() == 4)
    check("opened as a file: 1 of 4 done (Try it)", "1 of 4" in page.inner_text(".dd-setup-count"), page.inner_text(".dd-setup-count"))
    check("only sync says Coming soon (Phase 5)", page.locator(".dd-step >> text=Coming soon").count() == 1)
    check("phone step can be started from the file", page.locator("[data-start=host]").inner_text() == "Start")
    ctx.close()
    ctx, page, errs = fresh(HOSTED)
    check("hosted: 2 of 4 done (Try it + on a web address)", "2 of 4" in page.inner_text(".dd-setup-count"), page.inner_text(".dd-setup-count"))
    page.click("#dd-setup-fold")
    check("Hide this for now folds it to a chip", page.locator("#dd-setup-chip").is_visible() and page.locator(".dd-setup-card").count() == 0)
    page.reload()
    check("stays folded after reload", page.locator("#dd-setup-chip").is_visible())
    page.click("#dd-setup-chip")
    check("chip unfolds the card", page.locator(".dd-setup-card").is_visible())

    # ---------------------------------------------------------------- the helper wizard
    print("\n== Turn on the helper ==")
    page.click("[data-start=ai]")
    check("wizard opens at step 1 of 7", wiz_step(page) == "Step 1 of 7", wiz_step(page))
    check("says Google calls it an API key", "Google calls this an API key" in page.inner_text(".dd-wiz-body"))
    check("no phone warning on a computer", page.locator(".dd-wiz-body .warn").count() == 0)
    check("no Start over on the first screen", page.locator("[data-over]").count() == 0)
    page.click("[data-next]"); page.click("[data-next]")
    check("Next moves on (step 3)", wiz_step(page) == "Step 3 of 7")
    check("Start over shown from step 2 on", page.locator("[data-over]").is_visible())
    check("'You can ignore' said out loud", "You can ignore" in page.inner_text(".dd-wiz-body"))
    page.click("[data-stuck]")
    check("I'm stuck shows fixes for this screen", "18 or older" in page.inner_text("#dd-wiz-stuck"))
    page.click("[data-later]")
    check("Finish later closes the wizard", page.locator(".dd-wiz").count() == 0)
    check("card button now says Continue", page.locator("[data-start=ai]").inner_text() == "Continue")
    page.reload(); page.click("[data-start=ai]")
    check("resumes at step 3 after a reload", wiz_step(page) == "Step 3 of 7", wiz_step(page))
    page.click("[data-over]")
    check("Start over goes back to step 1", wiz_step(page) == "Step 1 of 7")
    page.keyboard.press("Escape")
    check("Escape closes it too (never trapped)", page.locator(".dd-wiz").count() == 0)
    check("opened and left on screen 1: says Continue (Oran)", page.locator("[data-start=ai]").inner_text() == "Continue")
    page.click("[data-start=ai]")
    page.mouse.click(5, 5)
    check("a click beside the wizard does NOT close it", page.locator(".dd-wiz").count() == 1)
    check("...and says how to close it", "Finish later" in page.inner_text(".dd-toast"))
    page.click(".dd-wiz-x")
    check("the ✕ button closes it, place kept", page.locator(".dd-wiz").count() == 0 and page.locator("[data-start=ai]").inner_text() == "Continue")
    check("setup card rows have friendly icons", page.locator(".dd-step-icon").count() == 4)

    print("\n== pictures and 'Your turn' on every screen ==")
    for wid in ["ai", "host_github", "host_tiiny"]:
        n = page.evaluate("(w) => dd.setup.wizards[w].screens.length", wid)
        missing = []
        for i in range(n):
            page.evaluate("([w, i]) => { const s = JSON.parse(localStorage.getItem('dd_demo_setup_v1') || '{}'); s.wizards = s.wizards || {}; s.wizards[w] = { at: i }; localStorage.setItem('dd_demo_setup_v1', JSON.stringify(s)); dd.setup.open(w); }", [wid, i])
            has_pic = page.locator(".dd-wiz .dd-pic").count() == 1
            has_todo = page.locator(".dd-wiz .dd-todo").count() == 1 or page.locator(".dd-wiz .dd-pic--done").count() == 1
            if not (has_pic and has_todo): missing.append(i + 1)
            if wid == "host_github" and i == 4: page.screenshot(path=os.path.join(SHOTS, "pic-github-upload.png"))
            if wid == "ai" and i == 4: page.screenshot(path=os.path.join(SHOTS, "pic-ai-copy.png"))
            page.keyboard.press("Escape")
        check(f"{wid}: every screen has a picture and a 'Your turn' line", not missing, f"missing on screens {missing}")
    page.evaluate("() => localStorage.removeItem('dd_demo_setup_v1')"); page.reload()

    print("\n== scripted answers (before the code works) ==")
    page.click("[data-start=ai]"); page.click("[data-ask]")
    bank = {"Is it really free?": "free", "Do I need a credit card?": "No credit card",
            "What do I name the project?": "Anything you like", "Which region should I pick?": "United States",
            "Locked mode or test mode?": "locked mode", "Where do I find the setup code?": "firebaseConfig",
            "What exactly do I paste?": "Copy the whole thing", "What if I make a mistake?": "Nothing can break"}
    for q, want in bank.items():
        m = ask(page, q)
        check(f"'{q}' answered", want in m.inner_text() and "live" not in m.get_attribute("class"), m.inner_text())
    check("project name answer uses the program's name", "My Demo List" in ask(page, "what do I call the project").inner_text())
    m = ask(page, "what colour is the sky")
    check("no match: points to I'm stuck, doesn't guess", "I'm stuck" in m.inner_text())
    check("says these are ready-made answers, not the AI", "ready-made answers" in page.inner_text("#dd-wiz-ask"))
    page.click(".dd-chip >> nth=0")
    page.wait_for_timeout(200)
    check("question chips work", page.locator(".dd-ask-msg.me").last.inner_text() == "Is it really free?")
    check("scripted guide never called Google", not G.asked)

    print("\n== connect inside the wizard ==")
    for _ in range(5): page.click("[data-next]")
    check("reached the paste screen (step 6)", wiz_step(page) == "Step 6 of 7")
    check("no Next on the paste screen (Connect is the way on)", page.locator("[data-next]").count() == 0)
    page.click("[data-action]")
    check("empty box: asks to paste first", "Paste your code" in page.inner_text("#dd-wiz-status"))
    page.fill("#dd-wiz-code", "AQ.WRONGwrong0123456789abcdefGHIJKLmnop")
    page.click("[data-action]")
    page.wait_for_function("() => document.getElementById('dd-wiz-status').className.includes('err')", timeout=15000)
    check("wrong code: friendly error, stays on the screen", "That code didn't work" in page.inner_text("#dd-wiz-status") and wiz_step(page) == "Step 6 of 7")
    page.fill("#dd-wiz-code", "  " + GOOD + "\n")
    page.press("#dd-wiz-code", "Enter")
    page.wait_for_function("() => (document.querySelector('.dd-wiz-progress')||{}).textContent === 'Step 7 of 7'", timeout=15000)
    check("good code (pasted with spaces, Enter key): moves to 'You're connected!'", "You're connected" in page.inner_text(".dd-wiz h2"))
    page.click("[data-next]")
    check("Done closes the wizard", page.locator(".dd-wiz").count() == 0)
    check("helper step ticked: 3 of 4", "3 of 4" in page.inner_text(".dd-setup-count"))
    check("helper step offers Change", page.locator("[data-start=ai]").inner_text() == "Change")
    check("no Change button for a wizard that isn't built yet", page.locator("[data-start=host]").count() == 0)
    page.screenshot(path=os.path.join(SHOTS, "setup-desktop-card.png"), full_page=True)

    print("\n== live answers (after the code works) ==")
    page.click("[data-start=ai]"); page.click("[data-ask]")
    check("says the AI helper answers", "helper (AI) answers" in page.inner_text("#dd-wiz-ask"))
    m = ask(page, "what should I call my project?")
    check("live answer comes from the AI", "LIVE:" in m.inner_text() and "live" in m.get_attribute("class"), m.inner_text())
    sent = json.dumps(G.asked[-1]) if G.asked else ""
    check("the AI is told which step the buyer is on", "Turn on the helper" in sent and "step 1" in sent)
    check("the AI is told to say 'free access code'", "free access code" in sent)
    page.keyboard.press("Escape")
    check("no page errors", not errs, errs)
    page.evaluate("() => dd.setup.needAI('To ask the helper about your list, you need a free access code.')")
    check("needAI opens the helper wizard with the reason", "To ask the helper about your list" in page.inner_text(".dd-wiz"))
    page.keyboard.press("Escape")
    ctx.close()

    print("\n== iPhone ==")
    ctx, page, errs = fresh(HOSTED, p.devices["iPhone 13"])
    page.click("[data-start=ai]")
    check("phone warning on screen 1", "easiest on a computer" in page.inner_text(".dd-wiz-body .warn"))
    width = page.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    check("no sideways scrolling", width[0] <= width[1], width)
    box = page.locator(".dd-sheet").bounding_box()
    check("wizard sits at the bottom like a phone sheet", box and abs(box["y"] + box["height"] - page.viewport_size["height"]) < 2, box)
    big = page.locator("[data-next]").bounding_box()
    check("Next button is big enough to tap (44px+)", big and big["height"] >= 44, big)
    page.screenshot(path=os.path.join(SHOTS, "setup-iphone-wizard.png"))
    for _ in range(5): page.click("[data-next]")
    check("paste box doesn't grab focus on a phone (no keyboard jump)", page.evaluate("() => document.activeElement.id") != "dd-wiz-code")
    page.screenshot(path=os.path.join(SHOTS, "setup-iphone-paste.png"))
    check("no page errors", not errs, errs)
    ctx.close()

    def buyer_with_list(device=None):
        """A buyer who connected the helper and started their own list, in the file version."""
        ctx, page, errs = fresh(FILE, device)
        page.evaluate("(c) => localStorage.setItem('dd_ai_connections_v1', JSON.stringify({ main: { provider: 'google', code: c } }))", GOOD)
        page.reload()
        page.click("text=Clear them and start mine")
        page.fill("#demoNew", "Order more flour"); page.click("#demoAdd")
        return ctx, page, errs
    def arrives(ctx, page, where):
        with ctx.expect_page() as newtab: page.click("[data-action]")
        np = newtab.value; np.wait_for_load_state(); np.wait_for_timeout(500)
        check(f"{where}: new address opened", np.url.startswith(where), np.url)
        check(f"{where}: the code arrived", np.evaluate("() => dd.ai.hasCode()"))
        check(f"{where}: the numbers arrived", "Order more flour" in np.inner_text("#demoList"), np.inner_text("#demoList"))
        check(f"{where}: the code is wiped from the address bar", "#dd=" not in np.url and GOOD not in np.url)
        return np

    print("\n== Put it on your phone: choosing a service ==")
    BOTH = "() => { dd.setup.hostChoices = ['neocities', 'tiiny']; }"
    ctx, page, errs = buyer_with_list()
    page.click("[data-start=host]")
    names = page.locator(".dd-choice-btn b").all_inner_texts()
    check("choice offers GitHub (first, Recommended) then tiiny.host; Neocities not offered", names == ["GitHub", "tiiny.host"] and "Recommended" in page.locator(".dd-choice-btn").first.inner_text(), names)
    check("promises code and numbers are never uploaded", "never uploaded" in page.inner_text(".dd-wiz-body"))
    page.keyboard.press("Escape")
    page.evaluate("() => { dd.setup.hostChoices = ['tiiny']; }")
    page.click("[data-start=host]")
    check("only one service: goes straight to it (step 1 of 5)", "tiiny" in page.inner_text(".dd-wiz-name") and wiz_step(page) == "Step 1 of 5", page.inner_text(".dd-wiz-top"))
    check("...and its first screen explains why", "never uploaded" in page.inner_text(".dd-wiz-body"))
    check("...with no Back or Start over on its first screen", page.locator("[data-back]").count() == 0 and page.locator("[data-over]").count() == 0)
    page.keyboard.press("Escape")
    page.evaluate(BOTH)
    page.click("[data-start=host]")
    check("with two services: opens on the choice, Neocities first", page.locator(".dd-choice-btn").first.inner_text().startswith("Neocities"))
    page.click("[data-host=tiiny]")
    check("tiiny chosen: step 2 of 6", wiz_step(page) == "Step 2 of 6", wiz_step(page))
    page.click("[data-over]")
    check("Start over goes back to the choice", page.locator(".dd-choice-btn").count() == 2)
    page.click("[data-host=neocities]")
    check("Neocities chosen: step 2 of 8", wiz_step(page) == "Step 2 of 8", wiz_step(page))
    page.click("[data-later]"); page.reload(); page.evaluate(BOTH); page.evaluate("() => dd.setup.paint()")
    check("card says Continue after picking a service", page.locator("[data-start=host]").inner_text() == "Continue")
    page.click("[data-start=host]")
    check("Continue resumes inside Neocities", "Neocities" in page.inner_text(".dd-wiz-name") and wiz_step(page) == "Step 2 of 8", page.inner_text(".dd-wiz-top"))
    page.click("[data-back]")
    check("Back from its first screen returns to the choice", page.locator(".dd-choice-btn").count() == 2)
    ctx.close()

    print("\n== Neocities, start to finish ==")
    ctx, page, errs = buyer_with_list()
    demo_html = open(os.path.join(DIST, "demo.html"), "rb").read()
    ctx.route("https://*.neocities.org/**", lambda r: r.fulfill(status=200, content_type="text/html", body=demo_html)
              if r.request.url.split("?")[0].split("#")[0].endswith("/demo.html") else r.fulfill(status=200, content_type="text/html", body="<title>Neocities</title>"))
    page.evaluate(BOTH)
    page.click("[data-start=host]"); page.click("[data-host=neocities]")
    body = page.inner_text(".dd-wiz-body")
    check("sign-up screen: Username, I am human, Create My Site, ignore Tags", all(w in body for w in ["Username", "I am human", "Create My Site", "Tags"]), body)
    with ctx.expect_page() as neo: page.click("[data-action]")
    check("Open Neocities opens neocities.org", "neocities.org" in neo.value.url, neo.value.url); neo.value.close()
    page.click("[data-next]")
    body = page.inner_text(".dd-wiz-body")
    check("plan screen: Free, Continue, ignore Supporter", all(w in body for w in ["Free", "Continue", "Supporter"]), body)
    page.click("[data-next]")
    check("email screen: Email Confirmation Token, Confirm Email", all(w in page.inner_text(".dd-wiz-body") for w in ["Email Confirmation Token", "Confirm Email"]))
    page.click("[data-next]")
    body = page.inner_text(".dd-wiz-body")
    check("upload screen: Upload, this file's name, leave index.html alone", "Upload" in body and "demo.html" in page.inner_text(".dd-filename") and "index.html" in body, body)
    page.click("[data-next]")
    page.click("[data-next]")
    check("no username: asks for it, stays put", "username" in page.inner_text("#dd-wiz-status") and wiz_step(page) == "Step 6 of 8")
    page.fill("#dd-wiz-addr", "-bad name-"); page.click("[data-next]")
    check("bad username refused kindly", wiz_step(page) == "Step 6 of 8")
    na = lambda raw: page.evaluate("(r) => dd.setup.neocitiesAddress(r)", raw)
    check("username -> address with this file's name", na(" Smith-Tools ") == "https://smith-tools.neocities.org/demo.html", na(" Smith-Tools "))
    check("a pasted Neocities address works too", na("https://smith-tools.neocities.org/") == "https://smith-tools.neocities.org/demo.html")
    page.fill("#dd-wiz-addr", "smith-tools"); page.click("[data-next]")
    check("good username: moves on (step 7)", wiz_step(page) == "Step 7 of 8")
    check("shows the new address", "smith-tools.neocities.org/demo.html" in page.inner_text(".dd-wiz-body"))
    np = arrives(ctx, page, "https://smith-tools.neocities.org/demo.html")
    check("Neocities page: phone step done, Send to my phone offered", np.locator("[data-phone]").is_visible())
    np.click("[data-phone]")
    check("Send to my phone opens the QR", np.locator("#dd-qr svg").count() == 1)
    np.close()
    page.click("[data-next]")
    body = page.inner_text(".dd-wiz-body")
    check("last screen suggests the bookmark name", "Demo List · DigiDoughnut" in body, body)
    check("last screen: updates = same file name; no tiiny 3-month rule", "same file name" in body and "3 months" not in body, body)
    page.click("[data-next]")
    check("Done closes the wizard", page.locator(".dd-wiz").count() == 0)
    sa = lambda q: page.evaluate("(q) => dd.setup.scriptedAnswer(q)", q)
    for q, want in {"Which one should I pick?": "Neocities", "What username should I use?": "neocities.org", "Do I need Supporter?": "Free",
                    "I didn't get the email code": "spam", "Do I need the free trial?": "Skip", "How long does it stay online?": "3 months",
                    "How long will it take?": "minutes"}.items():
        a = sa(q); check(f"scripted: '{q}'", want in (a or ""), a)
    check("no page errors", not errs, errs)
    ctx.close()

    print("\n== GitHub, start to finish ==")
    ctx, page, errs = buyer_with_list()
    live = {"on": False}
    def gh_pages(r):
        if r.request.url.split("?")[0].endswith("/demo.html") and live["on"]:
            return r.fulfill(status=200, content_type="text/html", headers={"Access-Control-Allow-Origin": "*"}, body=demo_html)
        r.fulfill(status=404, content_type="text/html", headers={"Access-Control-Allow-Origin": "*"}, body="<title>404</title>")
    ctx.route("https://smith-tools.github.io/**", gh_pages)
    ctx.route("https://github.com/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<title>GitHub</title>"))
    page.click("[data-start=host]"); page.click("[data-host=github]")
    check("GitHub chosen: step 2 of 10", wiz_step(page) == "Step 2 of 10", wiz_step(page))
    with ctx.expect_page() as t: page.click("[data-action]")
    check("Open GitHub sign-up opens github.com/signup", t.value.url.startswith("https://github.com/signup"), t.value.url); t.value.close()
    body = page.inner_text(".dd-wiz-body")
    check("sign-up screen matches GitHub: Email, Password, Username, Country/Region, Create account", all(w in body for w in ["Email", "Password", "Username", "Your Country/Region", "Create account"]), body)
    page.click("[data-next]")
    body = page.inner_text(".dd-wiz-body")
    check("confirm screen: 8-digit code, Enter code, Continue, Sign in, ignore the welcome page", all(w in body for w in ["8-digit", "Enter code", "Continue", "Sign in", "Create project"]), body)
    page.click("[data-next]")
    page.click("[data-next]")
    check("no username: asks for it", "username" in page.inner_text("#dd-wiz-status"))
    gha = lambda u: page.evaluate("(u) => dd.setup.githubAddress(u)", u)
    check("username -> repo name and address", gha(" Smith-Tools ") == {"user": "smith-tools", "repo": "smith-tools.github.io", "url": "https://smith-tools.github.io/demo.html"}, gha(" Smith-Tools "))
    check("@name, github.com/name and name.github.io all work", all(gha(x) and gha(x)["user"] == "smith-tools" for x in ["@smith-tools", "github.com/smith-tools", "smith-tools.github.io"]))
    check("bad usernames refused", gha("-bad") is None and gha("two  words") is None and gha("a--b") is None)
    page.fill("#dd-wiz-user", "Smith-Tools"); page.click("[data-next]")
    body = page.inner_text(".dd-wiz-body")
    check("repository screen shows the exact name to type", "smith-tools.github.io" in page.inner_text(".dd-copyrow"), body)
    check("repository screen: Choose visibility, Public, Add README On, Create repository", all(w in body for w in ["Choose visibility", "Public", "Add README", "On", "Create repository"]), body)
    with ctx.expect_page() as t: page.click("[data-action]")
    check("opens github.com/new", t.value.url.startswith("https://github.com/new"), t.value.url); t.value.close()
    page.click("[data-next]")
    body = page.inner_text(".dd-wiz-body")
    check("upload screen: Add file, Upload files, this file, Commit changes", all(w in body for w in ["Add file", "Upload files", "demo.html", "Commit changes"]), body)
    with ctx.expect_page() as t: page.click("[data-action]")
    check("opens the buyer's own repository", t.value.url == "https://github.com/smith-tools/smith-tools.github.io", t.value.url); t.value.close()
    page.click("[data-next]")
    body = page.inner_text(".dd-wiz-body")
    check("Pages screen: Deploy from a branch, main, Save", all(w in body for w in ["Deploy from a branch", "main", "Save"]), body)
    with ctx.expect_page() as t: page.click("[data-action]")
    check("opens the repository's Pages settings", t.value.url == "https://github.com/smith-tools/smith-tools.github.io/settings/pages", t.value.url); t.value.close()
    page.click("[data-next]")
    check("wait screen shows the address", "smith-tools.github.io/demo.html" in page.inner_text(".dd-wiz-body"))
    page.click("[data-next]"); page.wait_for_timeout(600)
    check("not live yet: says so and stays", "Not online yet" in page.inner_text("#dd-wiz-status") and wiz_step(page) == "Step 8 of 10", page.inner_text("#dd-wiz-status"))
    live["on"] = True
    page.click("[data-next]"); page.wait_for_timeout(600)
    check("live: moves on (step 9)", wiz_step(page) == "Step 9 of 10", wiz_step(page))
    np = arrives(ctx, page, "https://smith-tools.github.io/demo.html")
    check("GitHub page: phone step done, Send to my phone offered", np.locator("[data-phone]").is_visible())
    np.close()
    page.click("[data-next]")
    body = page.inner_text(".dd-wiz-body")
    check("last screen: bookmark name; updates = same file name in the same repository", "Demo List · DigiDoughnut" in body and "same file name" in body and "3 months" not in body, body)
    page.click("[data-next]")
    check("Done closes the wizard", page.locator(".dd-wiz").count() == 0)
    sa = lambda q, w: page.evaluate("([q, w]) => dd.setup.scriptedAnswer(q, w)", [q, w])
    check("'Is it free?' inside GitHub talks about GitHub", "GitHub" in sa("Is it really free?", "host_github"))
    check("'Is it free?' inside the helper wizard talks about Google", "Google" in sa("Is it really free?", "ai"))
    check("'What does Public mean?' answered", "never in the file" in sa("What does Public mean?", "host_github"))
    check("'It's not online yet' answered", "10 minutes" in sa("It's not online yet", "host_github"))
    check("no page errors", not errs, errs)
    ctx.close()

    print("\n== tiiny.host, start to finish ==")
    ctx, page, errs = buyer_with_list()
    page.click("[data-start=host]"); page.click("[data-host=tiiny]")
    check("says to Skip tiiny's free trial", "Skip" in page.inner_text(".dd-wiz-body"))
    with ctx.expect_page() as tiiny: page.click("[data-action]")
    check("Open tiiny.host opens tiiny.host in a new tab", "tiiny.host" in tiiny.value.url, tiiny.value.url); tiiny.value.close()
    page.click("[data-next]")
    check("names this program's own file to upload", "demo.html" in page.inner_text(".dd-filename"))
    page.click("[data-next]"); page.click("[data-next]")
    check("empty address: asks for it, stays put", "Paste your new address" in page.inner_text("#dd-wiz-status") and wiz_step(page) == "Step 4 of 6")
    page.fill("#dd-wiz-addr", "not an address"); page.click("[data-next]")
    check("nonsense address refused kindly", wiz_step(page) == "Step 4 of 6")
    check("setup.cleanAddress adds https:// and keeps tiiny addresses", page.evaluate("() => dd.setup.cleanAddress(' cyan-yettie-53.tiiny.site ')") == "https://cyan-yettie-53.tiiny.site/")
    page.fill("#dd-wiz-addr", HOSTED); page.click("[data-next]")
    check("good address: moves on (step 5)", wiz_step(page) == "Step 5 of 6")
    np = arrives(ctx, page, HOSTED)
    check("new address: card shows 3 of 4", "3 of 4" in np.inner_text(".dd-setup-count"), np.inner_text(".dd-setup-count"))
    np.close()
    page.click("[data-next]")
    body = page.inner_text(".dd-wiz-body")
    check("last screen: bookmark name, 3 months, Update", all(w in body for w in ["Demo List · DigiDoughnut", "3 months", "Update"]), body)
    page.click("[data-next]")
    check("no page errors", not errs, errs)
    ctx.close()
    ctx, page, errs = fresh(FILE, p.devices["iPhone 13"])
    page.click("[data-start=host]")
    check("iPhone: says to do this on the computer", "on the computer" in page.inner_text(".dd-wiz-body .warn"))
    page.screenshot(path=os.path.join(SHOTS, "setup-iphone-choose-host.png"))
    ctx.close()

    print("\n== a host that blocks outside connections (like Neocities free) ==")
    ctx, page, errs = fresh(HOSTED)
    demo_html = open(os.path.join(DIST, "demo.html"), "rb").read()
    CSP = "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'"
    ctx.route("https://blocky.example/**", lambda r: r.fulfill(status=200, content_type="text/html", headers={"Content-Security-Policy": CSP}, body=demo_html))
    page.goto("https://blocky.example/demo.html")
    res = page.evaluate("async (c) => await dd.ai.connect(c)", GOOD)
    check("connect says the website blocks it, not 'no internet'", res["type"] == "host_blocked" and "won't let the helper" in res["title"], res)
    rep = page.evaluate("() => dd.diag.text()")
    check("support report names the blocked address", "BLOCKS outside connections: https://generativelanguage.googleapis.com" in rep, rep[:400])
    ctx.close()

    print("\n== Add to Home Screen ==")
    ctx, page, errs = fresh(HOSTED)
    check("page title is the bookmark name", page.title() == "Demo List · DigiDoughnut", page.title())
    check("Home Screen name is the program's name", page.get_attribute("meta[name=apple-mobile-web-app-title]", "content") == "Demo List")
    page.evaluate("(c) => localStorage.setItem('dd_ai_connections_v1', JSON.stringify({ main: { provider: 'google', code: c } }))", GOOD)
    link = page.evaluate("() => dd.pair.makeLink({ includeCode: true }).link")
    ctx.close()
    ctx, page, errs = fresh(HOSTED, p.devices["iPhone 13"])
    check("iPhone, hosted: phone row offers Add to Home Screen", page.locator("[data-home]").is_visible())
    page.goto(link); page.wait_for_timeout(1800)
    check("iPhone: after the QR scan, the Home Screen steps open by themselves", page.locator(".dd-home-steps").is_visible())
    check("the sheet says the code arrived (no toast on top of it)", "came across" in page.inner_text(".dd-sheet") and page.locator(".dd-toast").count() == 0)
    check("iPhone steps say Share, then Add to Home Screen", "Share" in page.inner_text(".dd-home-steps") and "Add to Home Screen" in page.inner_text(".dd-home-steps"))
    page.screenshot(path=os.path.join(SHOTS, "setup-iphone-homescreen.png"))
    page.click("text=Got it")
    check("no page errors", not errs, errs)
    ctx.close()
    ctx, page, errs = fresh(HOSTED, p.devices["Pixel 7"])
    page.click("[data-home]")
    check("Android steps use the ⋮ menu", "⋮" in page.inner_text(".dd-home-steps"))
    ctx.close()

    print("\n== a program can opt out ==")
    ctx, page, errs = fresh(HOSTED)
    page.evaluate("() => { document.getElementById('dd-setup').innerHTML = ''; }")
    check("dd.setup is present in the build", page.evaluate("() => !!(window.dd && dd.setup && dd.setup.wizards.ai)"))
    ctx.close()
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
raise SystemExit(0 if all(results) else 1)
