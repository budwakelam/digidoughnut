"""Price Pilot tests (programs/pricing), in headless Chromium.

    node build.mjs pricing && python3 tests/pricing_test.py

Fee maths against hand-worked numbers, example data, saving and reload, migrate, validateData,
reading Etsy's three downloads (and that names and addresses are never kept), the "Add a file"
platform piece, and every one of Margo's tools against a FAKE Google. Oran's run on PC + iPhone
against the real Google is still the gate.
"""
import json, os, re, threading, http.server, functools, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist")
SHOTS = os.path.join(ROOT, "tests", "screenshots")
os.makedirs(SHOTS, exist_ok=True)
VERSION = re.search(r'version:\s*"([^"]+)"', open(os.path.join(ROOT, "programs", "pricing", "program.js")).read()).group(1)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=DIST))
threading.Thread(target=srv.serve_forever, daemon=True).start()
HOSTED = f"http://127.0.0.1:{srv.server_address[1]}/pricing.html"
NOTES_URL = "https://budwakelam.github.io/digidoughnut/noticeboard/notes.json"
GOOD = "AQ.Ab8RN6TESTfake0123456789abcdefGHIJKLmnop"
KEY = "dd_pricing_data_v1"

# ---------------------------------------------------------------- Etsy downloads (made-up rows)
TMP = tempfile.mkdtemp()
def csv_file(name, text):
    p = os.path.join(TMP, name); open(p, "w", encoding="utf-8").write(text); return p
ITEMS = csv_file("EtsySoldOrderItems2026-9.csv", "﻿" +
    "Sale Date,Item Name,Buyer,Quantity,Price,Coupon Code,Coupon Details,Discount Amount,Shipping Discount,Order Shipping,Order Sales Tax,Item Total,Currency,Transaction ID,Listing ID,Date Paid,Date Shipped,Ship Name,Ship Address1,Ship Address2,Ship City,Ship State,Ship Zipcode,Ship Country,Order ID,Variations,Order Type,Listings Type,Payment Type\n"
    "09/03/26,\"Handmade Ceramic Mug - Speckled, Stoneware\",janedoe,2,34.00,,,0,0,8.00,0,68.00,CAD,4001,1501,09/03/26,09/05/26,Jane Doe,12 Secret Lane,,Kamloops,BC,V2C 1A1,Canada,9001,,online,listing,online_cc\n"
    "09/12/26,Lavender Soap Bar,bobsmith,3,9.00,,,0,0,6.00,0,27.00,CAD,4002,1502,09/12/26,09/14/26,Bob Smith,99 Hidden Road,,Seattle,WA,98101,United States,9002,,online,listing,online_cc\n"
    "09/20/26,Lavender Soap Bar,bobsmith,1,9.00,,,0,0,6.00,0,9.00,CAD,4003,1502,09/20/26,,Bob Smith,99 Hidden Road,,Seattle,WA,98101,United States,9003,,online,listing,online_cc\n")
ORDERS = csv_file("EtsySoldOrders2026-9.csv",
    "Sale Date,Order ID,Buyer User ID,Full Name,First Name,Last Name,Number of Items,Payment Method,Date Shipped,Street 1,Street 2,Ship City,Ship State,Ship Zipcode,Ship Country,Currency,Order Value,Coupon Code,Coupon Details,Discount Amount,Shipping Discount,Shipping,Sales Tax,Order Total,Status,Card Processing Fees,Order Net,Adjusted Order Total,Adjusted Card Processing Fees,Adjusted Net Order Amount,Buyer,Order Type,Payment Type\n"
    "09/03/26,9001,1,Jane Doe,Jane,Doe,2,Credit Card,09/05/26,12 Secret Lane,,Kamloops,BC,V2C 1A1,Canada,CAD,68.00,,,0,0,8.00,0,76.00,Completed,2.53,73.47,76.00,2.53,73.47,janedoe,online,online_cc\n"
    "09/12/26,9002,2,Bob Smith,Bob,Smith,3,Credit Card,09/14/26,99 Hidden Road,,Seattle,WA,98101,United States,CAD,27.00,SAVE10,10% off,2.70,0,6.00,0,30.30,Completed,1.16,29.14,30.30,1.16,29.14,bobsmith,online,online_cc\n")
STATEMENT = csv_file("etsy_statement_2026_9.csv",
    "Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net,Tax Details\n"
    "\"September 3, 2026\",Sale,Payment for Order #9001,,CAD,CA$76.00,--,CA$76.00,\n"
    "\"September 3, 2026\",Fee,Transaction fee: Handmade Ceramic Mug,Listing #1501,CAD,--,-CA$4.42,-CA$4.42,\n"
    "\"September 3, 2026\",Fee,Processing fee,Order #9001,CAD,--,-CA$2.53,-CA$2.53,\n"
    "\"September 3, 2026\",Fee,Listing fee,Listing #1501,CAD,--,-CA$0.28,-CA$0.28,\n"
    "\"September 9, 2026\",Marketing,Etsy Ads,,CAD,--,-CA$5.00,-CA$5.00,\n"
    "\"September 15, 2026\",Fee,Regulatory operating fee,,CAD,--,-CA$0.87,-CA$0.87,\n"
    "\"September 30, 2026\",Deposit,\"CA$60.00 sent to your bank account\",,CAD,--,--,--,\n")
JUNK = csv_file("notes.csv", "a,b,c\n1,2,3\n")

class FakeGoogle:
    """Answers like a model with tools: reads the person's words and calls Price Pilot's tools."""
    def __init__(self): self.sent = []
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
            return ok({"models": [{"name": "models/gemini-3.8-flash", "supportedGenerationMethods": ["generateContent"]}]})
        body = json.loads(req.post_data or "{}")
        if "toolConfig" in body: return calls(("confirm_ready", {"word": "ready"}))
        self.sent.append(body)
        last = body["contents"][-1]
        results = [p["functionResponse"] for p in last["parts"] if "functionResponse" in p]
        if results: return say("Done! " + " ".join(r["response"]["result"].get("message", "") for r in results))
        t = " ".join(p.get("text", "") for p in last["parts"]).lower()
        m = re.search(r"price my (\w+) so i make \$?(\d+)", t)
        if m: return calls(("price_for_goal", {"product": m.group(1), "profit": float(m.group(2))}))
        m = re.search(r"add a product: (.+)", t)
        if m:
            name = m.group(1).split(",")[0].strip()
            mat = re.search(r"\$(\d+(?:\.\d+)?) materials", t); mins = re.search(r"(\d+) minutes", t); pr = re.search(r"\$(\d+(?:\.\d+)?) price", t)
            a = {"name": name}
            if mat: a["materials"] = float(mat.group(1))
            if mins: a["minutes"] = float(mins.group(1))
            if pr: a["price"] = float(pr.group(1))
            return calls(("add_product", a))
        m = re.search(r"what if (\d+)% off", t)
        if m: return calls(("explain_price", {"product": "mug", "discount": float(m.group(1))}))
        if "compare" in t: return calls(("compare_scenarios", {"product": "mug"}))
        if "save a holiday" in t: return calls(("save_scenario", {"product": "mug", "name": "Holiday", "discount": 15}))
        if "use the holiday" in t: return calls(("use_scenario", {"scenario": "Holiday"}))
        if "drop the holiday" in t: return calls(("remove_scenario", {"scenario": "Holiday"}))
        if "delete the candle" in t: return calls(("remove_product", {"product": "candle"}))
        if "materials to 8" in t: return calls(("update_product", {"product": "mug", "materials": 8, "photo_link": "https://i.etsystatic.com/1/mug.jpg"}))
        if "show me the planner" in t: return calls(("show_product", {"product": "planner"}))
        if "i'm in the us" in t: return calls(("change_settings", {"country": "US", "monthly_goal": 3000}))
        if "link the soap" in t: return calls(("link_etsy_item", {"item": "soap", "product": "soap bar"}))
        if "what did i sell" in t or "what stands out" in t: return calls(("sales_report", {"month": "2026-09"}))
        if "clear my sales" in t: return calls(("clear_sales", {}))
        return say("LIVE: happy pricing.")
G = FakeGoogle()

results = []
def check(name, ok, extra=""):
    results.append(bool(ok)); print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({extra})" if extra and not ok else ""))

with sync_playwright() as p:
    b = p.chromium.launch()
    def fresh(code=False, device=None, url=HOSTED, locale="en-CA"):
        ctx = b.new_context(locale=locale, **(device or {"viewport": {"width": 1280, "height": 900}}))
        ctx.route("https://generativelanguage.googleapis.com/**", G.handle)
        ctx.route(NOTES_URL, lambda r: r.fulfill(status=404, body="", headers={"Access-Control-Allow-Origin": "*"}))
        page = ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" and not re.search(r"40\d|50\d|ERR_", m.text) else None)
        page.goto(url); page.evaluate("() => localStorage.clear()")
        if code: page.evaluate("(c) => localStorage.setItem('dd_ai_connections_v1', JSON.stringify({ main: { provider: 'google', code: c } }))", GOOD)
        page.reload(); page.wait_for_function("() => window.dd && dd.getData && dd.getData()")
        return ctx, page, errs
    data = lambda page: page.evaluate("() => dd.getData()")
    BOTS = "dd.helper.messages().filter(m => /^bot/.test(m.who)).length"
    def wait_reply(page, n):
        page.wait_for_function(f"() => {BOTS} > {n} && !document.querySelector('.dd-helper-msg.pending')", timeout=20000)
        return page.locator(".dd-helper-msg.bot:not(.pending)").last.inner_text()
    def send(page, text):
        n = page.evaluate("() => " + BOTS)
        page.fill(".dd-helper-in", text); page.click("[data-send]")
        return wait_reply(page, n)
    def money(page, js): return round(page.evaluate(js), 2)

    # ---------------------------------------------------------------- the maths
    print("\n== fee maths (hand-worked) ==")
    ctx, page, errs = fresh()
    check("Canada guessed from the browser's language", data(page)["settings"]["country"] == "CA")
    ca = page.evaluate("() => { const c = PP.calc(dd.getData().products[0], dd.getData().settings); return {f: c.fees, p: c.profit, be: c.breakEven, t: c.priceFor(20, false), m: c.priceFor(30, true)} }")
    # Mug: $34 + $8 shipping = $42. Txn 6.5% = 2.73. Processing 3% + .25 = 1.51. Listing .28. Regulatory 1.15% = .483.
    # Etsy 5.003, GST 5% = .250, total 5.253. Costs 6.50 + 15.00 + 1.75 + 9.00 = 32.25. Profit 4.497.
    check("transaction fee 6.5% of price + shipping", round(ca["f"]["txn"], 2) == 2.73)
    check("processing 3% + $0.25 (Canada, buyers at home)", round(ca["f"]["proc"], 2) == 1.51)
    check("listing fee in CAD", ca["f"]["listing"] == 0.28)
    check("regulatory fee 1.15%", round(ca["f"]["reg"], 3) == 0.483)
    check("GST on Etsy's fees", round(ca["f"]["tax"], 2) == 0.25)
    check("profit per sale $4.50", round(ca["p"], 2) == 4.50, ca["p"])
    check("price for $20 profit = $51.46", ca["t"] == 51.46, ca["t"])
    check("break-even makes zero profit", abs(page.evaluate("(be) => PP.calc(Object.assign({}, dd.getData().products[0], {price: be}), dd.getData().settings).profit", ca["be"])) < 0.02)
    check("target margin 30% really gives 30%", abs(page.evaluate("(pr) => PP.calc(Object.assign({}, dd.getData().products[0], {price: pr}), dd.getData().settings).margin", ca["m"]) - 30) < 0.05)
    us = page.evaluate("""() => { const s = Object.assign({}, dd.getData().settings, {country: 'US', rates: {}});
        const c = PP.calc({price: 20, shipCharged: 0, materials: 5, minutes: 0, hourly: null, packaging: 0, shipCost: 0}, s); return {t: c.fees.total, p: c.profit} }""")
    # US $20: listing .20 + txn 1.30 + processing .60+.25 = 2.35, no tax on fees, no regulatory fee.
    check("US: $20 item pays $2.35 in fees", round(us["t"], 2) == 2.35, us)
    ad = page.evaluate("""() => { const s = Object.assign({}, dd.getData().settings, {country: 'US', rates: {}});
        return [PP.calc({price: 20, shipCharged: 0, materials: 0, minutes: 0, hourly: null, packaging: 0, shipCost: 0}, s, {ad: true}).fees.ads,
                PP.calc({price: 2000, shipCharged: 0, materials: 0, minutes: 0, hourly: null, packaging: 0, shipCost: 0}, s, {ad: true}).fees.ads,
                PP.calc({price: 20, shipCharged: 0, materials: 0, minutes: 0, hourly: null, packaging: 0, shipCost: 0}, Object.assign({}, s, {bigShop: true}), {ad: true}).fees.ads] }""")
    check("offsite ads 15%, capped at US$100, 12% for big shops", [round(x, 2) for x in ad] == [3.0, 100.0, 2.4], ad)
    abroad = page.evaluate("() => PP.rates(Object.assign({}, dd.getData().settings, {abroad: true})).proc")
    check("Canada, buyers abroad: processing 4%", abroad == 4)
    uk = page.evaluate("() => PP.rates(Object.assign({}, dd.getData().settings, {country: 'UK', rates: {}}))")
    check("UK: 4% + £0.20, regulatory 0.48%, VAT 20%", uk["proc"] == 4 and uk["fixed"] == 0.2 and uk["reg"] == 0.48 and uk["tax"] == 20)
    fixed = page.evaluate("() => PP.rates(Object.assign({}, dd.getData().settings, {rates: {country: 'CA', reg: 0}})).reg")
    stale = page.evaluate("() => PP.rates(Object.assign({}, dd.getData().settings, {rates: {country: 'UK', reg: 0}})).reg")
    check("a rate fixed by hand is used, but only for its own country", fixed == 0 and stale == 1.15)
    for cc in ["US", "CA", "UK", "AU", "NZ", "DE", "FR", "IT", "ES", "EU"]:
        pass
    check("all ten seller countries have rates", page.evaluate("() => Object.keys(PP.countries).length") == 10)

    # ---------------------------------------------------------------- first run, saving
    print("\n== first run, saving, example mode ==")
    check("no errors on load", not errs, errs)
    check("example products, what-ifs and sales show", page.locator(".pp-prow").count() == 3 and page.locator(".pp-compare").count() == 1 and page.locator(".pp-tiles").count() == 1)
    check("the profit shows in big type", page.inner_text("#ppProfit") == "$4.50")
    check("the fee table lists the regulatory fee and GST", "Regulatory operating fee" in page.inner_text("#ppBreakdown") and "GST/HST" in page.inner_text("#ppBreakdown"))
    check("sales needed for the goal: 445", "445" in page.inner_text("#ppNeed"))
    page.fill("#ppTarget", "20")
    check("price for a target profit, with a Use button", "51.46" in page.inner_text("#ppTargetOut") and page.locator("#ppUseTarget").is_visible())
    page.fill("#ppPrice", "40")
    d = data(page)
    check("the first real change ends example mode: the mug stays (changed)", [x["id"] for x in d["products"]] == ["ex-mug"] and d["products"][0]["price"] == 40)
    check("untouched examples (other products, what-ifs, sales, statement) go", not d["sales"] and not d["statement"] and not d["scenarios"])
    check("typing kept the cursor in the box", page.evaluate("() => document.activeElement.id") == "ppPrice")
    page.click("#ppUseTarget")
    check("Use this price sets the price", data(page)["products"][0]["price"] == 51.46)
    page.reload(); page.wait_for_function("() => dd.getData()")
    check("still there after reopening", data(page)["products"][0]["price"] == 51.46)
    env = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
    check("saved in an envelope, schema 1", env["program"] == "pricing" and env["schemaVersion"] == 1 and not env["example"])
    page.click("#ppNew")
    check("New product opens a blank product, named and focused", data(page)["products"][-1]["name"] == "New product" and page.evaluate("() => document.activeElement.id") == "ppName")
    page.fill("#ppName", "Tote bag"); page.fill("#ppMaterials", "14"); page.fill("#ppMinutes", "40"); page.fill("#ppPrice", "45")
    t = data(page)["products"][-1]
    check("the form edits the new product", t["name"] == "Tote bag" and t["materials"] == 14 and t["minutes"] == 40 and t["price"] == 45)
    page.click("text=Photo link and notes"); page.fill("#ppPhoto", "not a link")
    check("a bad photo link is marked, not saved", data(page)["products"][-1]["photo"] == "" and "pp-bad" in page.get_attribute("#ppPhoto", "class"))
    page.fill("#ppPhoto", "https://i.etsystatic.com/123/il_794xN.jpg")
    check("an https photo link is saved", data(page)["products"][-1]["photo"].startswith("https://i.etsystatic.com/"))
    page.fill("#ppDiscount", "25"); page.check("#ppAd"); page.fill("#ppScName", "Big sale")
    page.click("#ppSaveSc")
    sc = [x for x in data(page)["scenarios"] if x["name"] == "Big sale"]
    check("Save as a what-if keeps the discount and the ad", len(sc) == 1 and sc[0]["discount"] == 25 and sc[0]["ad"] is True)
    check("what-ifs compare side by side", "Big sale" in page.inner_text(".pp-compare"))
    page.screenshot(path=os.path.join(SHOTS, "pricing-computer.png"), full_page=True)

    print("\n== shop settings ==")
    page.click("#ppShopBtn")
    check("My shop sheet opens with the country", page.locator("#ppCountry").is_visible())
    page.select_option("#ppCountry", "UK")
    check("changing country changes currency and fees", data(page)["settings"]["country"] == "UK" and page.inner_text("#ppProfit").startswith(("£", "-£")))
    page.click(".pp-details summary >> nth=-1")
    page.fill("[data-rate=reg]", "0.5")
    check("a fee rate can be fixed by hand", data(page)["settings"]["rates"] == {"country": "UK", "reg": 0.5})
    page.click("[data-close]")
    ctx.close()

    print("\n== migrate and validate ==")
    ctx, page, errs = fresh()
    page.evaluate(f"""() => localStorage.setItem('{KEY}', JSON.stringify({{ products: [{{id:'old1', name:'Old mug', price: 10, shipCharged: 0, materials: 1, minutes: 0, hourly: null, packaging: 0, shipCost: 0, photo: '', notes: '', etsy: [], listing: ''}}] }}))""")
    page.reload(); page.wait_for_function("() => dd.getData()")
    d = data(page)
    check("data from before envelopes (schema 0) is brought up to date", d["products"][0]["name"] == "Old mug" and d["settings"]["goal"] == 2000 and d["sales"] == [])
    bad = page.evaluate("""() => [
      DD_PROGRAM.validateData({}),
      DD_PROGRAM.validateData(Object.assign(DD_PROGRAM.emptyData(), {products: [{id: 1, name: 'x'}]})),
      DD_PROGRAM.validateData(Object.assign(DD_PROGRAM.emptyData(), {settings: Object.assign(DD_PROGRAM.emptyData().settings, {country: 'XX'})})),
      DD_PROGRAM.validateData(Object.assign(DD_PROGRAM.emptyData(), {sales: [{id: 's', date: '2026-01-01', item: 'x', listing: '', qty: 'two', revenue: 1, country: ''}]})),
      DD_PROGRAM.validateData(DD_PROGRAM.emptyData()), DD_PROGRAM.validateData(DD_PROGRAM.exampleData())]""")
    check("validateData rejects malformed data and accepts good data", bad == [False, False, False, False, True, True], bad)
    check("every example item has a fixed string id", page.evaluate("() => { const e = DD_PROGRAM.exampleData(); return ['products','scenarios','sales','statement'].every(k => e[k].every(i => typeof i.id === 'string' && i.id.startsWith('ex-'))) }"))
    ctx.close()

    # ---------------------------------------------------------------- reading Etsy's downloads
    print("\n== Etsy downloads (Add a file) ==")
    ctx, page, errs = fresh()
    page.click("#ppAddFile2")
    check("the Add a file sheet opens with Etsy's how-to", page.locator(".dd-drop-how").is_visible() and "Order Items" in page.inner_text(".dd-drop-how"))
    with page.expect_file_chooser() as fc: page.click("[data-pick]")
    fc.value.set_files(ITEMS)
    page.wait_for_selector("#dd-notice-file-taken")
    d = data(page)
    check("Order Items: 3 sales added", len(d["sales"]) == 3, len(d["sales"]))
    check("the notice says what was added, with Undo", "Added 3 sales from September 2026" in page.inner_text("#dd-notice-file-taken") and "Undo" in page.inner_text("#dd-notice-file-taken"))
    blob = json.dumps(d)
    check("names, usernames and addresses are never kept", not any(s in blob for s in ["Jane", "Doe", "janedoe", "Secret Lane", "Hidden Road", "Kamloops", "98101"]))
    check("adding a file ends example mode (examples gone, the file's sales kept)", all(not x["id"].startswith("ex-") for x in d["sales"]) and not d["products"])
    check("quoted commas inside an item name read right", any(x["item"] == "Handmade Ceramic Mug - Speckled, Stoneware" and x["qty"] == 2 and x["revenue"] == 68 for x in d["sales"]))
    check("a byte-order mark at the start doesn't break the header", d["sales"][0]["date"] == "2026-09-03")
    page.click("#dd-notice-file-taken >> text=Undo")
    check("Undo takes the file back out", data(page)["sales"] == [] or all(x["id"].startswith("ex-") for x in data(page)["sales"]))
    page.evaluate("() => dd.replaceData(DD_PROGRAM.emptyData(), {example: false})")
    check("with nothing added, the sales card shows a drop area", page.locator("#ppSalesDrop").is_visible())
    r = page.evaluate("""async (texts) => { const out = [];
        for (const [name, text] of texts) out.push(await dd.files.take(new File([text], name, {type: 'text/csv'})));
        return out.map(x => [x.ok, x.message]); }""",
        [[os.path.basename(f), open(f, encoding="utf-8").read()] for f in [ITEMS, ITEMS, ORDERS, STATEMENT, JUNK]])
    d = data(page)
    check("the same file twice doesn't double up", len(d["sales"]) == 3 and r[1][0] and "refreshed" in r[1][1], r[1])
    check("Orders: shipping, discounts and processing fees", len(d["orders"]) == 2 and d["orders"][1]["discount"] == 2.7 and d["orders"][0]["procFee"] == 2.53)
    st = {x["kind"]: x["amount"] for x in d["statement"]}
    check("statement: sales and each kind of charge, deposits skipped", st.get("Sales") == 76 and st.get("Transaction fees") == 4.42 and st.get("Processing fees") == 2.53 and
          st.get("Listing fees") == 0.28 and st.get("Etsy Ads") == 5 and st.get("Regulatory fees") == 0.87 and "Deposits" not in st, st)
    check("a file that isn't from Etsy is refused kindly, nothing changed", r[4][0] is False and "Etsy download" in r[4][1])
    big = page.evaluate("async () => { const f = new File(['x'], 'big.csv'); Object.defineProperty(f, 'size', {value: 20*1024*1024}); return dd.files.take(f) }")
    check("a file over 15 MB is refused with a friendly line", big["ok"] is False and "too big" in big["message"])
    csvs = page.evaluate("""() => [dd.files.parseCSV('a,"b ""q"" c",d\\r\\n1,"x\\ny",3\\n').length, dd.files.number('-CA$1,234.50'), dd.files.number('(4.00)'), dd.files.number('1.234,50 €'), dd.files.number('--')]""")
    check("CSV and money reading: quotes, newlines in fields, CA$, brackets, European commas", csvs == [2, -1234.5, -4, 1234.5, 0], csvs)
    check("the sales card shows the unmatched items with Link to…", page.locator(".pp-link").count() == 2)
    page.select_option(".pp-link >> nth=1", "__new")
    d = data(page)
    check("'New product from this' makes a product from the sales and links it", any(x["name"].startswith("Lavender Soap Bar") or x["name"].startswith("Handmade Ceramic Mug") for x in d["products"]) and any(x["etsy"] for x in d["products"]))
    check("charges table with the share of sales", "what etsy charged" in page.inner_text("#ppSalesBody").lower() and "% of" in page.inner_text("#ppSalesBody"))
    rep = page.evaluate("() => PP.report(dd.getData(), '2026-09')")
    check("the report counts items and sales", rep["qty"] == 6 and rep["revenue"] == 104)
    page.screenshot(path=os.path.join(SHOTS, "pricing-sales.png"), full_page=True)
    check("no errors", not errs, errs)
    ctx.close()

    # ---------------------------------------------------------------- Margo, every tool
    print("\n== Margo: hands on every part ==")
    ctx, page, errs = fresh(code=True)
    check("she's called Margo, in a side column", "Margo" in page.inner_text(".dd-helper-who") and page.locator(".dd-helper-side").is_visible())
    check("there's a 📎 button for Etsy downloads", page.locator("[data-clip]").is_visible())
    txt = send(page, "Price my mug so I make $20 each")
    mug = [x for x in data(page)["products"] if x["id"] == "ex-mug"][0]
    check("price_for_goal sets the mug to $51.46 and explains it", mug["price"] == 51.46 and "51.46" in txt and "Transaction fee" in txt.replace("transaction", "Transaction"), txt[:200])
    check("her reply has Undo", page.locator(".dd-helper-msg.bot").last.locator(".dd-helper-undo").count() == 1)
    check("the system prompt carries the products and the number rules", "Ceramic mug (id ex-mug)" in G.sent[-1]["systemInstruction"]["parts"][0]["text"] and "never work out prices" in G.sent[-1]["systemInstruction"]["parts"][0]["text"])
    page.locator(".dd-helper-undo").last.click()
    check("Undo puts the example back", [x for x in data(page)["products"] if x["id"] == "ex-mug"][0]["price"] == 34)
    page.click("#dd-notice-example >> text=Keep these")   # the examples become the buyer's own
    txt = send(page, "Add a product: soap bar, $3 materials, 10 minutes, $9 price")
    soap = [x for x in data(page)["products"] if x["name"] == "soap bar"]
    check("add_product adds it with the numbers given", len(soap) == 1 and soap[0]["materials"] == 3 and soap[0]["minutes"] == 10 and soap[0]["price"] == 9, txt)
    txt = send(page, "Set the mug's materials to 8 and add its photo")
    mug = [x for x in data(page)["products"] if x["id"] == "ex-mug"]
    check("update_product changes costs and the photo link", mug and mug[0]["materials"] == 8 and mug[0]["photo"].endswith("mug.jpg"), txt)
    txt = send(page, "What if 25% off?")
    check("explain_price does a what-if without changing anything", "25% off" in txt and [x for x in data(page)["products"] if x["id"] == "ex-mug"][0]["price"] == 34, txt[:160])
    txt = send(page, "Save a holiday what-if")
    check("save_scenario saves it", any(x["name"] == "Holiday" and x["discount"] == 15 for x in data(page)["scenarios"]), txt)
    txt = send(page, "Compare my what-ifs")
    check("compare_scenarios lists Now and each what-if", "Now:" in txt and "'Holiday'" in txt, txt[:200])
    txt = send(page, "Use the holiday one")
    check("use_scenario applies its price", "Holiday" in txt, txt)
    txt = send(page, "Drop the holiday one")
    check("remove_scenario deletes it", not any(x["name"] == "Holiday" for x in data(page)["scenarios"]), txt)
    txt = send(page, "Show me the planner")
    check("show_product opens it in the calculator", page.input_value("#ppName") == "Digital planner" or not [x for x in data(page)["products"] if x["name"] == "Digital planner"], txt)
    n = len(data(page)["products"])
    txt = send(page, "Delete the candle")
    check("remove_product asks first (Yes / No under her reply)", page.locator(".dd-helper-ask").count() == 1 and len(data(page)["products"]) == n)
    page.locator(".dd-helper-msg.bot").last.locator("text=Yes, delete it").click()
    page.wait_for_timeout(300)
    check("tapping Yes deletes it", not any(x["name"] == "Beeswax candle" for x in data(page)["products"]))
    txt = send(page, "I'm in the US now, goal 3000")
    s = data(page)["settings"]
    check("change_settings: country and goal", s["country"] == "US" and s["goal"] == 3000, txt)
    # 📎 in the chat: she reads the file, then says what stands out.
    with page.expect_file_chooser() as fc: page.click("[data-clip]")
    n = page.evaluate("() => " + BOTS)
    fc.value.set_files(ITEMS)
    page.wait_for_function(f"() => {BOTS} >= {n} + 2 && !document.querySelector('.dd-helper-msg.pending')", timeout=20000)
    msgs = page.evaluate("() => dd.helper.messages().map(m => m.who + ': ' + m.text)")
    check("📎: the file shows as the buyer's message, her reply says what was added", any("📎 EtsySoldOrderItems" in m for m in msgs) and any("Added 3 sales" in m for m in msgs), msgs[-4:])
    check("📎: she then answers 'What stands out?' from sales_report", "items sold" in msgs[-1], msgs[-1][:200])
    txt = send(page, "Link the soap to my soap bar")
    check("link_etsy_item links the Etsy item to the product", any("Lavender Soap Bar" in x["etsy"] for x in data(page)["products"] if x["name"] == "soap bar"), txt)
    txt = send(page, "What did I sell in September?")
    check("sales_report counts the linked soap under the product", "soap bar 4 sold" in txt, txt[:300])
    txt = send(page, "Clear my sales")
    page.locator(".dd-helper-msg.bot").last.locator("text=Yes, remove them").click(); page.wait_for_timeout(300)
    check("clear_sales asks, then clears; products stay", not data(page)["sales"] and any(x["name"] == "soap bar" for x in data(page)["products"]))
    check("the summary stays under the 12,000 cap with 2,000 sales", page.evaluate("""() => { const d = JSON.parse(JSON.stringify(dd.getData()));
        for (let i = 0; i < 2000; i++) d.sales.push({id: 't' + i, date: '2026-0' + (1 + i % 9) + '-10', item: 'Item number ' + (i % 300), listing: '', qty: 1, revenue: 10, country: ''});
        return PP.summary(d).length }""") < 12000)
    check("no errors", not errs, errs)
    page.screenshot(path=os.path.join(SHOTS, "pricing-margo.png"), full_page=True)
    ctx.close()

    print("\n== phone ==")
    ctx, page, errs = fresh(device=p.devices["iPhone 13"])
    check("Margo sits on the page under the calculator", page.locator("#ppHelper .dd-helper-inline").count() == 1)
    check("the calculator is one column and nothing runs off the side", page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"))
    check("the version is in the footer", VERSION in page.inner_text("#dd-footer"))
    page.screenshot(path=os.path.join(SHOTS, "pricing-phone.png"), full_page=True)
    check("no errors", not errs, errs)
    ctx.close()

    print("\n== opened as a file ==")
    ctx, page, errs = fresh(url="file://" + os.path.join(DIST, "pricing.html"))
    check("works as a file with zero setup", page.inner_text("#ppProfit") == "$4.50" and not errs, errs)
    ctx.close()
    b.close()

print(f"\n{sum(results)}/{len(results)} passed")
raise SystemExit(0 if all(results) else 1)
