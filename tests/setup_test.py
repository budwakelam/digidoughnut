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
    check("phone and sync say Coming soon", page.locator(".dd-step >> text=Coming soon").count() == 2)
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

    print("\n== a program can opt out ==")
    ctx, page, errs = fresh(HOSTED)
    page.evaluate("() => { document.getElementById('dd-setup').innerHTML = ''; }")
    check("dd.setup is present in the build", page.evaluate("() => !!(window.dd && dd.setup && dd.setup.wizards.ai)"))
    ctx.close()
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
raise SystemExit(0 if all(results) else 1)
