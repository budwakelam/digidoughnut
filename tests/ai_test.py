"""Phase 2 tests: dd.ai + dd.notes against a FAKE Google, in headless Chromium.

    node build.mjs && python3 tests/ai_test.py

The fake answers like Google's Gemini API (shapes checked against Google's docs 2026-10-06).
It proves our side of the conversation; the Phase 2 gate still needs Oran's real code on a
real iPhone, because only Google can prove Google.
"""
import json, os, sys, threading, http.server, functools, re
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist")
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=DIST))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_address[1]}/aitest.html"
GOOD = "AIzaSyTEST0123456789abcdefghijklmnopqrs"   # fake, shaped like a Google code
NOTES_URL = "https://budwakelam.github.io/digidoughnut/noticeboard/notes.json"

MODELS = ["gemini-3.8-flash", "gemini-3.8-flash-tts", "gemini-3.1-pro-preview", "gemini-3.5-flash-lite", "gemma-3-27b-it", "gemini-3.8-live"]

class FakeGoogle:
    def __init__(self):
        self.reset()
    def reset(self, scenario="normal"):
        self.scenario = scenario; self.calls = []; self.urls = []; self.once = set()
    def first(self, tag):
        if tag in self.once: return False
        self.once.add(tag); return True
    def err(self, route, code, status, message, details=None):
        route.fulfill(status=code, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"},
                      body=json.dumps({"error": {"code": code, "status": status, "message": message, "details": details or []}}))
    def ok(self, route, body):
        route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(body))
    def handle(self, route):
        req = route.request; url = req.url; self.urls.append(url)
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type,x-goog-api-key", "Access-Control-Allow-Methods": "GET,POST"})
        key = req.headers.get("x-goog-api-key", "")
        if key != GOOD:
            return self.err(route, 400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.",
                            [{"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "API_KEY_INVALID"}])
        s = self.scenario
        if s == "leaked": return self.err(route, 403, "PERMISSION_DENIED", "Your API key was reported as leaked. Please use another API key.")
        if s == "region": return self.err(route, 400, "FAILED_PRECONDITION", "User location is not supported for the API use.")
        if url.split("?")[0].endswith("/models"):
            return self.ok(route, {"models": [{"name": "models/" + m, "supportedGenerationMethods": ["generateContent"]} for m in MODELS] +
                                   [{"name": "models/gemini-embedding-001", "supportedGenerationMethods": ["embedContent"]}]})
        model = re.search(r"/models/([^:]+):generateContent", url).group(1)
        body = json.loads(req.post_data or "{}"); self.calls.append({"model": model, "body": body})
        if s == "retired" and model == "gemini-3.8-flash":
            return self.err(route, 404, "NOT_FOUND", f"models/{model} is not found for API version v1beta, or is not supported for generateContent.")
        if s == "busy_main" and model == "gemini-3.8-flash":
            return self.err(route, 503, "UNAVAILABLE", "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.")
        if s == "busy_once" and self.first("busy"): return self.err(route, 503, "UNAVAILABLE", "The model is overloaded. Please try again later.")
        if s == "minute_once" and self.first("minute"):
            return self.err(route, 429, "RESOURCE_EXHAUSTED", "You exceeded your current quota.",
                [{"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{"quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]},
                 {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "1s"}])
        if s == "daily": return self.err(route, 429, "RESOURCE_EXHAUSTED", "You exceeded your current quota.",
                [{"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}])
        if s == "badrequest": return self.err(route, 400, "INVALID_ARGUMENT", "Invalid JSON payload received. Unknown name \"foo\".")
        if s == "hang": return  # never answer: the client must time out (route stays pending)
        contents = body.get("contents", [])
        last = contents[-1]["parts"] if contents else []
        if "toolConfig" in body:
            return self.ok(route, {"candidates": [{"content": {"role": "model", "parts": [
                {"functionCall": {"name": "confirm_ready", "args": {"word": "ready"}}, "thoughtSignature": "sig-A"}]}}]})
        if s == "loop" and "tools" in body:
            return self.ok(route, {"candidates": [{"content": {"role": "model", "parts": [{"functionCall": {"id": "x", "name": "add_item", "args": {"text": "again"}}}]}}]})
        if any("functionResponse" in p for p in last):
            return self.ok(route, {"candidates": [{"content": {"role": "model", "parts": [{"text": "All added."}]}, "finishReason": "STOP"}]})
        text = " ".join(p.get("text", "") for p in last)
        if "three items" in text:
            return self.ok(route, {"candidates": [{"content": {"role": "model", "parts": [
                {"functionCall": {"id": "f1", "name": "add_item", "args": {"text": "apples"}}, "thoughtSignature": "sig-B"},
                {"functionCall": {"id": "f2", "name": "add_item", "args": {"text": "bread"}}},
                {"functionCall": {"id": "f3", "name": "add_item", "args": {"text": "milk"}}}]}}]})
        if "what did you just add" in text.lower():
            seen = json.dumps(contents)
            return self.ok(route, {"candidates": [{"content": {"role": "model", "parts": [{"text": "You added eggs." if "eggs" in seen else "I don't know."}]}}]})
        if "add eggs" in text.lower():
            return self.ok(route, {"candidates": [{"content": {"role": "model", "parts": [{"functionCall": {"id": "e1", "name": "add_item", "args": {"text": "eggs"}}}]}}]})
        return self.ok(route, {"candidates": [{"content": {"role": "model", "parts": [{"thought": True, "text": "internal"}, {"text": "Hello!"}]}}]})

G = FakeGoogle()
results = []
def check(name, ok, extra=""):
    results.append(ok); print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({extra})" if extra and not ok else ""))

RAW_WORDS = ["api key not valid", "http ", "resource_exhausted", "invalid_argument", "permission_denied", "json", "gemini-", "quota", "status"]
def friendly_only(text): return not any(w in text.lower() for w in RAW_WORDS)

with sync_playwright() as p:
    b = p.chromium.launch()
    def fresh(device=None, notes=None):
        ctx = b.new_context(**(device or {}))
        ctx.route("https://generativelanguage.googleapis.com/**", G.handle)
        if notes is None: ctx.route(NOTES_URL, lambda r: r.fulfill(status=404, body="", headers={"Access-Control-Allow-Origin": "*"}))
        else: ctx.route(NOTES_URL, lambda r: r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(notes)))
        page = ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(URL); page.evaluate("() => localStorage.clear()"); page.reload()
        page.evaluate("() => { dd.ai.limits.request = 2500; dd.ai.limits.turn = 6000; }")
        return ctx, page, errs
    def connect(page, code=GOOD):
        page.fill("#tCode", code); page.click("#tConnect")
        page.wait_for_function("() => document.getElementById('tConnStatus').className.includes('ok') || document.getElementById('tConnStatus').className.includes('err')", timeout=15000)
        return page.inner_text("#tConnStatus")
    def chat(page, history_text, tools=True, scenario=None):
        return page.evaluate("""async ([t, tools]) => {
          const tool = { name: 'add_item', description: 'add', params: { text: { type: 'string' } }, run: (a) => ({ ok: true }) };
          return await dd.ai.chat({ history: [{ role: 'user', text: t }], tools: tools ? [tool] : undefined });
        }""", [history_text, tools])

    print("\n== connect ==")
    G.reset(); ctx, page, errs = fresh()
    txt = connect(page, "hello there")
    check("garbage code: friendly 'not a Google code' message", "doesn't look like a code from Google" in txt and friendly_only(txt), txt)
    check("garbage code: nothing saved", page.evaluate("() => !dd.ai.hasCode()"))
    txt = connect(page, "AIzaSyWRONG0123456789abcdefghijklmnopqr")
    check("wrong code: 'That code didn't work'", "That code didn't work" in txt and friendly_only(txt), txt)
    txt = connect(page, "  " + GOOD + "\n")
    check("good code with stray spaces connects", "Connected to Google" in txt, txt)
    check("setup made ONE REAL tool call (forced confirm_ready)", any("toolConfig" in c["body"] for c in G.calls))
    tc = [c for c in G.calls if "toolConfig" in c["body"]][0]["body"]
    decl = tc["tools"][0]["functionDeclarations"][0]
    check("'required' sits INSIDE parameters", "required" in decl["parameters"] and "required" not in decl)
    check("best model picked: stable Flash, not TTS/live/pro/gemma", [c for c in G.calls if "toolConfig" in c["body"]][0]["model"] == "gemini-3.8-flash")
    check("code sent in a header, never in a web address", all("key=" not in u for u in G.urls))
    check("header pill shows masked code", page.inner_text("#tConn").endswith("…pqrs)"))
    diag = page.evaluate("() => dd.diag.text()")
    check("diagnostic shows model + masked code, never the code", "gemini-3.8-flash" in diag and GOOD not in diag and "…pqrs" in diag)
    page.reload(); page.evaluate("() => { dd.ai.limits.request = 2500; dd.ai.limits.turn = 6000; }")
    check("connection survives reload", page.evaluate("() => dd.ai.hasCode()"))

    print("\n== tools and memory ==")
    G.reset(); page.click("#tTools")
    page.wait_for_function("() => /Pass|Only/.test(document.getElementById('tToolStatus').innerText) || document.getElementById('tToolStatus').className.includes('err')", timeout=15000)
    check("three tool calls in ONE reply: all three run", "Pass: all 3" in page.inner_text("#tToolStatus"), page.inner_text("#tToolStatus"))
    follow = G.calls[-1]["body"]["contents"]
    model_turn = [c for c in follow if c["role"] == "model"][0]["parts"]
    check("model's tool-call signature sent back unchanged", model_turn[0].get("thoughtSignature") == "sig-B")
    fr = follow[-1]["parts"]
    check("all three results sent back together, with ids", len(fr) == 3 and [x["functionResponse"].get("id") for x in fr] == ["f1", "f2", "f3"])
    page.fill("#tChatIn", "Add eggs to my list"); page.press("#tChatIn", "Enter")
    page.wait_for_function("() => document.querySelectorAll('.t-msg.bot').length >= 1", timeout=10000)
    page.fill("#tChatIn", "What did you just add?"); page.press("#tChatIn", "Enter")
    page.wait_for_function("() => document.querySelectorAll('.t-msg.bot').length >= 2", timeout=10000)
    check("chat remembers its own earlier tool call", page.locator(".t-msg.bot").nth(1).inner_text() == "You added eggs.", page.locator(".t-msg.bot").nth(1).inner_text())
    G.reset(); r = chat(page, "hi", tools=False)
    check("model's private 'thought' text never shown", r["ok"] and r["text"] == "Hello!", str(r.get("text")))

    print("\n== problems become friendly ==")
    G.reset("retired"); r = chat(page, "hi")
    check("retired model: quietly moves to the next model", r["ok"] and G.calls[-1]["model"] == "gemini-3.5-flash-lite", json.dumps([c["model"] for c in G.calls]))
    page.evaluate("() => { const k='dd_ai_models_v1', m=JSON.parse(localStorage.getItem(k)); m.google.model='gemini-3.8-flash'; m.google.candidates=['gemini-3.8-flash','gemini-3.5-flash-lite']; m.google.busy={}; localStorage.setItem(k, JSON.stringify(m)); }")
    G.reset("busy_main"); r = chat(page, "hi")
    check("main model busy (503): switches to the next model, answers", r["ok"] and [c["model"] for c in G.calls] == ["gemini-3.8-flash", "gemini-3.5-flash-lite"], json.dumps([c["model"] for c in G.calls]))
    G.reset("busy_main"); r = chat(page, "hi")
    check("busy model remembered: next turn skips it", r["ok"] and [c["model"] for c in G.calls] == ["gemini-3.5-flash-lite"], json.dumps([c["model"] for c in G.calls]))
    check("support details list the busy model", "Busy right now: gemini-3.8-flash" in page.evaluate("() => dd.diag.text()"))
    page.evaluate("() => { const k='dd_ai_models_v1', m=JSON.parse(localStorage.getItem(k)); m.google.busy={}; localStorage.setItem(k, JSON.stringify(m)); }")
    G.reset("busy_once"); r = chat(page, "hi")
    check("Google busy once: retried, buyer sees an answer", r["ok"] and len(G.calls) == 2)
    G.reset("minute_once"); r = chat(page, "hi")
    check("per-minute limit: waits and retries once", r["ok"] and len(G.calls) == 2)
    G.reset("daily"); r = chat(page, "hi")
    check("daily limit: 'You've used today's free share'", (not r["ok"]) and r["type"] == "out_of_share" and "free share" in r["title"] and len(G.calls) == 1)
    G.reset("badrequest"); r = chat(page, "hi")
    check("a 400 that isn't about the code does NOT say 'bad code'", r["type"] == "unexpected" and "code" not in r["title"].lower(), r["title"])
    G.reset("leaked"); r = chat(page, "hi")
    check("leaked/blocked code: 'isn't allowed', make a new one", r["type"] == "not_allowed" and "new code" in r["help"])
    G.reset("region"); r = chat(page, "hi")
    check("region not supported: says so in plain words", r["type"] == "not_allowed" and "country" in r["help"])
    G.reset("hang"); r = chat(page, "hi")
    check("Google never answers: stops waiting, 'took too long'", r["type"] == "timeout" and "too long" in r["title"])
    diag = page.evaluate("() => dd.diag.text()")
    check("timeout recorded in support details with seconds", "TIMED OUT" in diag and "no answer within" in diag, diag[-400:])
    G.reset()
    rows = page.evaluate("() => dd.ai.speedCheck(5000)")
    check("speed check times list, plain and tool answers", len(rows) >= 3 and rows[-1]["outcome"].startswith("ok") and rows[-1]["step"].startswith("tool answer"), json.dumps(rows))
    G.reset("loop"); r = chat(page, "add stuff")
    check("model keeps calling tools: capped at 5 rounds", r["ok"] and r.get("cappedRounds") and len(G.calls) == 6, f"calls={len(G.calls)}")
    G.reset("hang")
    page.evaluate("() => { dd.ai.limits.request = 20000; dd.ai.limits.turn = 30000; window.__r = null; dd.ai.chat({history:[{role:'user',text:'hi'}]}).then(r => window.__r = r); }")
    page.wait_for_timeout(500); page.evaluate("() => dd.ai.stop()")
    page.wait_for_function("() => window.__r !== null", timeout=3000)
    check("Stop ends a stuck request at once", page.evaluate("() => window.__r.stopped === true"))
    page.evaluate("() => { dd.ai.limits.request = 2500; dd.ai.limits.turn = 6000; }")
    for drill, words in [("out_of_share", "free share"), ("offline", "internet"), ("timeout", "too long")]:
        G.reset()
        page.evaluate("() => { const s = document.getElementById('tDrillStatus'); s.className = 'dd-status'; s.textContent = ''; }")
        page.click(f"[data-drill={drill}]")
        page.wait_for_function("() => document.getElementById('tDrillStatus').className.includes('err') || document.getElementById('tDrillStatus').className.includes('ok')", timeout=12000)
        t = page.inner_text("#tDrillStatus")
        check(f"drill '{drill}': friendly message only", words in t.lower() and friendly_only(t), t)
    check("no page errors", not errs, "; ".join(errs[:3]))
    ctx.close()

    print("\n== POC code moves across ==")
    G.reset(); ctx, page, errs = fresh()
    page.evaluate(f"() => localStorage.setItem('dd_gemini_key_v1', '{GOOD}')"); page.reload()
    check("old Profit Coach key found and moved", page.evaluate("() => dd.ai.hasCode() && !localStorage.getItem('dd_gemini_key_v1') && !!localStorage.getItem('dd_ai_connections_v1')"))
    page.click("#tForget"); page.click("text=Forget it")
    check("Forget my code removes it", page.evaluate("() => !dd.ai.hasCode() && !localStorage.getItem('dd_ai_connections_v1')"))
    ctx.close()

    print("\n== noticeboard ==")
    notes = {"version": 1, "helpLinks": {"getCode_google": "https://example.com/new-google-page", "evil": "javascript:alert(1)"},
             "labels": {"createKey": "Create API key"}, "notice": {"id": "n1", "text": "Google's free plan is slow today."},
             "modelHints": {"google": {"avoid": ["gemini-3.8-flash"]}}, "sneaky": {"base": "https://evil.example"}}
    G.reset(); ctx, page, errs = fresh(notes=notes)
    reqs = []; page.on("request", lambda r: reqs.append(r) if "github.io" in r.url else None)
    page.wait_for_selector("#dd-notice-board", timeout=5000)
    check("notice shows at the top", "slow today" in page.inner_text("#dd-notice-board"))
    check("updated help link used", page.evaluate("() => dd.ai.getCodeLink('google')") == "https://example.com/new-google-page")
    check("unsafe link dropped", page.evaluate("() => dd.notes.link('evil', 'fallback')") == "fallback")
    check("unknown sections ignored", page.evaluate("() => dd.notes.get('sneaky') === undefined"))
    check("model hint 'avoid' respected", page.evaluate("() => dd.ai.rankModels('google', ['gemini-3.8-flash','gemini-3.5-flash-lite'])[0]") == "gemini-3.5-flash-lite")
    page.click("#dd-notice-board >> text=Got it"); reqs.clear(); page.reload(); page.wait_for_timeout(2500)
    check("dismissed notice stays dismissed", page.locator("#dd-notice-board").count() == 0)
    check("checked at most weekly (no second download)", len(reqs) == 0, f"{len(reqs)} requests")
    page.click("#dd-privacy-link")
    pv = page.inner_text(".dd-sheet")
    check("Privacy says it checks the noticeboard weekly, sends nothing", "Once a week" in pv and "noticeboard" in pv and "never sent" in pv)
    page.keyboard.press("Escape")
    check("no page errors", not errs, "; ".join(errs[:3]))
    ctx.close()
    G.reset(); ctx, page, errs = fresh()   # noticeboard missing (404)
    page.wait_for_timeout(2500)
    check("noticeboard missing: page works, no notice, no errors", page.locator("#dd-notice-board").count() == 0 and not errs)
    ctx.close()

    print("\n== iPhone layout ==")
    G.reset(); ctx, page, errs = fresh(p.devices["iPhone 13"])
    check("AI test page fits an iPhone (no sideways scroll)", page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth"))
    os.makedirs(os.path.join(ROOT, "tests", "screenshots"), exist_ok=True)
    connect(page); page.screenshot(path=os.path.join(ROOT, "tests", "screenshots", "aitest-iphone.png"), full_page=True)
    ctx.close()
    b.close()
srv.shutdown()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
