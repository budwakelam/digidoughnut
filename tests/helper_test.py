"""Phase 4 tests: the helper with hands (dd.helper, "Penny"), in headless Chromium.

    node build.mjs && python3 tests/helper_test.py

Runs the demo program against a FAKE Google that answers like a model using tools. Proves our
side only: the gate is Oran's run on his PC and iPhone against the real Google.
"""
import json, os, re, threading, http.server, functools
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
NOTES_URL = "https://budwakelam.github.io/digidoughnut/noticeboard/notes.json"
GOOD = "AQ.Ab8RN6TESTfake0123456789abcdefGHIJKLmnop"

class FakeGoogle:
    """Answers like a model with tools: reads the person's words and calls the demo's tools."""
    def __init__(self): self.sent = []; self.down = False; self.hanging = []
    def handle(self, route):
        req = route.request; cors = {"Access-Control-Allow-Origin": "*"}
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers={**cors, "Access-Control-Allow-Headers": "content-type,x-goog-api-key", "Access-Control-Allow-Methods": "GET,POST"})
        def ok(body): route.fulfill(status=200, content_type="application/json", headers=cors, body=json.dumps(body))
        def say(text): ok({"candidates": [{"content": {"role": "model", "parts": [{"text": text}]}}]})
        def calls(*cs): ok({"candidates": [{"content": {"role": "model", "parts": [{"functionCall": {"name": n, "args": a}} for n, a in cs]}}]})
        if req.headers.get("x-goog-api-key") != GOOD:
            return route.fulfill(status=400, content_type="application/json", headers=cors, body=json.dumps({"error": {"code": 400, "message": "API key not valid.", "details": [{"reason": "API_KEY_INVALID"}]}}))
        if req.url.split("?")[0].endswith("/models"):
            return ok({"models": [{"name": "models/gemini-3.8-flash", "supportedGenerationMethods": ["generateContent"]},
                                  {"name": "models/gemini-3.1-flash-lite", "supportedGenerationMethods": ["generateContent"]}]})
        body = json.loads(req.post_data or "{}")
        if "toolConfig" in body:
            return calls(("confirm_ready", {"word": "ready"}))
        self.sent.append(body)
        if self.down:
            return route.fulfill(status=503, content_type="application/json", headers=cors, body=json.dumps({"error": {"code": 503, "status": "UNAVAILABLE", "message": "high demand"}}))
        last = body["contents"][-1]
        results = [p["functionResponse"] for p in last["parts"] if "functionResponse" in p]
        if results:
            return say("Done! " + " ".join(r["response"]["result"].get("message", "") for r in results))
        text = " ".join(p.get("text", "") for p in last["parts"]).lower()
        if "stallnow" in text:
            self.hanging.append(route); return
        m = re.search(r"add (.+)", text)
        if m: return calls(*[("add_item", {"text": t.strip()}) for t in re.split(r",| and ", m.group(1)) if t.strip()])
        m = re.search(r"tick off (.+)", text)
        if m: return calls(("set_done", {"text": m.group(1).strip()}))
        m = re.search(r"remove (.+)", text)
        if m: return calls(("remove_item", {"text": m.group(1).strip()}))
        if "clear" in text: return calls(("clear_list", {}))
        return say("LIVE: you have a lovely list.")
G = FakeGoogle()

results = []
def check(name, ok, extra=""):
    results.append(bool(ok)); print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({extra})" if extra and not ok else ""))

with sync_playwright() as p:
    b = p.chromium.launch()
    def fresh(device=None, code=False):
        ctx = b.new_context(**(device or {"viewport": {"width": 1280, "height": 800}}))
        ctx.route("https://generativelanguage.googleapis.com/**", G.handle)
        ctx.route(NOTES_URL, lambda r: r.fulfill(status=404, body="", headers={"Access-Control-Allow-Origin": "*"}))
        page = ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" and not re.search(r"40\d|50\d|ERR_", m.text) else None)
        page.goto(HOSTED); page.evaluate("() => localStorage.clear()")
        if code: page.evaluate("(c) => localStorage.setItem('dd_ai_connections_v1', JSON.stringify({ main: { provider: 'google', code: c } }))", GOOD)
        page.reload()
        return ctx, page, errs
    items = lambda page: page.evaluate("() => dd.getData().items.map(i => i.text + (i.done ? '*' : ''))")
    BOTS = "dd.helper.messages().filter(m => /^bot/.test(m.who)).length"
    def bot_count(page): return page.evaluate("() => " + BOTS)
    def wait_reply(page, n):
        page.wait_for_function(f"() => {BOTS} > {n} && !document.querySelector('.dd-helper-msg.pending')", timeout=20000)
        return page.locator(".dd-helper-msg.bot:not(.pending)").last
    def send(page, text):
        n = bot_count(page)
        page.fill(".dd-helper-in", text); page.click("[data-send]")
        return wait_reply(page, n)

    # ---------------------------------------------------------------- where she sits
    print("\n== computer: a column beside the page ==")
    ctx, page, errs = fresh()
    check("the helper sits in a side column", page.locator(".dd-helper-side").is_visible() and page.evaluate("() => document.body.classList.contains('dd-has-side')"))
    check("it's called Penny, with the program's role line", "Penny" in page.inner_text(".dd-helper-who") and "list helper" in page.inner_text(".dd-helper-who"))
    check("the page isn't hidden under it", page.locator("#demoNew").bounding_box()["x"] + page.locator("#demoNew").bounding_box()["width"] < page.locator(".dd-helper-side").bounding_box()["x"])
    check("no code yet: one plain line and a Turn on button", "needs a free access code" in page.inner_text(".dd-helper-need") and page.locator("[data-turnon]").inner_text() == "Turn on Penny")
    page.screenshot(path=os.path.join(SHOTS, "helper-computer-nocode.png"))

    print("\n== no code: asking opens Turn on the helper, and the question waits ==")
    page.fill(".dd-helper-in", "Add milk")
    page.click("[data-send]")
    check("the Turn on the helper wizard opens", page.locator(".dd-wiz").is_visible() and "Turn on the helper" in page.inner_text(".dd-wiz-name"))
    check("with a line saying why", "Penny needs a free access code" in page.inner_text(".dd-wiz"))
    check("nothing was sent to Google", not G.sent)
    page.click(".dd-wiz-x")
    check("the question is still in the box", page.input_value(".dd-helper-in") == "Add milk")
    page.evaluate("(c) => dd.ai.connect(c)", GOOD)
    page.wait_for_function("() => !document.querySelector('.dd-helper-need')", timeout=10000)
    check("once the code works, the Turn on line goes away", page.locator(".dd-helper-need").count() == 0)
    check("and the question is still waiting in the box", page.input_value(".dd-helper-in") == "Add milk")
    check("the greeting shows", "I'm Penny" in page.inner_text(".dd-helper-msgs"))
    check("suggestion chips show in an empty chat", page.locator(".dd-helper-chip").count() == 3)

    print("\n== hands: she changes the program ==")
    before = items(page)
    page.click(".dd-helper-chip >> nth=0")   # "Add milk and eggs"
    wait_reply(page, 0)
    after = items(page)
    check("one message, two tool calls: both items added", after == before + ["milk", "eggs"], after)
    check("the list on screen shows them", "milk" in page.inner_text("#demoList") and "eggs" in page.inner_text("#demoList"))
    check("she confirms in her reply", "Added 'milk'" in page.locator(".dd-helper-msg.bot").last.inner_text())
    check("an Undo button sits under that reply", page.locator(".dd-helper-msg.bot").last.locator(".dd-helper-undo").count() == 1)
    sys1 = G.sent[0]["systemInstruction"]["parts"][0]["text"]
    check("she was told the current list", "Buy flour" in sys1 and "Book the market table (done)" in sys1)
    check("she was told it's example data", "EXAMPLE" in sys1)
    check("she was told her name and the program", "You are Penny" in sys1 and "Demo List" in sys1)
    tools = [f["name"] for f in G.sent[0]["tools"][0]["functionDeclarations"]]
    check("she was given the program's four tools", tools == ["add_item", "set_done", "remove_item", "clear_list"], tools)

    print("\n== Undo ==")
    page.click(".dd-helper-undo")
    check("one tap puts back everything that reply did", items(page) == before, items(page))
    check("the reply now says Undone, and the button is gone", "Undone." in page.inner_text(".dd-helper-msgs") and page.locator(".dd-helper-undo").count() == 0)
    send(page, "tick off flour")
    check("tick off: done", "Buy flour*" in items(page), items(page))
    n0 = len(G.sent)
    send(page, "what's left?")
    hist = G.sent[n0]["contents"]
    check("she remembers the conversation (earlier turns are sent)", any("tick off flour" in json.dumps(c) for c in hist))
    check("and knows Undo was tapped", any("Undo" in json.dumps(c) for c in hist))
    check("history starts with the person and alternates", hist[0]["role"] == "user" and all(hist[i]["role"] != hist[i+1]["role"] for i in range(len(hist)-1)), [c["role"] for c in hist])

    print("\n== big changes need a Yes ==")
    before = items(page)
    send(page, "clear the list")
    check("nothing cleared yet", items(page) == before)
    check("a Yes / No question shows under her reply", "Clear all 3 items" in page.inner_text(".dd-helper-msgs") and page.locator("text=Yes, clear it").count() == 1)
    page.click("text=No, leave it")
    check("No leaves it alone", items(page) == before)
    send(page, "clear the list please")
    page.click("text=Yes, clear it")
    check("Yes clears it", items(page) == [])
    check("and that can be undone too", page.locator(".dd-helper-msg.bot").last.locator(".dd-helper-undo").count() == 1)
    page.locator(".dd-helper-msg.bot").last.locator(".dd-helper-undo").click()
    check("undo brings the whole list back", items(page) == before)

    print("\n== undo after the buyer changed things asks first ==")
    send(page, "add bread")
    page.fill("#demoNew", "jam"); page.click("#demoAdd")
    page.locator(".dd-helper-undo").last.click()
    check("a friendly question appears", "Undo Penny's change?" in page.inner_text(".dd-sheet"))
    page.click("text=No, keep things as they are")
    check("No keeps both", "bread" in items(page) and "jam" in items(page))

    print("\n== the chat is kept ==")
    send(page, "clear it all")   # leaves a Yes/No question waiting
    page.reload()
    check("after a reload the conversation is still there", "tick off flour" in page.inner_text(".dd-helper-msgs"))
    check("a Yes/No question from before the reload has expired", page.locator("text=Yes, clear it").count() == 0 and "expired" in page.inner_text(".dd-helper-msgs"))
    stored = page.evaluate("() => localStorage.getItem('dd_demo_chat_v1')")
    check("the chat is saved for this program only", stored and "tick off flour" in stored)
    link = page.evaluate("() => dd.pair.makeLink({ includeCode: true }).link")
    check("the chat never goes in the phone link", "flour" not in link and "chat" not in link)
    page.click("[data-new]")
    check("New chat clears it and the greeting returns", "tick off flour" not in page.inner_text(".dd-helper-msgs") and "I'm Penny" in page.inner_text(".dd-helper-msgs"))
    check("cleared from storage too", "tick off" not in (page.evaluate("() => localStorage.getItem('dd_demo_chat_v1')") or ""))

    print("\n== problems: Try again, Fix my code, Stop ==")
    G.down = True
    m = send(page, "add apples")
    check("every model busy: friendly message, no raw text", "busy moment" in m.inner_text() and "503" not in m.inner_text() and "UNAVAILABLE" not in m.inner_text(), m.inner_text())
    check("with a Try again button", m.locator("button", has_text="Try again").count() == 1)
    G.down = False
    n = bot_count(page)
    m.locator("button", has_text="Try again").click()
    wait_reply(page, n - 1)
    check("Try again worked and the error is gone", "apples" in items(page) and "busy moment" not in page.inner_text(".dd-helper-msgs"))
    page.fill(".dd-helper-in", "stallnow please"); page.click("[data-send]")
    page.wait_for_function("() => document.querySelector('[data-send]').textContent === 'Stop'", timeout=10000)
    check("while she works the button says Stop", page.inner_text("[data-send]") == "Stop" and "thinking" in page.inner_text(".dd-helper-msg.pending"))
    page.click("[data-send]")
    page.wait_for_function("() => document.querySelector('[data-send]').textContent === 'Send'", timeout=10000)
    check("Stop works: 'Okay, I stopped.'", "Okay, I stopped." in page.locator(".dd-helper-msg.bot").last.inner_text())
    page.evaluate("() => { const c = JSON.parse(localStorage.getItem('dd_ai_connections_v1')); c.main.code = 'AQ.wrongwrongwrongWRONG0123456789'; localStorage.setItem('dd_ai_connections_v1', JSON.stringify(c)); }")
    m = send(page, "add pears")
    check("a broken code: says so and offers Fix my access code", "didn't work" in m.inner_text() and m.locator("button", has_text="Fix my access code").count() == 1, m.inner_text())
    m.locator("button", has_text="Fix my access code").click()
    check("which opens Turn on the helper", page.locator(".dd-wiz").is_visible())
    page.click(".dd-wiz-x")

    print("\n== support report and privacy ==")
    rep = page.evaluate("() => dd.diag.text()")
    check("the report has a Helper section", "--- Helper ---" in rep and "window: side" in rep, rep[-400:])
    check("no chat words in the report", "apples" not in rep and "flour" not in rep)
    page.click("#dd-privacy-link")
    check("Privacy says chats stay on this device", "Your chats with Penny" in page.inner_text(".dd-sheet"))
    page.click("text=Close")
    page.screenshot(path=os.path.join(SHOTS, "helper-computer.png"))

    print("\n== narrow the window: the chat moves onto the page ==")
    page.set_viewport_size({"width": 700, "height": 900})
    page.wait_for_function("() => !!document.querySelector('#demoHelper .dd-helper-inline')", timeout=5000)
    check("it's now a card under the list", page.locator("#demoHelper .dd-helper-inline").is_visible() and not page.evaluate("() => document.body.classList.contains('dd-has-side')"))
    check("the conversation came with it", "add apples" in page.inner_text(".dd-helper-msgs"))
    check("no page errors", not errs, errs)
    ctx.close()

    print("\n== iPhone: a big card on the page ==")
    ctx, page, errs = fresh(p.devices["iPhone 13"], code=True)
    check("the helper is a card on the page, under the list", page.locator("#demoHelper .dd-helper-inline").is_visible())
    box = page.locator(".dd-helper-inline").bounding_box()
    check("it fits the screen", box["x"] >= 0 and box["x"] + box["width"] <= 390, box)
    send(page, "add rice")
    check("works on the phone", "rice" in items(page))
    page.screenshot(path=os.path.join(SHOTS, "helper-iphone.png"), full_page=True)
    check("no page errors", not errs, errs)
    ctx.close()

    print("\n== the QR screen says what comes along ==")
    ctx, page, errs = fresh(code=True)
    page.click("#demoPhone")
    t = page.inner_text("#dd-qr-left")
    check("example list: says it doesn't travel, and why", "access code" in t and "Example data doesn't travel" in t, t)
    page.click(".dd-sheet [data-close]")
    page.click("text=Clear them and start mine"); page.fill("#demoNew", "my own thing"); page.click("#demoAdd")
    page.click("#demoPhone")
    t = page.inner_text("#dd-qr-left")
    check("own small list: says it comes along", "your access code and your list" in t, t)
    page.click(".dd-sheet [data-close]")
    ctx.close()

    print("\n== a host's own banner (tiiny.host lays a ~42 px bar across the bottom) ==")
    ctx, page, errs = fresh(code=True)
    page.evaluate("""() => { const b = document.createElement('div'); b.id = 'host-banner'; b.textContent = 'Shared with tiiny.host';
        b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:42px;z-index:2147483647;background:#a855f7'; document.body.appendChild(b); }""")
    page.wait_for_function("() => dd.ui.hostBars.bottom === 42", timeout=5000)
    side = page.locator(".dd-helper-side").bounding_box()
    check("Penny's column stops above the banner", round(side["y"] + side["height"]) == 800 - 42, side)
    inp = page.locator(".dd-helper-in").bounding_box()
    check("her message box is fully visible", inp["y"] + inp["height"] <= 800 - 42, inp)
    page.evaluate("() => dd.ui.toast('hello')")
    t = page.locator(".dd-toast").bounding_box()
    check("toasts sit above the banner too", t["y"] + t["height"] <= 800 - 42, t)
    check("toasts don't block clicks", page.evaluate("() => getComputedStyle(document.querySelector('.dd-toast')).pointerEvents") == "none")
    check("the support report mentions the host's bar", "own bar" in page.evaluate("() => dd.diag.text()"))
    page.screenshot(path=os.path.join(SHOTS, "helper-host-banner.png"))
    page.evaluate("() => document.getElementById('host-banner').remove()")
    page.wait_for_function("() => dd.ui.hostBars.bottom === 0", timeout=5000)
    check("banner gone: back to the bottom edge", True)
    check("no page errors", not errs, errs)
    ctx.close()

    print("\n== a program can choose: bubble, other name, or none ==")
    ctx, page, errs = fresh(code=True)
    page.evaluate("() => { document.getElementById('dd-helper-home').remove(); dd.helper.start(Object.assign({}, dd.getProgram(), { helper: { name: 'Ziggy', face: '🦊', place: 'bubble' } })); }")
    check("bubble: a labelled button, not a bare icon", page.inner_text("#dd-helper-fab").strip().endswith("Ask Ziggy"))
    check("the panel is closed until tapped", not page.locator(".dd-helper-bubble").is_visible())
    page.click("#dd-helper-fab")
    check("tapping opens it, with the new name", page.locator(".dd-helper-bubble").is_visible() and "Ziggy" in page.inner_text(".dd-helper-bubble"))
    page.screenshot(path=os.path.join(SHOTS, "helper-bubble.png"))
    page.click("[data-hide]")
    check("Hide closes it", not page.locator(".dd-helper-bubble").is_visible())
    page.evaluate("() => { dd.helper.start(Object.assign({}, dd.getProgram(), { helper: { place: 'none' } })); }")
    check("place 'none': no chat window", page.locator("#dd-helper-home").count() == 0)
    page.evaluate("() => dd.helper.ask('add figs')")
    page.wait_for_function("() => dd.getData().items.some(i => i.text === 'figs')", timeout=20000)
    check("but a program button can still ask her (dd.helper.ask)", "figs" in items(page))
    check("no page errors", not errs, errs)
    ctx.close()
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
raise SystemExit(0 if all(results) else 1)
