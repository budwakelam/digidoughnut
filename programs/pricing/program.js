/* ===== PROGRAM-SPECIFIC: Price Pilot (working title) =====
   Etsy pricing and profit tool, the first real product on the DigiDoughnut platform (2026-10-08).
   Matches the leading Etsy profit calculator (every fee, six seller countries, break-even, sales
   needed for a monthly goal) and adds what it lacks: saved products, what-if scenarios side by
   side, reading the seller's own Etsy downloads, and Margo, a helper who runs the app for them.

   Fee numbers: checked 2026-10-08 against etsy.com/legal/fees and etsy.com/legal/etsy-payments,
   plus the regulatory operating fee rates Etsy set on 2026-06-22. Every rate can be fixed by the
   buyer (My shop → Etsy's fee rates) because Etsy changes them now and then. */

/* ---------- Etsy's fees by the country the seller's bank is in ---------- */
var PP_CHECKED = "October 8, 2026";
var PP_COUNTRIES = {
  //      label                cur    sym   fx (per USD)  processing           abroad   fixed  regulatory  tax on fees
  US: { label: "United States", cur: "USD", sym: "$",  fx: 1,    proc: 3, procAbroad: 3, fixed: 0.25, reg: 0,    tax: 0,  taxName: "sales tax" },
  CA: { label: "Canada",        cur: "CAD", sym: "$",  fx: 1.38, proc: 3, procAbroad: 4, fixed: 0.25, reg: 1.15, tax: 5,  taxName: "GST/HST" },
  UK: { label: "United Kingdom",cur: "GBP", sym: "£",  fx: 0.75, proc: 4, procAbroad: 4, fixed: 0.20, reg: 0.48, tax: 20, taxName: "VAT" },
  AU: { label: "Australia",     cur: "AUD", sym: "$",  fx: 1.52, proc: 3, procAbroad: 4, fixed: 0.25, reg: 0,    tax: 10, taxName: "GST" },
  NZ: { label: "New Zealand",   cur: "NZD", sym: "$",  fx: 1.70, proc: 3, procAbroad: 4, fixed: 0.30, reg: 0,    tax: 15, taxName: "GST" },
  DE: { label: "Germany",       cur: "EUR", sym: "€",  fx: 0.86, proc: 4, procAbroad: 4, fixed: 0.30, reg: 0,    tax: 19, taxName: "VAT" },
  FR: { label: "France",        cur: "EUR", sym: "€",  fx: 0.86, proc: 4, procAbroad: 4, fixed: 0.30, reg: 1.14, tax: 20, taxName: "VAT" },
  IT: { label: "Italy",         cur: "EUR", sym: "€",  fx: 0.86, proc: 4, procAbroad: 4, fixed: 0.30, reg: 0.80, tax: 22, taxName: "VAT" },
  ES: { label: "Spain",         cur: "EUR", sym: "€",  fx: 0.86, proc: 4, procAbroad: 4, fixed: 0.30, reg: 0.88, tax: 21, taxName: "VAT" },
  EU: { label: "Other EU country", cur: "EUR", sym: "€", fx: 0.86, proc: 4, procAbroad: 4, fixed: 0.30, reg: 0, tax: 20, taxName: "VAT" }
};
var PP_TXN = 6.5, PP_LISTING_USD = 0.20, PP_ADS = 15, PP_ADS_BIG = 12, PP_ADS_CAP_USD = 100;
var PP_RATE_KEYS = ["listing", "txn", "proc", "fixed", "reg", "tax"];

function ppGuessCountry() {
  var l = String((navigator.languages && navigator.languages[0]) || navigator.language || "").toUpperCase();
  var r = (l.split("-")[1] || "");
  if (r === "GB") return "UK";
  if (PP_COUNTRIES[r]) return r;
  if (/^(AT|BE|BG|HR|CY|CZ|EE|FI|GR|HU|IE|LV|LT|LU|MT|NL|PL|PT|RO|SK|SI)$/.test(r)) return "EU";
  return "US";
}

/* The rates in use: the country's, with any the seller fixed by hand. */
function ppRates(s) {
  var c = PP_COUNTRIES[s.country] || PP_COUNTRIES.US, fix = (s.rates && s.rates.country === s.country) ? s.rates : {};
  var pick = function (k, v) { return typeof fix[k] === "number" && isFinite(fix[k]) ? fix[k] : v; };
  return {
    country: s.country, c: c,
    listing: pick("listing", Math.round(PP_LISTING_USD * c.fx * 100) / 100),
    txn: pick("txn", PP_TXN),
    proc: pick("proc", s.abroad ? c.procAbroad : c.proc),
    fixed: pick("fixed", c.fixed),
    reg: pick("reg", c.reg),
    tax: s.feeTax ? pick("tax", c.tax) : 0,
    ads: s.bigShop ? PP_ADS_BIG : PP_ADS,
    adsCap: Math.round(PP_ADS_CAP_USD * c.fx),
    fixedByHand: Object.keys(fix).filter(function (k) { return PP_RATE_KEYS.indexOf(k) >= 0; })
  };
}

function ppNum(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function ppR2(n) { return Math.round(n * 100) / 100; }
function ppUnitCost(p, s) {
  var rate = p.hourly == null ? ppNum(s.hourly) : ppNum(p.hourly);
  var labour = ppNum(p.minutes) / 60 * rate;
  return { materials: ppNum(p.materials), labour: labour, rate: rate, packaging: ppNum(p.packaging), shipping: ppNum(p.shipCost),
           total: ppNum(p.materials) + labour + ppNum(p.packaging) + ppNum(p.shipCost) };
}

/* Everything about one sale of product p. o overrides: {price, shipCharged, discount (%), ad (bool)}.
   Fees are on what the buyer pays for the item and its shipping (not sales tax). */
function ppCalc(p, s, o) {
  o = o || {};
  var R = ppRates(s);
  var price = o.price != null ? ppNum(o.price) : ppNum(p.price);
  var ship = o.shipCharged != null ? ppNum(o.shipCharged) : ppNum(p.shipCharged);
  var disc = Math.min(100, Math.max(0, ppNum(o.discount)));
  var ad = !!o.ad;
  var item = price * (1 - disc / 100), rev = item + ship;
  var f = {
    listing: R.listing,
    txn: rev * R.txn / 100,
    proc: rev * R.proc / 100 + R.fixed,
    ads: ad ? Math.min(rev * R.ads / 100, R.adsCap) : 0,
    reg: rev * R.reg / 100
  };
  f.etsy = f.listing + f.txn + f.proc + f.ads + f.reg;
  f.tax = f.etsy * R.tax / 100;
  f.total = f.etsy + f.tax;
  var cost = ppUnitCost(p, s);
  var profit = rev - f.total - cost.total;
  // Price that makes a given profit: profit is a straight line in the price (ignoring the ads cap).
  var share = (R.txn + R.proc + R.reg + (ad ? R.ads : 0)) / 100 * (1 + R.tax / 100);
  var flat = (R.listing + R.fixed) * (1 + R.tax / 100);
  var priceFor = function (want, asMargin) {
    var d = 1 - share - (asMargin ? want / 100 : 0);
    if (d <= 0.01) return null;
    var r = (flat + cost.total + (asMargin ? 0 : want)) / d;
    var it = r - ship, pr = it / (1 - disc / 100);
    return pr > 0 && isFinite(pr) ? Math.ceil(pr * 100) / 100 : 0;
  };
  return { price: price, ship: ship, discount: disc, ad: ad, item: item, revenue: rev, fees: f, cost: cost, rates: R,
           profit: profit, margin: rev > 0 ? profit / rev * 100 : 0, breakEven: priceFor(0, false), priceFor: priceFor };
}

function ppMoney(n, s) {
  var c = PP_COUNTRIES[s.country] || PP_COUNTRIES.US; n = Number(n) || 0;
  return (n < 0 ? "-" : "") + c.sym + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function ppPct(n) { var a = Math.abs(n) < 10 && Math.round(n * 100) % 10 ? (Math.round(n * 100) / 100).toFixed(2) : (Math.round(n * 10) / 10).toFixed(1); return a.replace(/\.?0+$/, "") + "%"; }

/* ---------- the program ---------- */
var PP_EX_SETTINGS = null;   // example settings = the empty settings, so untouched ones never stick
var ppSel = null, ppWhatIf = { discount: 0, ad: false };

const DD_PROGRAM = {
  id: "pricing",
  name: "Price Pilot",
  tagline: "Etsy pricing & profit, with an AI helper",
  version: "0.2.0",
  schemaVersion: 1,
  accent: "#c2410c",
  dataLabel: "shop numbers",
  exampleNotice: "You're looking at three example products so you can try things out. Change anything and it becomes yours.",

  menu: [
    { id: "newprod", icon: "➕", label: "New product", run: function () { ppNewProduct(dd.ctx()); } },
    { id: "shop", icon: "🏪", label: "My shop & Etsy's fees", note: function () { return "Country, fee rates, goal"; }, run: function () { ppOpenShop(); } },
    { id: "print", icon: "🖨️", label: "Print this page", run: function () { window.print(); } }
  ],

  emptyData: function () {
    return { settings: { country: ppGuessCountry(), abroad: false, bigShop: false, feeTax: true, hourly: 20, goal: 2000, rates: {} },
             products: [], scenarios: [], sales: [], orders: [], statement: [] };
  },

  exampleData: function () {
    var s = DD_PROGRAM.emptyData().settings;
    return {
      settings: s,
      products: [
        { id: "ex-mug", name: "Ceramic mug", price: 34, shipCharged: 8, materials: 6.5, minutes: 45, hourly: null, packaging: 1.75, shipCost: 9,
          photo: "", notes: "Speckled stoneware, 12 oz", etsy: [], listing: "" },
        { id: "ex-candle", name: "Beeswax candle", price: 24, shipCharged: 6, materials: 4, minutes: 15, hourly: null, packaging: 1, shipCost: 7,
          photo: "", notes: "Set of 2 tapers", etsy: [], listing: "" },
        { id: "ex-planner", name: "Digital planner", price: 12, shipCharged: 0, materials: 0, minutes: 0, hourly: null, packaging: 0, shipCost: 0,
          photo: "", notes: "Instant download, made once", etsy: [], listing: "" }
      ],
      scenarios: [
        { id: "ex-sc1", product: "ex-mug", name: "Holiday sale 20% off", price: 34, shipCharged: 8, discount: 20, ad: false },
        { id: "ex-sc2", product: "ex-mug", name: "Raise to $44", price: 44, shipCharged: 8, discount: 0, ad: false },
        { id: "ex-sc3", product: "ex-mug", name: "Sold through an offsite ad", price: 34, shipCharged: 8, discount: 0, ad: true }
      ],
      sales: [
        ["ex-s1", "2026-07-06", "Handmade Ceramic Mug - Speckled Stoneware Coffee Cup", 1, 34],
        ["ex-s2", "2026-07-14", "Pure Beeswax Candle Set of 2, Hand Dipped Tapers", 2, 48],
        ["ex-s3", "2026-07-22", "2027 Digital Planner for GoodNotes, Undated", 1, 12],
        ["ex-s4", "2026-08-03", "Handmade Ceramic Mug - Speckled Stoneware Coffee Cup", 2, 68],
        ["ex-s5", "2026-08-09", "2027 Digital Planner for GoodNotes, Undated", 3, 36],
        ["ex-s6", "2026-08-17", "Ceramic Spoon Rest, Speckled Glaze", 1, 18],
        ["ex-s7", "2026-08-28", "Pure Beeswax Candle Set of 2, Hand Dipped Tapers", 1, 24],
        ["ex-s8", "2026-09-02", "Handmade Ceramic Mug - Speckled Stoneware Coffee Cup", 1, 34],
        ["ex-s9", "2026-09-11", "2027 Digital Planner for GoodNotes, Undated", 4, 48],
        ["ex-s10", "2026-09-19", "Handmade Ceramic Mug - Speckled Stoneware Coffee Cup", 3, 102],
        ["ex-s11", "2026-09-24", "Ceramic Spoon Rest, Speckled Glaze", 2, 36],
        ["ex-s12", "2026-09-29", "Pure Beeswax Candle Set of 2, Hand Dipped Tapers", 2, 48]
      ].map(function (r) { return { id: r[0], date: r[1], item: r[2], listing: "", qty: r[3], revenue: r[4], country: "" }; }),
      orders: [],
      statement: [
        { id: "ex-f1", month: "2026-09", kind: "Sales", amount: 268 },
        { id: "ex-f2", month: "2026-09", kind: "Transaction fees", amount: 21.06 },
        { id: "ex-f3", month: "2026-09", kind: "Processing fees", amount: 11.62 },
        { id: "ex-f4", month: "2026-09", kind: "Listing fees", amount: 3.36 },
        { id: "ex-f5", month: "2026-09", kind: "Etsy Ads", amount: 15 },
        { id: "ex-f6", month: "2026-09", kind: "Shipping labels", amount: 38.4 },
        { id: "ex-f7", month: "2026-09", kind: "Tax on fees", amount: 2.55 }
      ]
    };
  },

  validateData: function (d) {
    var num = function (v) { return typeof v === "number" && isFinite(v); };
    var numOrNull = function (v) { return v === null || num(v); };
    var str = function (v) { return typeof v === "string"; };
    var listOf = function (a, ok) { return Array.isArray(a) && a.every(function (i) { return i && typeof i === "object" && str(i.id) && ok(i); }); };
    if (!d || typeof d !== "object") return false;
    var s = d.settings;
    if (!s || !PP_COUNTRIES[s.country] || typeof s.abroad !== "boolean" || typeof s.bigShop !== "boolean" || typeof s.feeTax !== "boolean" ||
        !num(s.hourly) || !num(s.goal) || !s.rates || typeof s.rates !== "object") return false;
    return listOf(d.products, function (p) {
      return str(p.name) && num(p.price) && num(p.shipCharged) && num(p.materials) && num(p.minutes) && numOrNull(p.hourly) &&
             num(p.packaging) && num(p.shipCost) && str(p.photo) && str(p.notes) && Array.isArray(p.etsy) && p.etsy.every(str) && str(p.listing);
    }) && listOf(d.scenarios, function (c) {
      return str(c.product) && str(c.name) && num(c.price) && num(c.shipCharged) && num(c.discount) && typeof c.ad === "boolean";
    }) && listOf(d.sales, function (x) {
      return str(x.date) && str(x.item) && str(x.listing) && num(x.qty) && num(x.revenue) && str(x.country);
    }) && listOf(d.orders, function (o) {
      return str(o.date) && num(o.items) && num(o.value) && num(o.shipping) && num(o.discount) && num(o.procFee) && num(o.net) && str(o.country);
    }) && listOf(d.statement, function (f) { return str(f.month) && str(f.kind) && num(f.amount); });
  },

  migrate: function (d, fromVersion) {
    var base = DD_PROGRAM.emptyData();
    if (!d || typeof d !== "object") return base;
    // Version 1 is the first shape; anything older (0) is filled in from the empty shape.
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = d[k] != null ? d[k] : base[k]; });
    out.settings = Object.assign({}, base.settings, d.settings || {});
    if (!out.settings.rates || typeof out.settings.rates !== "object") out.settings.rates = {};
    return out;
  },

  mount: function (ctx) { ppMount(ctx); },
  render: function (ctx) { ppRender(ctx); },

  helper: {
    name: "Margo", face: "🧮", role: "your pricing helper",
    // One line: the suggestion chips under it teach by example (audit 2026-10-08, #9).
    greeting: "Hi, I'm Margo. Tell me what to price, add or compare, and I'll do it. You can undo anything I change.",
    // A corner button on every screen; on phones it opens as a sheet from the bottom (#8).
    place: "bubble"
  },

  files: {
    accept: ".csv,text/csv",
    label: "an Etsy download",
    howTo: "<p><b>Which file?</b> Any of these three from Etsy works. Add as many as you like; adding the same file twice is fine.</p>" +
      "<ol><li><b>What sold</b> (best): Etsy <i>Shop Manager</i> → <i>Settings</i> → <i>Options</i> → <i>Download Data</i> → under Orders, pick the months and choose <b>Order Items</b> → Download CSV.</li>" +
      "<li><b>Orders</b>: same place, choose <b>Orders</b>. Adds shipping, coupons and the real processing fees.</li>" +
      "<li><b>What Etsy charged</b>: <i>Shop Manager</i> → <i>Finances</i> → <i>Monthly statements</i> → pick a month → <b>Download CSV</b>.</li></ol>" +
      "<p class=\"dd-note\">Names and addresses in the file are skipped. Only dates, items, amounts and the buyer's country are kept.</p>",
    take: function (file, text, ctx) { return ppTakeFile(file, text, ctx); }
  },

  knowledge: "Price Pilot helps an Etsy seller price products so they actually make money. " +
    "The page has: (1) 'Price a product': pick a product, type its price, the shipping the buyer pays, and what it costs to make (materials, minutes of work at an hourly rate, packaging, the shipping label the seller pays); it shows every Etsy fee, profit per sale, margin, break-even price, a price that hits a target profit, and how many sales a month reach their income goal. " +
    "(2) 'My products': the saved products. (3) 'What-ifs': saved pricing scenarios per product (a sale discount, a new price, a sale that came through an offsite ad), shown side by side. " +
    "(4) 'My Etsy sales': the seller adds Etsy's own CSV downloads (Order Items, Orders, or a monthly statement) with the 📎 button in this chat, Menu → Add an Etsy download, or by dropping the file on the page. It shows what sold, real fees from statements, and estimated profit per product. Sales are matched to products by name; unmatched items can be linked to a product. " +
    "(5) 'My shop & Etsy's fees': the country their Etsy payment account is in (sets currency and fees), whether most buyers are in another country, whether the shop sold over US$10,000 in the last year (offsite ads 12% instead of 15%), whether Etsy charges them GST/VAT on its fees, default hourly rate, monthly income goal, and each fee rate (all fixable by hand). " +
    "Etsy fees used: listing fee US$0.20 per sale (it renews when it sells), transaction fee 6.5% of item price plus shipping, payment processing (percent plus a fixed amount, by country), offsite ads 15% or 12% capped at US$100 per order when a sale comes from an Etsy ad on another site, a regulatory operating fee in some countries, and GST/VAT on the fees. Rates were checked on " + PP_CHECKED + "; Etsy can change them. " +
    "To get an Etsy download: Shop Manager → Settings → Options → Download Data (Order Items or Orders), or Shop Manager → Finances → Monthly statements → Download CSV. " +
    "Never show the person an id (like 'ex-mug' or 'p1a2b…'): call things by their names. " +
    "RULES FOR NUMBERS: never work out prices, fees or profit yourself. Use price_for_goal to set a price for a target, explain_price for a breakdown or a what-if, compare_scenarios to compare, sales_report for sales questions, and quote their numbers exactly. " +
    "If the person names a product loosely ('my mug'), use the matching product. If they want a new product, add it with whatever numbers they gave; missing costs can stay 0 and you can ask about them after. " +
    "Sending the program to a phone, live sync, backups and the free access code are in the menu under Settings.",

  summarizeForAI: function (ctx) { return ppSummary(ctx.data); },

  suggestions: ["Price my mug so I make $20 each", "Which product makes me the most?", "What if I run a 25% off sale?"],

  tools: null   // filled in below
};

/* ---------- finding things by id or by words (never guess between two) ---------- */
function ppPick(list, idOrWords, label, nameOf) {
  nameOf = nameOf || function (x) { return x.name; };
  var all = function () { return list.map(function (x) { return "'" + nameOf(x) + "' (id " + x.id + ")"; }).join(", ") || "none yet"; };
  var w = String(idOrWords == null ? "" : idOrWords).trim();
  if (!w) return { problem: "Say which " + label + ". Choices: " + all() };
  var byId = list.filter(function (x) { return x.id === w; });
  if (byId.length) return { item: byId[0] };
  var lw = w.toLowerCase().replace(/^(my|the|a|an)\s+/, "");
  var exact = list.filter(function (x) { return nameOf(x).toLowerCase() === lw; });
  if (exact.length === 1) return { item: exact[0] };
  var near = exact.length ? exact : list.filter(function (x) {
    var n = nameOf(x).toLowerCase(); return n.indexOf(lw) >= 0 || lw.indexOf(n) >= 0 ||
      lw.split(/\s+/).filter(function (t) { return t.length > 2; }).every(function (t) { return n.indexOf(t.replace(/s$/, "")) >= 0; });
  });
  if (near.length === 1) return { item: near[0] };
  if (!near.length) return { problem: "No " + label + " matches '" + w + "'. Choices: " + all() };
  return { problem: "More than one " + label + " matches '" + w + "': " + near.map(function (x) { return "'" + nameOf(x) + "' (id " + x.id + ")"; }).join(", ") + ". Use the id, or ask the person which one." };
}

/* ---------- product fields the helper and the form share ---------- */
var PP_FIELDS = {
  price: "price", shipping_charged: "shipCharged", materials: "materials", minutes: "minutes", hourly_rate: "hourly",
  packaging: "packaging", shipping_cost: "shipCost"
};
function ppApplyFields(p, args) {
  var changed = [];
  Object.keys(PP_FIELDS).forEach(function (k) {
    if (args[k] == null || args[k] === "") return;
    var v = Number(args[k]); if (!isFinite(v) || v < 0) return;
    p[PP_FIELDS[k]] = Math.round(v * 100) / 100; changed.push(k.replace(/_/g, " "));
  });
  if (args.name != null && String(args.name).trim()) { p.name = String(args.name).trim().slice(0, 80); changed.push("name"); }
  if (args.notes != null) { p.notes = String(args.notes).slice(0, 300); changed.push("notes"); }
  if (args.photo_link != null) { var u = ppPhoto(args.photo_link); if (u !== null) { p.photo = u; changed.push("photo"); } }
  return changed;
}
function ppPhoto(v) {
  var s = String(v || "").trim(); if (!s) return "";
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s.slice(0, 500) : null;
}
function ppNewId(ctx, prefix) { return ctx.ui.uid(prefix); }

/* ---------- the helper's tools ---------- */
DD_PROGRAM.tools = [
  { name: "add_product", description: "Add a new product. Give whatever numbers the person said; the rest start at 0. Money is in the shop's currency; minutes is time to make one.",
    params: { name: { type: "string", description: "Short product name" },
              price: { type: "number", description: "Listing price", optional: true },
              shipping_charged: { type: "number", description: "Shipping the buyer pays (0 for free shipping)", optional: true },
              materials: { type: "number", description: "Materials cost for one", optional: true },
              minutes: { type: "number", description: "Minutes of work to make one", optional: true },
              hourly_rate: { type: "number", description: "Hourly rate for this product, if different from the shop's", optional: true },
              packaging: { type: "number", description: "Packaging cost for one", optional: true },
              shipping_cost: { type: "number", description: "What the seller pays for the shipping label", optional: true },
              photo_link: { type: "string", description: "https link to a photo (from 'Copy image address' on Etsy)", optional: true },
              notes: { type: "string", description: "Short note", optional: true } },
    run: function (args, ctx) {
      var name = String(args.name || "").trim();
      if (!name) return { ok: false, message: "A product needs a name." };
      var p = ppBlank(ctx, name); ppApplyFields(p, args);
      if (args.photo_link && ppPhoto(args.photo_link) === null) return { ok: false, message: "That photo link doesn't look right. It should start with https://. Nothing was added." };
      ctx.update(function (d) { d.products.push(p); });
      ppSel = p.id;
      var c = ppCalc(p, dd.getData().settings);
      return { ok: true, message: "Added '" + p.name + "'. At " + ppMoney(p.price, dd.getData().settings) + " it makes " + ppMoney(c.profit, dd.getData().settings) + " profit per sale." };
    } },
  { name: "update_product", description: "Change a product's name, price, costs, photo link or notes. Only the fields given change.",
    params: { product: { type: "string", description: "The product's id (best) or its name" },
              name: { type: "string", description: "New name", optional: true },
              price: { type: "number", description: "Listing price", optional: true },
              shipping_charged: { type: "number", description: "Shipping the buyer pays", optional: true },
              materials: { type: "number", description: "Materials cost for one", optional: true },
              minutes: { type: "number", description: "Minutes of work for one", optional: true },
              hourly_rate: { type: "number", description: "Hourly rate for this product", optional: true },
              packaging: { type: "number", description: "Packaging cost", optional: true },
              shipping_cost: { type: "number", description: "Shipping label cost the seller pays", optional: true },
              photo_link: { type: "string", description: "https link to a photo, or empty to remove it", optional: true },
              notes: { type: "string", description: "Notes", optional: true } },
    run: function (args, ctx) {
      var r = ppPick(ctx.data.products, args.product, "product"); if (!r.item) return { ok: false, message: r.problem };
      if (args.photo_link && ppPhoto(args.photo_link) === null) return { ok: false, message: "That photo link doesn't look right. It should start with https://." };
      var changed = [];
      ctx.update(function (d) { changed = ppApplyFields(d.products.filter(function (p) { return p.id === r.item.id; })[0], args); });
      ppSel = r.item.id;
      var p = ppById(r.item.id), s = dd.getData().settings, c = ppCalc(p, s);
      return { ok: true, message: changed.length ? "Updated " + changed.join(", ") + " on '" + p.name + "'. Profit per sale is now " + ppMoney(c.profit, s) + " (" + ppPct(c.margin) + ")." : "Nothing to change on '" + p.name + "'." };
    } },
  { name: "remove_product", description: "Delete a product and its what-ifs. The person is asked to confirm first.",
    params: { product: { type: "string", description: "The product's id or name" } },
    confirm: function (args, ctx) { var r = ppPick(ctx.data.products, args.product, "product"); return r.item ? "Delete '" + r.item.name + "' and its what-ifs?" : null; },
    yesLabel: "Yes, delete it",
    run: function (args, ctx) {
      var r = ppPick(ctx.data.products, args.product, "product"); if (!r.item) return { ok: false, message: r.problem };
      ctx.update(function (d) { d.products = d.products.filter(function (p) { return p.id !== r.item.id; }); d.scenarios = d.scenarios.filter(function (c) { return c.product !== r.item.id; }); });
      return { ok: true, message: "Deleted '" + r.item.name + "'." };
    } },
  { name: "show_product", description: "Open a product in the calculator at the top of the page so the person can see it.",
    params: { product: { type: "string", description: "The product's id or name" } },
    run: function (args, ctx) {
      var r = ppPick(ctx.data.products, args.product, "product"); if (!r.item) return { ok: false, message: r.problem };
      ppSel = r.item.id; ppWhatIf = { discount: 0, ad: false }; ppRender(ctx); ppScrollTo("ppCalcCard");
      return { ok: true, message: "Showing '" + r.item.name + "' in the calculator." };
    } },
  { name: "price_for_goal", description: "Work out the price that makes a target profit per sale (an amount) or a target margin (a percent), and set it on the product unless apply is false. Use this for any 'price it so I make…' request.",
    params: { product: { type: "string", description: "The product's id or name" },
              profit: { type: "number", description: "Target profit per sale, in money", optional: true },
              margin: { type: "number", description: "Target profit margin in percent, e.g. 30", optional: true },
              apply: { type: "boolean", description: "false = just tell the price, don't change the product", optional: true } },
    run: function (args, ctx) {
      var r = ppPick(ctx.data.products, args.product, "product"); if (!r.item) return { ok: false, message: r.problem };
      var s = ctx.data.settings, c = ppCalc(r.item, s);
      var asMargin = args.profit == null && args.margin != null;
      var want = asMargin ? ppNum(args.margin) : ppNum(args.profit);
      if (args.profit == null && args.margin == null) return { ok: false, message: "Say the profit per sale or the margin they want." };
      var price = c.priceFor(want, asMargin);
      if (price == null) return { ok: false, message: "A " + ppPct(want) + " margin isn't possible after Etsy's fees. Try a lower margin." };
      var apply = args.apply !== false;
      if (apply) ctx.update(function (d) { d.products.filter(function (p) { return p.id === r.item.id; })[0].price = price; });
      ppSel = r.item.id;
      var after = ppCalc(Object.assign({}, r.item, { price: price }), s);
      return { ok: true, message: (apply ? "Set '" + r.item.name + "' to " : "'" + r.item.name + "' would need ") + ppMoney(price, s) +
        " (it was " + ppMoney(r.item.price, s) + "). " + ppBreakdownText(after, s) };
    } },
  { name: "explain_price", description: "Get the full breakdown for a product: every Etsy fee, costs, profit, margin, break-even. Optionally a what-if price, shipping, sale discount or offsite-ad sale, without changing anything.",
    params: { product: { type: "string", description: "The product's id or name" },
              price: { type: "number", description: "What-if price", optional: true },
              shipping_charged: { type: "number", description: "What-if shipping the buyer pays", optional: true },
              discount: { type: "number", description: "What-if sale discount in percent", optional: true },
              offsite_ad: { type: "boolean", description: "true = the sale came through an Etsy offsite ad", optional: true } },
    run: function (args, ctx) {
      var r = ppPick(ctx.data.products, args.product, "product"); if (!r.item) return { ok: false, message: r.problem };
      var s = ctx.data.settings;
      var c = ppCalc(r.item, s, { price: args.price, shipCharged: args.shipping_charged, discount: args.discount, ad: !!args.offsite_ad });
      return { ok: true, message: "'" + r.item.name + "': " + ppBreakdownText(c, s) };
    } },
  { name: "save_scenario", description: "Save a what-if for a product (shown side by side in What-ifs). Anything not given uses the product's current numbers.",
    params: { product: { type: "string", description: "The product's id or name" },
              name: { type: "string", description: "Short name, e.g. 'Holiday sale'" },
              price: { type: "number", description: "Price", optional: true },
              shipping_charged: { type: "number", description: "Shipping the buyer pays", optional: true },
              discount: { type: "number", description: "Sale discount in percent", optional: true },
              offsite_ad: { type: "boolean", description: "Sale came through an offsite ad", optional: true } },
    run: function (args, ctx) {
      var r = ppPick(ctx.data.products, args.product, "product"); if (!r.item) return { ok: false, message: r.problem };
      var sc = { id: ppNewId(ctx, "sc"), product: r.item.id, name: String(args.name || "What-if").trim().slice(0, 60),
                 price: args.price != null ? ppR2(ppNum(args.price)) : r.item.price,
                 shipCharged: args.shipping_charged != null ? ppR2(ppNum(args.shipping_charged)) : r.item.shipCharged,
                 discount: Math.min(100, Math.max(0, ppNum(args.discount))), ad: !!args.offsite_ad };
      ctx.update(function (d) { d.scenarios.push(sc); });
      ppSel = r.item.id;
      var s = dd.getData().settings, c = ppCalc(r.item, s, sc);
      return { ok: true, message: "Saved what-if '" + sc.name + "' for '" + r.item.name + "': profit " + ppMoney(c.profit, s) + " per sale (" + ppPct(c.margin) + ")." };
    } },
  { name: "use_scenario", description: "Make a saved what-if the product's real price and shipping.",
    params: { scenario: { type: "string", description: "The what-if's id or name" } },
    run: function (args, ctx) {
      var r = ppPick(ctx.data.scenarios, args.scenario, "what-if"); if (!r.item) return { ok: false, message: r.problem };
      var sc = r.item, p = ppById(sc.product); if (!p) return { ok: false, message: "That what-if's product is gone." };
      ctx.update(function (d) { var q = d.products.filter(function (x) { return x.id === p.id; })[0]; q.price = sc.price; q.shipCharged = sc.shipCharged; });
      ppSel = p.id;
      return { ok: true, message: "'" + p.name + "' now uses the price and shipping from '" + sc.name + "'" + (sc.discount ? " (the " + ppPct(sc.discount) + " discount is something you set on Etsy itself)" : "") + "." };
    } },
  { name: "remove_scenario", description: "Delete one saved what-if.",
    params: { scenario: { type: "string", description: "The what-if's id or name" } },
    run: function (args, ctx) {
      var r = ppPick(ctx.data.scenarios, args.scenario, "what-if"); if (!r.item) return { ok: false, message: r.problem };
      ctx.update(function (d) { d.scenarios = d.scenarios.filter(function (c) { return c.id !== r.item.id; }); });
      return { ok: true, message: "Deleted the what-if '" + r.item.name + "'." };
    } },
  { name: "compare_scenarios", description: "Compare a product's current pricing with all its saved what-ifs: fees, profit and margin for each.",
    params: { product: { type: "string", description: "The product's id or name" } },
    run: function (args, ctx) {
      var r = ppPick(ctx.data.products, args.product, "product"); if (!r.item) return { ok: false, message: r.problem };
      var s = ctx.data.settings, list = ctx.data.scenarios.filter(function (c) { return c.product === r.item.id; });
      ppSel = r.item.id; ppRender(ctx);
      var line = function (name, c) { return name + ": price " + ppMoney(c.price, s) + (c.discount ? " less " + ppPct(c.discount) : "") + (c.ad ? ", offsite ad" : "") + ", Etsy fees " + ppMoney(c.fees.total, s) + ", profit " + ppMoney(c.profit, s) + " (" + ppPct(c.margin) + ")"; };
      return { ok: true, message: [line("Now", ppCalc(r.item, s))].concat(list.map(function (c) { return line("'" + c.name + "'", ppCalc(r.item, s, c)); })).join(". ") + (list.length ? "" : ". No what-ifs saved for it yet.") };
    } },
  { name: "change_settings", description: "Change shop settings: country of the Etsy payment account, buyers mostly abroad, big shop (over US$10,000 sales last year), GST/VAT charged on Etsy's fees, default hourly rate, monthly income goal, or fix one of Etsy's fee rates by hand.",
    params: { country: { type: "string", description: "One of: US, CA, UK, AU, NZ, DE, FR, IT, ES, EU (other EU)", optional: true },
              buyers_abroad: { type: "boolean", description: "Most buyers are in another country", optional: true },
              big_shop: { type: "boolean", description: "Shop sold over US$10,000 in the last 12 months", optional: true },
              tax_on_fees: { type: "boolean", description: "Etsy adds GST/VAT to its fees and the seller can't claim it back", optional: true },
              hourly_rate: { type: "number", description: "Default hourly rate for time spent making", optional: true },
              monthly_goal: { type: "number", description: "Monthly profit goal", optional: true },
              fix_rate: { type: "string", description: "Fee rate to fix by hand: listing, txn, proc, fixed, reg, tax", optional: true },
              rate_value: { type: "number", description: "The new value for fix_rate (percent, or money for listing/fixed)", optional: true } },
    run: function (args, ctx) {
      var said = [];
      var cc = args.country != null ? String(args.country).toUpperCase().replace("GB", "UK") : null;
      if (cc && !PP_COUNTRIES[cc]) return { ok: false, message: "Country must be one of " + Object.keys(PP_COUNTRIES).join(", ") + "." };
      if (args.fix_rate != null && PP_RATE_KEYS.indexOf(String(args.fix_rate)) < 0) return { ok: false, message: "fix_rate must be one of " + PP_RATE_KEYS.join(", ") + "." };
      ctx.update(function (d) {
        var s = d.settings;
        if (cc && cc !== s.country) { s.country = cc; s.rates = {}; said.push("country " + PP_COUNTRIES[cc].label); }
        if (typeof args.buyers_abroad === "boolean") { s.abroad = args.buyers_abroad; said.push(s.abroad ? "most buyers abroad" : "most buyers at home"); }
        if (typeof args.big_shop === "boolean") { s.bigShop = args.big_shop; said.push("offsite ads " + (s.bigShop ? PP_ADS_BIG : PP_ADS) + "%"); }
        if (typeof args.tax_on_fees === "boolean") { s.feeTax = args.tax_on_fees; said.push((s.feeTax ? "" : "no ") + "tax on Etsy's fees"); }
        if (args.hourly_rate != null && ppNum(args.hourly_rate) >= 0) { s.hourly = ppR2(ppNum(args.hourly_rate)); said.push("hourly rate " + ppMoney(s.hourly, s)); }
        if (args.monthly_goal != null && ppNum(args.monthly_goal) >= 0) { s.goal = ppR2(ppNum(args.monthly_goal)); said.push("monthly goal " + ppMoney(s.goal, s)); }
        if (args.fix_rate != null && args.rate_value != null && ppNum(args.rate_value) >= 0) {
          s.rates = Object.assign({}, s.rates.country === s.country ? s.rates : {}, { country: s.country });
          s.rates[args.fix_rate] = ppNum(args.rate_value); said.push(args.fix_rate + " rate fixed at " + ppNum(args.rate_value));
        }
      });
      return { ok: true, message: said.length ? "Changed: " + said.join(", ") + "." : "Nothing to change." };
    } },
  { name: "sales_report", description: "Facts from the seller's added Etsy downloads: what sold, per product units, sales and estimated profit, unmatched items, monthly totals and Etsy's actual charges from statements. Optionally one month.",
    params: { month: { type: "string", description: "A month as YYYY-MM, or empty for everything", optional: true } },
    run: function (args, ctx) {
      if (!ctx.data.sales.length && !ctx.data.statement.length && !ctx.data.orders.length) return { ok: false, message: "No Etsy downloads added yet. The person can add one with the 📎 button or Menu → Add an Etsy download." };
      return { ok: true, message: ppReportText(ctx.data, String(args.month || "").slice(0, 7)) };
    } },
  { name: "link_etsy_item", description: "Link an Etsy item name from their sales to one of their products, so its sales count for that product.",
    params: { item: { type: "string", description: "The Etsy item name (or words from it), as in the sales" },
              product: { type: "string", description: "The product's id or name" } },
    run: function (args, ctx) {
      var names = ppItemNames(ctx.data).map(function (n) { return { id: n, name: n }; });
      var it = ppPick(names, args.item, "Etsy item"); if (!it.item) return { ok: false, message: it.problem };
      var r = ppPick(ctx.data.products, args.product, "product"); if (!r.item) return { ok: false, message: r.problem };
      ppLink(ctx, it.item.name, r.item.id);
      return { ok: true, message: "Linked '" + it.item.name + "' to '" + r.item.name + "'." };
    } },
  { name: "clear_sales", description: "Remove every added Etsy sale, order and statement. The person is asked to confirm first.",
    params: {},
    confirm: function (args, ctx) { var d = ctx.data; var n = d.sales.length + d.orders.length + d.statement.length; return n ? "Remove all the Etsy sales and statements you added?" : null; },
    yesLabel: "Yes, remove them",
    run: function (args, ctx) {
      ctx.update(function (d) { d.sales = []; d.orders = []; d.statement = []; });
      return { ok: true, message: "Removed the Etsy sales and statements. Your products are untouched." };
    } }
];

function ppById(id) { return dd.getData().products.filter(function (p) { return p.id === id; })[0] || null; }
function ppBlank(ctx, name) {
  return { id: ppNewId(ctx, "p"), name: name || "New product", price: 0, shipCharged: 0, materials: 0, minutes: 0, hourly: null,
           packaging: 0, shipCost: 0, photo: "", notes: "", etsy: [], listing: "" };
}
function ppBreakdownText(c, s) {
  var f = c.fees, R = c.rates, m = function (n) { return ppMoney(n, s); };
  var parts = ["Buyer pays " + m(c.revenue) + (c.discount ? " (" + ppPct(c.discount) + " off " + m(c.price) + ")" : "") + (c.ship ? " incl. " + m(c.ship) + " shipping" : ""),
    "listing fee " + m(f.listing), "transaction fee " + m(f.txn) + " (" + ppPct(R.txn) + ")", "payment processing " + m(f.proc) + " (" + ppPct(R.proc) + " + " + m(R.fixed) + ")"];
  if (f.ads) parts.push("offsite ads " + m(f.ads) + " (" + ppPct(R.ads) + ")");
  if (f.reg) parts.push("regulatory fee " + m(f.reg) + " (" + ppPct(R.reg) + ")");
  if (f.tax) parts.push(R.c.taxName + " on fees " + m(f.tax));
  return parts.join(", ") + ". Etsy takes " + m(f.total) + " in all. Costs " + m(c.cost.total) + " (materials " + m(c.cost.materials) + ", labour " + m(c.cost.labour) +
    ", packaging " + m(c.cost.packaging) + ", shipping label " + m(c.cost.shipping) + "). Profit " + m(c.profit) + " per sale, margin " + ppPct(c.margin) +
    ". Break-even price " + (c.breakEven == null ? "n/a" : m(c.breakEven)) + ".";
}

/* ---------- sales: matching and reports ---------- */
function ppItemNames(d) {
  var seen = {}; d.sales.forEach(function (x) { seen[x.item] = 1; }); return Object.keys(seen);
}
/* Which product an Etsy sale belongs to: a link made by hand, then the listing number, then the
   product's name inside the Etsy title (only when exactly one product fits). */
function ppMatcher(d) {
  var byTitle = {}, byListing = {};
  d.products.forEach(function (p) {
    p.etsy.forEach(function (t) { byTitle[t.toLowerCase()] = p; });
    if (p.listing) byListing[p.listing] = p;
  });
  return function (x) {
    var t = x.item.toLowerCase();
    if (byTitle[t]) return byTitle[t];
    if (x.listing && byListing[x.listing]) return byListing[x.listing];
    var hits = d.products.filter(function (p) { return p.name.trim() && t.indexOf(p.name.toLowerCase().trim()) >= 0; });
    return hits.length === 1 ? hits[0] : null;
  };
}
function ppLink(ctx, itemName, productId) {
  var listing = (dd.getData().sales.filter(function (x) { return x.item === itemName && x.listing; })[0] || {}).listing || "";
  ctx.update(function (d) {
    d.products.forEach(function (p) { p.etsy = p.etsy.filter(function (t) { return t !== itemName; }); });
    var p = d.products.filter(function (q) { return q.id === productId; })[0];
    if (p) { p.etsy.push(itemName); if (listing && !p.listing) p.listing = listing; }
  });
}
function ppReport(d, month) {
  var s = d.settings, match = ppMatcher(d);
  var sales = d.sales.filter(function (x) { return !month || x.date.slice(0, 7) === month; });
  var per = {}, unmatched = {}, months = {}, first = "", last = "";
  sales.forEach(function (x) {
    var p = match(x), mo = x.date.slice(0, 7);
    if (!first || x.date < first) first = x.date; if (!last || x.date > last) last = x.date;
    months[mo] = months[mo] || { month: mo, qty: 0, revenue: 0 }; months[mo].qty += x.qty; months[mo].revenue += x.revenue;
    if (!p) { var u = unmatched[x.item] = unmatched[x.item] || { item: x.item, qty: 0, revenue: 0 }; u.qty += x.qty; u.revenue += x.revenue; return; }
    var r = per[p.id] = per[p.id] || { product: p, qty: 0, revenue: 0, profit: 0 };
    r.qty += x.qty; r.revenue += x.revenue;
  });
  Object.keys(per).forEach(function (id) {
    var r = per[id], unit = r.qty ? r.revenue / r.qty : 0;
    // Estimated: their costs and Etsy's fees at the average price they actually sold for.
    var c = ppCalc(r.product, s, { price: unit, shipCharged: r.product.shipCharged });
    r.unitPrice = unit; r.unitProfit = c.profit; r.profit = c.profit * r.qty;
  });
  var fees = {};
  d.statement.filter(function (f) { return !month || f.month === month; }).forEach(function (f) { fees[f.kind] = (fees[f.kind] || 0) + f.amount; });
  var orders = d.orders.filter(function (o) { return !month || o.date.slice(0, 7) === month; });
  var tot = function (a, k) { return a.reduce(function (n, x) { return n + x[k]; }, 0); };
  return {
    first: first, last: last, count: sales.length, qty: tot(sales, "qty"), revenue: tot(sales, "revenue"),
    products: Object.keys(per).map(function (k) { return per[k]; }).sort(function (a, b) { return b.revenue - a.revenue; }),
    unmatched: Object.keys(unmatched).map(function (k) { return unmatched[k]; }).sort(function (a, b) { return b.revenue - a.revenue; }),
    months: Object.keys(months).sort().map(function (k) { return months[k]; }),
    fees: fees, feeMonths: Object.keys(d.statement.reduce(function (o, f) { o[f.month] = 1; return o; }, {})).sort(),
    orders: { count: orders.length, value: tot(orders, "value"), shipping: tot(orders, "shipping"), discount: tot(orders, "discount"), procFee: tot(orders, "procFee"), net: tot(orders, "net") }
  };
}
var PP_CHARGES = ["Transaction fees", "Processing fees", "Listing fees", "Offsite ads", "Etsy Ads", "Regulatory fees", "Tax on fees", "Other fees"];
/* Shipping labels are postage bought through Etsy, not an Etsy fee: shown on their own so the
   "% of sales" line only counts what Etsy keeps (audit 2026-10-08, #13). */
var PP_POSTAGE = "Shipping labels";
function ppReportText(d, month) {
  var s = d.settings, r = ppReport(d, month), m = function (n) { return ppMoney(n, s); }, out = [];
  if (r.count) {
    out.push((month ? "In " + month : "From " + r.first + " to " + r.last) + ": " + r.qty + " items sold, " + m(r.revenue) + " in item sales (before coupons).");
    if (r.products.length) out.push("By product (profit is an estimate from their costs and Etsy's fees): " + r.products.map(function (x) {
      return x.product.name + " " + x.qty + " sold, " + m(x.revenue) + " sales, about " + m(x.profit) + " profit (" + m(x.unitProfit) + " each)";
    }).join("; ") + ".");
    if (r.unmatched.length) out.push("Not linked to a product yet: " + r.unmatched.slice(0, 12).map(function (x) { return "'" + x.item + "' " + x.qty + " sold, " + m(x.revenue); }).join("; ") + ".");
    if (!month && r.months.length > 1) out.push("By month: " + r.months.map(function (x) { return x.month + " " + x.qty + " items, " + m(x.revenue); }).join("; ") + ".");
  } else if (month) out.push("No item sales added for " + month + ".");
  if (r.orders.count) out.push("Orders file: " + r.orders.count + " orders, " + m(r.orders.value) + " order value, " + m(r.orders.shipping) + " shipping charged, " + m(r.orders.discount) + " in discounts, " + m(r.orders.procFee) + " processing fees, " + m(r.orders.net) + " net.");
  var charged = PP_CHARGES.filter(function (k) { return r.fees[k]; });
  if (charged.length) {
    var total = charged.reduce(function (n, k) { return n + r.fees[k]; }, 0);
    out.push("Etsy statement" + (month ? "" : " (" + r.feeMonths.join(", ") + ")") + ": " + charged.map(function (k) { return k.toLowerCase() + " " + m(r.fees[k]); }).join(", ") +
      ". Etsy's fees total " + m(total) + (r.fees.Sales ? " on " + m(r.fees.Sales) + " of sales (" + ppPct(total / r.fees.Sales * 100) + ")" : "") + ".");
  }
  if (r.fees[PP_POSTAGE]) out.push("Shipping labels bought through Etsy (postage, not an Etsy fee): " + m(r.fees[PP_POSTAGE]) + ".");
  return out.join(" ") || "Nothing added for that month.";
}

/* ---------- reading Etsy's downloads ---------- */
function ppDate(v) {
  var s = String(v || "").trim(); if (!s) return "";
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);   // Etsy: MM/DD/YY
  if (m) { var y = +m[3]; if (y < 100) y += 2000; return y + "-" + ("0" + m[1]).slice(-2) + "-" + ("0" + m[2]).slice(-2); }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  var t = new Date(s); if (!isNaN(t)) return t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2);
  return "";
}
function ppKind(title, type) {
  var t = (String(title) + " " + String(type)).toLowerCase();
  if (/refund/.test(t)) return "Refunds";
  if (/^sale\b/.test(String(type).toLowerCase()) || /payment for order/.test(t)) return "Sales";
  if (/deposit/.test(t)) return "Deposits";
  if (/offsite ads/.test(t)) return "Offsite ads";
  if (/etsy ads|promoted listing|marketing/.test(t)) return "Etsy Ads";
  if (/transaction fee/.test(t)) return "Transaction fees";
  if (/processing fee/.test(t)) return "Processing fees";
  if (/listing fee|renew/.test(t)) return "Listing fees";
  if (/regulatory/.test(t)) return "Regulatory fees";
  if (/shipping label|postage|usps|canada post|royal mail|label/.test(t) || /shipping/.test(String(type).toLowerCase())) return "Shipping labels";
  if (/vat|gst|hst|\btax\b/.test(t)) return "Tax on fees";
  return "Other fees";
}
function ppTakeFile(file, text, ctx) {
  var rows = dd.files.table(text);
  if (!rows.length) return { ok: false, message: "That file looks empty. Download it again from Etsy and add the new copy." };
  var h = Object.keys(rows[0]), has = function (k) { return h.indexOf(k) >= 0; };
  var cur = (rows[0].Currency || "").toUpperCase(), want = (PP_COUNTRIES[ctx.data.settings.country] || {}).cur;
  var curNote = cur && want && cur !== want ? " Note: the file is in " + cur + " but your shop is set to " + want + " (My shop & Etsy's fees)." : "";

  if (has("Item Name") && (has("Transaction ID") || has("Quantity"))) {   // Order Items
    var add = rows.map(function (r, n) {
      var qty = Math.max(0, Math.round(dd.files.number(r.Quantity) || 1));
      var total = has("Item Total") ? dd.files.number(r["Item Total"]) : dd.files.number(r.Price) * qty;
      return { id: "t" + (r["Transaction ID"] || (r["Order ID"] || "") + "-" + n), date: ppDate(r["Sale Date"] || r["Date Paid"]),
               item: String(r["Item Name"] || "").slice(0, 140), listing: String(r["Listing ID"] || "").slice(0, 20),
               qty: qty, revenue: ppR2(total), country: String(r["Ship Country"] || "").slice(0, 40) };
    }).filter(function (x) { return x.date && x.item; });
    if (!add.length) return { ok: false, message: "No sales were found in that file." };
    var merged = ppMerge(ctx, "sales", add);
    var months = ppMonths(add);
    return { ok: true, message: "Added " + merged.added + " sales" + (merged.updated ? " (" + merged.updated + " were already here and got refreshed)" : "") + " from " + months + "." + ppMatchNote() + curNote };
  }
  if (has("Order ID") && has("Order Value")) {                             // Orders
    var ords = rows.map(function (r) {
      var proc = dd.files.number(r["Adjusted Card Processing Fees"]) || dd.files.number(r["Card Processing Fees"]);
      return { id: "o" + r["Order ID"], date: ppDate(r["Sale Date"]), items: dd.files.number(r["Number of Items"]),
               value: ppR2(dd.files.number(r["Order Value"])), shipping: ppR2(dd.files.number(r.Shipping)),
               discount: ppR2(Math.abs(dd.files.number(r["Discount Amount"])) + Math.abs(dd.files.number(r["Shipping Discount"]))),
               procFee: ppR2(Math.abs(proc)), net: ppR2(dd.files.number(r["Adjusted Net Order Amount"]) || dd.files.number(r["Order Net"])),
               country: String(r["Ship Country"] || "").slice(0, 40) };
    }).filter(function (o) { return o.date && o.id !== "o"; });
    if (!ords.length) return { ok: false, message: "No orders were found in that file." };
    var mo = ppMerge(ctx, "orders", ords);
    return { ok: true, message: "Added " + mo.added + " orders" + (mo.updated ? " (" + mo.updated + " refreshed)" : "") + " from " + ppMonths(ords) + ". For a per-product picture, add the Order Items download too." + curNote };
  }
  if (has("Type") && has("Title") && (has("Net") || has("Amount"))) {     // Monthly statement
    var sums = {};
    rows.forEach(function (r) {
      var date = ppDate(r.Date); if (!date) return;
      var kind = ppKind(r.Title, r.Type); if (kind === "Deposits") return;
      var net = has("Net") ? dd.files.number(r.Net) : dd.files.number(r.Amount) + dd.files.number(r["Fees & Taxes"]);
      var key = date.slice(0, 7) + "|" + kind;
      sums[key] = (sums[key] || 0) + net;
    });
    var lines = Object.keys(sums).map(function (k) {
      var p = k.split("|"), amt = sums[k];
      // Sales are money in; everything else is shown as what Etsy took (a positive amount).
      return { id: "f" + p[0] + "-" + p[1].replace(/\W+/g, "").toLowerCase(), month: p[0], kind: p[1], amount: ppR2(p[1] === "Sales" ? amt : -amt) };
    });
    if (!lines.length) return { ok: false, message: "Nothing usable was found in that statement." };
    var ms = {}; lines.forEach(function (l) { ms[l.month] = 1; });
    // A statement is the whole month: it replaces what was there for the same months.
    ctx.update(function (d) { d.statement = d.statement.filter(function (f) { return !ms[f.month]; }).concat(lines); });
    return { ok: true, message: "Added Etsy's statement for " + Object.keys(ms).sort().join(", ") + "." + curNote };
  }
  return { ok: false, message: "That doesn't look like an Etsy download I can read. Use Order Items, Orders, or a monthly statement CSV from Etsy." };
}
function ppMerge(ctx, key, rows) {
  var added = 0, updated = 0;
  ctx.update(function (d) {
    var at = {}; d[key].forEach(function (x, i) { at[x.id] = i; });
    rows.forEach(function (x) { if (at[x.id] != null) { d[key][at[x.id]] = x; updated++; } else { at[x.id] = d[key].length; d[key].push(x); added++; } });
  });
  return { added: added, updated: updated };
}
function ppMonths(rows) {
  var ds = rows.map(function (x) { return x.date; }).filter(Boolean).sort();
  var name = function (iso) { var p = iso.split("-"); return ["January","February","March","April","May","June","July","August","September","October","November","December"][+p[1] - 1] + " " + p[0]; };
  if (!ds.length) return "the file";
  var a = name(ds[0]), b = name(ds[ds.length - 1]);
  return a === b ? a : a + " to " + b;
}
function ppMatchNote() {
  var r = ppReport(dd.getData(), "");
  return r.unmatched.length ? " " + r.unmatched.length + " item" + (r.unmatched.length === 1 ? " isn't" : "s aren't") + " linked to a product yet: link them in My Etsy sales, or ask Margo." : "";
}

/* ---------- what the helper is told about the data ---------- */
function ppSummary(d) {
  var s = d.settings, R = ppRates(s), m = function (n) { return ppMoney(n, s); }, out = [];
  out.push("Shop: Etsy payment account in " + R.c.label + " (" + R.c.cur + "). Buyers mostly " + (s.abroad ? "abroad" : "in the same country") + ". " +
    "Fees: listing " + m(R.listing) + ", transaction " + ppPct(R.txn) + ", processing " + ppPct(R.proc) + " + " + m(R.fixed) + ", offsite ads " + ppPct(R.ads) + " (only on ad sales)" +
    (R.reg ? ", regulatory " + ppPct(R.reg) : "") + (R.tax ? ", " + R.c.taxName + " on fees " + ppPct(R.tax) : ", no tax on fees") +
    (R.fixedByHand.length ? " (fixed by hand: " + R.fixedByHand.join(", ") + ")" : "") + ". Default hourly rate " + m(s.hourly) + ". Monthly goal " + m(s.goal) + ".");
  out.push("Products (" + d.products.length + "):" + (d.products.length ? "" : " none yet."));
  d.products.forEach(function (p) {
    var c = ppCalc(p, s);
    out.push("- " + p.name + " (id " + p.id + "): price " + m(p.price) + ", buyer shipping " + m(p.shipCharged) + ", materials " + m(p.materials) + ", " + p.minutes + " min at " + m(c.cost.rate) +
      "/h, packaging " + m(p.packaging) + ", label " + m(p.shipCost) + " → Etsy fees " + m(c.fees.total) + ", profit " + m(c.profit) + " (" + ppPct(c.margin) + "), break-even " + (c.breakEven == null ? "n/a" : m(c.breakEven)) +
      (c.profit > 0 ? ", " + Math.ceil(s.goal / c.profit) + " sales/month for the goal" : "") + (p.photo ? ", has photo" : "") + (p.notes ? ". Notes: " + p.notes : ""));
  });
  if (d.scenarios.length) {
    out.push("What-ifs:");
    d.scenarios.forEach(function (sc) {
      var p = d.products.filter(function (x) { return x.id === sc.product; })[0]; if (!p) return;
      var c = ppCalc(p, s, sc);
      out.push("- '" + sc.name + "' (id " + sc.id + ") for " + p.name + ": price " + m(sc.price) + (sc.discount ? " less " + ppPct(sc.discount) : "") + (sc.ad ? ", offsite ad sale" : "") + " → profit " + m(c.profit) + " (" + ppPct(c.margin) + ")");
    });
  }
  if (d.sales.length || d.statement.length || d.orders.length) out.push("Etsy downloads added: " + ppReportText(d, ""));
  else out.push("No Etsy downloads added yet.");
  return out.join("\n");
}

/* ======================================================================
   Screen
   ====================================================================== */
var PP_INPUTS = [
  ["ppName", "name", "text"], ["ppPrice", "price"], ["ppShipCharged", "shipCharged"], ["ppMaterials", "materials"],
  ["ppMinutes", "minutes"], ["ppHourly", "hourly"], ["ppPackaging", "packaging"], ["ppShipCost", "shipCost"],
  ["ppPhoto", "photo", "text"], ["ppNotes", "notes", "text"]
];
/* Only scroll when the calculator's top isn't already comfortably on screen: on a computer it sits
   right under the products, and jumping the page on every click is disorienting. */
function ppScrollIfHidden(id) {
  var el = document.getElementById(id); if (!el) return;
  var top = el.getBoundingClientRect().top;
  if (top < 60 || top > window.innerHeight * 0.55) ppScrollTo(id);
}
function ppScrollTo(id) { var el = document.getElementById(id); if (el) try { el.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) {} }
function ppSelected(d) {
  var p = d.products.filter(function (x) { return x.id === ppSel; })[0];
  if (!p && d.products.length) { p = d.products[0]; ppSel = p.id; }
  return p || null;
}
function ppNewProduct(ctx) {
  var p = ppBlank(ctx, "New product");
  ctx.update(function (d) { d.products.push(p); });
  ppSel = p.id; ppWhatIf = { discount: 0, ad: false };
  ppRender(dd.ctx()); ppScrollTo("ppCalcCard");
  var n = document.getElementById("ppName"); if (n) { n.focus(); n.select(); }
}

function ppMount(ctx) {
  var $ = ctx.ui.$;
  PP_INPUTS.forEach(function (f) {
    var el = $(f[0]); if (!el) return;
    el.addEventListener("input", function () {
      var p = ppSelected(dd.getData()); if (!p) return;
      var v = el.value, id = p.id;
      if (f[2] === "text") {
        if (f[1] === "photo") { var u = ppPhoto(v); el.classList.toggle("pp-bad", u === null); if (u === null) return; v = u; }
        else v = v.slice(0, f[1] === "notes" ? 300 : 80);
      } else {
        if (f[1] === "hourly" && v.trim() === "") v = null;
        else { var n = parseFloat(String(v).replace(/[^\d.]/g, "")); if (!isFinite(n)) n = 0; v = Math.round(n * 100) / 100; }
      }
      dd.update(function (d) { var q = d.products.filter(function (x) { return x.id === id; })[0]; if (q) q[f[1]] = v; });
    });
  });
  $("ppNew").addEventListener("click", function () { ppNewProduct(dd.ctx()); });
  $("ppNew2").addEventListener("click", function () { ppNewProduct(dd.ctx()); });
  $("ppDelete").addEventListener("click", function () {
    var p = ppSelected(dd.getData()); if (!p) return;
    ctx.ui.confirm("Delete '" + p.name + "'?", "Its what-ifs go too. Sales you added stay.", "Yes, delete it", "No, keep it", true).then(function (yes) {
      if (yes) dd.update(function (d) { d.products = d.products.filter(function (x) { return x.id !== p.id; }); d.scenarios = d.scenarios.filter(function (c) { return c.product !== p.id; }); });
    });
  });
  $("ppDiscount").addEventListener("input", function (e) { ppWhatIf.discount = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)); ppRender(dd.ctx()); });
  $("ppAd").addEventListener("change", function (e) { ppWhatIf.ad = e.target.checked; ppRender(dd.ctx()); });
  $("ppTarget").addEventListener("input", function () { ppRender(dd.ctx()); });
  $("ppUseTarget").addEventListener("click", function () {
    var p = ppSelected(dd.getData()); if (!p) return;
    var c = ppCalc(p, dd.getData().settings, ppWhatIf), want = parseFloat($("ppTarget").value);
    var price = isFinite(want) ? c.priceFor(want, false) : null; if (price == null) return;
    dd.update(function (d) { d.products.filter(function (x) { return x.id === p.id; })[0].price = price; });
    ctx.ui.toast("Price set to " + ppMoney(price, dd.getData().settings) + ".");
  });
  $("ppSaveSc").addEventListener("click", function () {
    var p = ppSelected(dd.getData()); if (!p) return;
    var name = $("ppScName").value.trim() || (ppWhatIf.discount ? ppPct(ppWhatIf.discount) + " off" : "Price " + ppMoney(p.price, dd.getData().settings)) + (ppWhatIf.ad ? ", ad sale" : "");
    dd.update(function (d) { d.scenarios.push({ id: ctx.ui.uid("sc"), product: p.id, name: name.slice(0, 60), price: p.price, shipCharged: p.shipCharged, discount: ppWhatIf.discount, ad: ppWhatIf.ad }); });
    $("ppScName").value = "";
    ctx.ui.toast("Saved the what-if '" + name + "'.");
  });
  $("ppGoal").addEventListener("input", function (e) { var n = parseFloat(e.target.value); if (isFinite(n) && n >= 0) dd.update(function (d) { d.settings.goal = Math.round(n * 100) / 100; }); });
  $("ppShopBtn").addEventListener("click", ppOpenShop);
  $("ppAddFile").addEventListener("click", function () { dd.files.open(); });
  dd.files.dropZone($("ppSalesDrop"));
  ppPhoneCard(ctx);
  dd.on("sync:changed", function () { ppPhoneCard(dd.ctx()); });
}

function ppRender(ctx) {
  var d = ctx.data, s = d.settings, $ = ctx.ui.$, esc = ctx.ui.esc, m = function (n) { return ppMoney(n, s); };
  var p = ppSelected(d), R = ppRates(s);
  // No products yet: the products card says how to start, and the calculator and what-ifs wait.
  $("ppEmpty").hidden = !!p; $("ppCalcCard").hidden = !p; $("ppScCard").hidden = !p;
  $("ppShopLine").textContent = "Selling from " + R.c.label + " · " + R.c.cur + " · fees checked " + PP_CHECKED;
  $("ppCurr").textContent = "(" + R.c.cur + ")";
  document.querySelectorAll(".pp-sym").forEach(function (el) { el.textContent = R.c.sym; });
  if (p) {
    var active = document.activeElement;
    PP_INPUTS.forEach(function (f) {
      var el = $(f[0]); if (!el || el === active) return;
      var v = p[f[1]]; el.value = v == null ? "" : String(v); el.classList.remove("pp-bad");
    });
    $("ppHourly").placeholder = String(s.hourly) + " (shop rate)";
    var img = $("ppImg");
    if (p.photo) { if (img.getAttribute("src") !== p.photo) img.src = p.photo; img.hidden = false; } else { img.hidden = true; img.removeAttribute("src"); }
    if ($("ppDiscount") !== active) $("ppDiscount").value = ppWhatIf.discount ? String(ppWhatIf.discount) : "";
    $("ppAd").checked = ppWhatIf.ad;
    $("ppAdLabel").textContent = "This sale came from an offsite ad (" + R.ads + "%)";
    var c = ppCalc(p, s, ppWhatIf), f = c.fees;
    var row = function (label, val, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : "") + '><td>' + label + '</td><td>' + val + '</td></tr>'; };
    var neg = function (n) { return n ? "−" + m(n) : m(0); };
    $("ppBreakdown").innerHTML = '<table class="pp-table">' +
      row("Buyer pays" + (c.discount ? " (" + ppPct(c.discount) + " off)" : ""), m(c.revenue), "pp-strong") +
      row("Listing fee <small>renews when it sells</small>", neg(f.listing)) +
      row("Transaction fee <small>" + ppPct(R.txn) + "</small>", neg(f.txn)) +
      row("Payment processing <small>" + ppPct(R.proc) + " + " + m(R.fixed) + "</small>", neg(f.proc)) +
      (c.ad ? row("Offsite ads <small>" + ppPct(R.ads) + "</small>", neg(f.ads)) : "") +
      (f.reg ? row("Regulatory operating fee <small>" + ppPct(R.reg) + "</small>", neg(f.reg)) : "") +
      (f.tax ? row(esc(R.c.taxName) + " on Etsy's fees <small>" + ppPct(R.tax) + "</small>", neg(f.tax)) : "") +
      row("Etsy takes", neg(f.total), "pp-sub") +
      row("Materials", neg(c.cost.materials)) +
      (c.cost.labour ? row("Your time <small>" + p.minutes + " min at " + m(c.cost.rate) + "/h</small>", neg(c.cost.labour)) : "") +
      (c.cost.packaging ? row("Packaging", neg(c.cost.packaging)) : "") +
      (c.cost.shipping ? row("Shipping label", neg(c.cost.shipping)) : "") +
      '</table>';
    var good = c.profit > 0;
    $("ppProfit").textContent = m(c.profit);
    $("ppProfit").className = "pp-big " + (good ? "pp-good" : "pp-bad-text");
    $("ppMargin").textContent = ppPct(c.margin) + " margin";
    $("ppKeep").textContent = c.revenue > 0 ? "You keep " + m((c.profit) / c.revenue) + " of every " + R.c.sym + "1 the buyer pays" : "";
    $("ppBreakEven").textContent = c.breakEven == null ? "n/a" : m(c.breakEven);
    var need = c.profit > 0 ? Math.ceil(s.goal / c.profit) : null;
    if ($("ppGoal") !== active) $("ppGoal").value = String(s.goal);
    $("ppNeed").innerHTML = need ? "<b>" + need + "</b> sales a month (about " + Math.ceil(need / 4.33) + " a week)" : "<b>Not reachable</b> until each sale makes a profit";
    var t = parseFloat($("ppTarget").value), tp = isFinite(t) ? c.priceFor(t, false) : null;
    // Empty box: say what it does, so it's clear before anything is typed (audit #16).
    $("ppTargetOut").innerHTML = isFinite(t) ? (tp == null ? "<b>Not possible</b> after Etsy's fees" : Math.abs(tp - p.price) < 0.005 ? "Your price already does that" : "Price it at <b>" + m(tp) + "</b>")
                                             : '<span class="pp-hint">Type a profit to see the price that gets it</span>';
    $("ppUseTarget").hidden = !(isFinite(t) && tp != null && Math.abs(tp - p.price) >= 0.005);
    ppRenderScenarios(ctx, p);
  }
  ppRenderProducts(ctx);
  ppRenderSales(ctx);
}

function ppRenderProducts(ctx) {
  var d = ctx.data, s = d.settings, esc = ctx.ui.esc, box = ctx.ui.$("ppProducts");
  ctx.ui.$("ppProdCount").textContent = d.products.length ? d.products.length + (d.products.length === 1 ? " product" : " products") : "";
  if (!d.products.length) { box.innerHTML = ""; return; }
  box.innerHTML = '<div class="pp-plist">' + d.products.map(function (p) {
    var c = ppCalc(p, s);
    return '<button class="pp-prow' + (p.id === ppSel ? " on" : "") + '" data-p="' + esc(p.id) + '">' +
      (p.photo ? '<img class="pp-thumb" alt="" referrerpolicy="no-referrer" src="' + esc(p.photo) + '" onerror="this.style.visibility=\'hidden\'">' : '<span class="pp-thumb pp-thumb-empty" aria-hidden="true">📦</span>') +
      '<span class="pp-pname">' + esc(p.name) + '<small>' + ppMoney(p.price, s) + '</small></span>' +
      '<span class="pp-pprofit ' + (c.profit > 0 ? "pp-good" : "pp-bad-text") + '">' + ppMoney(c.profit, s) + '<small>' + ppPct(c.margin) + '</small></span></button>';
  }).join("") + '</div>';
  box.querySelectorAll("[data-p]").forEach(function (b) {
    b.addEventListener("click", function () { ppSel = b.getAttribute("data-p"); ppWhatIf = { discount: 0, ad: false }; ppRender(dd.ctx()); ppScrollIfHidden("ppCalcCard"); });
  });
}

function ppRenderScenarios(ctx, p) {
  var d = ctx.data, s = d.settings, esc = ctx.ui.esc, m = function (n) { return ppMoney(n, s); };
  var list = d.scenarios.filter(function (c) { return c.product === p.id; });
  ctx.ui.$("ppScFor").textContent = p.name;
  var box = ctx.ui.$("ppScenarios");
  if (!list.length) { box.innerHTML = '<p class="dd-note">No what-ifs for ' + esc(p.name) + ' yet. Try a sale discount or ad sale above, then save it here to compare.</p>'; return; }
  var cols = [{ name: "Now", c: ppCalc(p, s), now: true }].concat(list.map(function (sc) { return { name: sc.name, c: ppCalc(p, s, sc), sc: sc }; }));
  var best = cols.reduce(function (a, b) { return b.c.profit > a.c.profit ? b : a; });
  var tr = function (label, fn) { return '<tr><th scope="row">' + label + '</th>' + cols.map(function (x) { return '<td' + (x === best ? ' class="pp-best"' : "") + '>' + fn(x) + '</td>'; }).join("") + '</tr>'; };
  box.innerHTML = '<div class="pp-scroll"><table class="pp-compare"><thead><tr><th></th>' + cols.map(function (x) {
      return '<th' + (x === best ? ' class="pp-best"' : "") + '>' + esc(x.name) + (x.sc ? '<div class="pp-scbtns"><button class="dd-linkbtn" data-use="' + esc(x.sc.id) + '">Use</button><button class="dd-linkbtn" data-del="' + esc(x.sc.id) + '" aria-label="Delete ' + esc(x.name) + '">×</button></div>' : "") + '</th>';
    }).join("") + '</tr></thead><tbody>' +
    tr("Price", function (x) { return m(x.c.price); }) +
    tr("Sale discount", function (x) { return x.c.discount ? ppPct(x.c.discount) : "–"; }) +
    tr("Buyer pays", function (x) { return m(x.c.revenue); }) +
    tr("Offsite ad", function (x) { return x.c.ad ? "Yes" : "No"; }) +
    tr("Etsy takes", function (x) { return m(x.c.fees.total); }) +
    tr("Profit", function (x) { return '<b class="' + (x.c.profit > 0 ? "pp-good" : "pp-bad-text") + '">' + m(x.c.profit) + '</b>'; }) +
    tr("Margin", function (x) { return ppPct(x.c.margin); }) +
    tr("Sales for goal", function (x) { return x.c.profit > 0 ? String(Math.ceil(s.goal / x.c.profit)) : "–"; }) +
    '</tbody></table></div>';
  box.querySelectorAll("[data-use]").forEach(function (b) { b.addEventListener("click", function () {
    var sc = d.scenarios.filter(function (x) { return x.id === b.getAttribute("data-use"); })[0]; if (!sc) return;
    dd.update(function (dd2) { var q = dd2.products.filter(function (x) { return x.id === sc.product; })[0]; if (q) { q.price = sc.price; q.shipCharged = sc.shipCharged; } });
    ctx.ui.toast("Using the price from '" + sc.name + "'." + (sc.discount ? " Set the discount on Etsy itself." : ""));
  }); });
  box.querySelectorAll("[data-del]").forEach(function (b) { b.addEventListener("click", function () {
    var id = b.getAttribute("data-del"); dd.update(function (dd2) { dd2.scenarios = dd2.scenarios.filter(function (x) { return x.id !== id; }); });
  }); });
}

function ppRenderSales(ctx) {
  var d = ctx.data, s = d.settings, esc = ctx.ui.esc, m = function (n) { return ppMoney(n, s); }, $ = ctx.ui.$;
  var any = d.sales.length || d.orders.length || d.statement.length;
  $("ppSalesEmpty").hidden = !!any; $("ppSalesBody").hidden = !any;
  if (!any) return;
  var r = ppReport(d, ""), html = "";
  if (r.count) {
    html += '<div class="pp-tiles"><div><b>' + r.qty + '</b><span>items sold</span></div><div><b>' + m(r.revenue) + '</b><span>item sales</span></div>' +
      '<div><b>' + m(r.products.reduce(function (n, x) { return n + x.profit; }, 0)) + '</b><span>est. profit (linked items)</span></div></div>' +
      '<p class="dd-note">' + esc(r.first) + ' to ' + esc(r.last) + ' · before coupons</p>';
    if (r.products.length) html += '<table class="pp-table pp-sales"><thead><tr><th>Product</th><th>Sold</th><th>Sales</th><th>Est. profit</th></tr></thead><tbody>' +
      r.products.map(function (x) { return '<tr><td>' + esc(x.product.name) + '</td><td>' + x.qty + '</td><td>' + m(x.revenue) + '</td><td class="' + (x.profit > 0 ? "pp-good" : "pp-bad-text") + '">' + m(x.profit) + '</td></tr>'; }).join("") + '</tbody></table>';
    if (r.unmatched.length) html += '<h3 class="pp-h3">Not linked to a product yet</h3><div class="pp-unmatched">' + r.unmatched.slice(0, 15).map(function (x, i) {
      return '<div class="pp-urow"><span>' + esc(x.item) + ' <small>' + x.qty + ' sold · ' + m(x.revenue) + '</small></span><select class="dd-input pp-link" data-i="' + i + '"><option value="">Link to…</option>' +
        d.products.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join("") + '<option value="__new">➕ New product from this</option></select></div>';
    }).join("") + '</div>';
    if (r.months.length > 1) {
      var max = Math.max.apply(null, r.months.map(function (x) { return x.revenue; })) || 1;
      html += '<h3 class="pp-h3">By month</h3><div class="pp-months">' + r.months.map(function (x) {
        return '<div class="pp-mrow"><span>' + esc(x.month) + '</span><span class="pp-bar"><i style="width:' + Math.max(2, Math.round(x.revenue / max * 100)) + '%"></i></span><span>' + m(x.revenue) + '</span></div>';
      }).join("") + '</div>';
    }
  }
  var charged = PP_CHARGES.filter(function (k) { return r.fees[k]; });
  if (charged.length) {
    var total = charged.reduce(function (n, k) { return n + r.fees[k]; }, 0);
    html += '<h3 class="pp-h3">What Etsy charged <small>(' + esc(r.feeMonths.join(", ")) + ')</small></h3><table class="pp-table">' +
      charged.map(function (k) { return '<tr><td>' + esc(k) + '</td><td>' + m(r.fees[k]) + '</td></tr>'; }).join("") +
      '<tr class="pp-sub"><td>Etsy\'s fees' + (r.fees.Sales ? ' <small>' + ppPct(total / r.fees.Sales * 100) + ' of ' + m(r.fees.Sales) + ' sales</small>' : "") + '</td><td>' + m(total) + '</td></tr></table>';
  }
  if (r.fees[PP_POSTAGE]) html += '<table class="pp-table pp-postage"><tr><td>Shipping labels <small>Postage you bought through Etsy. Not a fee, so it isn\'t in the total above.</small></td><td>' + m(r.fees[PP_POSTAGE]) + '</td></tr></table>';
  if (r.orders.count) html += '<p class="dd-note">Orders file: ' + r.orders.count + ' orders · ' + m(r.orders.shipping) + ' shipping charged · ' + m(r.orders.discount) + ' discounts · ' + m(r.orders.procFee) + ' processing fees.</p>';
  html += '<div class="pp-salesfoot"><button class="dd-btn ghost small" id="ppAddFile2">📂 Add another download</button><button class="dd-linkbtn pp-quiet" id="ppClearSales">Remove added sales…</button></div>';
  $("ppSalesBody").innerHTML = html;
  $("ppAddFile2").addEventListener("click", function () { dd.files.open(); });
  $("ppClearSales").addEventListener("click", function () {
    ctx.ui.confirm("Remove the Etsy sales you added?", "Your products and what-ifs stay. You can add the files again any time.", "Yes, remove them", "No, keep them", true).then(function (yes) {
      if (yes) dd.update(function (x) { x.sales = []; x.orders = []; x.statement = []; });
    });
  });
  $("ppSalesBody").querySelectorAll(".pp-link").forEach(function (sel) {
    sel.addEventListener("change", function () {
      var item = r.unmatched[+sel.getAttribute("data-i")]; if (!item || !sel.value) return;
      if (sel.value === "__new") {
        var c = dd.ctx(), np = ppBlank(c, item.item.split(/\s[-–|,]\s?/)[0].slice(0, 60));
        np.price = ppR2(item.qty ? item.revenue / item.qty : 0);
        dd.update(function (x) { x.products.push(np); });
        ppSel = np.id; ppLink(dd.ctx(), item.item, np.id);
        ctx.ui.toast("Made '" + np.name + "' from your sales. Add its costs above.");
        ppScrollTo("ppCalcCard");
      } else ppLink(dd.ctx(), item.item, sel.value);
    });
  });
}

/* The phone card (audit 2026-10-08, #4-#6, #15).
   Computers: a big QR to scan, right on the page. Phones: never a QR (you can't scan your own screen);
   instead, plainly, what happens with sync off, and the Home Screen. Synced phone: nothing to say. */
var ppQrMounted = false;
function ppPhoneCard(ctx) {
  var box = ctx.ui.$("ppPhoneCard"); if (!box) return;
  var synced = !!(dd.sync && dd.sync.isOn && dd.sync.isOn()), thing = DD_PROGRAM.dataLabel;
  if (!dd.env.isPhone) {
    if (ppQrMounted) return;
    ppQrMounted = true;
    box.innerHTML = '<div class="pp-phone"><div class="pp-phone-qr" id="ppQr"></div><div class="pp-phone-text">' +
      '<h2>📲 Use it on your phone</h2>' +
      '<p class="pp-phone-big">Scan this square with your phone\'s camera, then tap the link that appears.</p>' +
      '<p>Price Pilot opens on your phone with your ' + ctx.ui.esc(thing) + ' and Margo ready to go. No app store, nothing to install.</p>' +
      '<p class="dd-note" id="ppPhoneSync"></p></div></div>';
    dd.pair.inline(ctx.ui.$("ppQr"), { size: 240 });
    ppPhoneSyncLine(ctx);
    dd.on("sync:changed", function () { ppPhoneSyncLine(dd.ctx()); });
    return;
  }
  // The Home Screen reminder is the platform's (one dismissible notice), so it isn't repeated here.
  if (synced) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<h2>📱 On this phone</h2>' +
    '<p class="pp-warnline">⚠️ <b>Sync is off</b>, so changes you make on this phone won\'t appear on your computer, and changes on your computer won\'t show up here.</p>' +
    '<div class="dd-btnrow"><button class="dd-btn small" id="ppSyncOn">Turn on sync</button></div>';
  ctx.ui.$("ppSyncOn").addEventListener("click", function () { dd.sync.config() ? dd.sync.openSheet() : dd.setup.open("sync"); });
}
function ppPhoneSyncLine(ctx) {
  var el = ctx.ui.$("ppPhoneSync"); if (!el) return;
  var synced = !!(dd.sync && dd.sync.isOn && dd.sync.isOn());
  el.innerHTML = synced ? "🔄 Live sync is on: a change on either device shows up on the other."
    : "Sync is off, so after this your phone and computer each keep their own numbers. <button class=\"dd-linkbtn\" id=\"ppSyncSetup\" style=\"padding:0\">Turn on sync</button> to keep them together.";
  var b = ctx.ui.$("ppSyncSetup"); if (b) b.addEventListener("click", function () { dd.sync.config() ? dd.sync.openSheet() : dd.setup.open("sync"); });
}

/* My shop & Etsy's fees: one sheet, everything on it. */
function ppOpenShop() {
  var d = dd.getData(), s = d.settings, R = ppRates(s), esc = dd.ui.esc;
  var c = R.c, dual = c.proc !== c.procAbroad;
  var rate = function (k, label, val, unit) {
    return '<label class="pp-rate"><span>' + label + '</span><span class="pp-rate-in">' + (unit === "$" ? esc(c.sym) : "") +
      '<input class="dd-input" inputmode="decimal" data-rate="' + k + '" value="' + val + '">' + (unit === "%" ? "%" : "") + '</span></label>';
  };
  var sh = dd.ui.sheet('<h2>🏪 My shop &amp; Etsy\'s fees</h2>' +
    '<label class="pp-field"><span>My Etsy payment account is in</span><select class="dd-input" id="ppCountry">' +
      Object.keys(PP_COUNTRIES).map(function (k) { return '<option value="' + k + '"' + (k === s.country ? " selected" : "") + '>' + esc(PP_COUNTRIES[k].label) + ' (' + PP_COUNTRIES[k].cur + ')</option>'; }).join("") + '</select></label>' +
    (dual ? '<label class="pp-check"><input type="checkbox" id="ppAbroad"' + (s.abroad ? " checked" : "") + '> Most of my buyers are in other countries <small>(processing is ' + c.procAbroad + '% instead of ' + c.proc + '%' + (s.country === "CA" ? "; US buyers count as home" : "") + ')</small></label>' : "") +
    '<label class="pp-check"><input type="checkbox" id="ppBig"' + (s.bigShop ? " checked" : "") + '> My shop sold over US$10,000 in the last 12 months <small>(offsite ads cost 12% instead of 15%)</small></label>' +
    (c.tax ? '<label class="pp-check"><input type="checkbox" id="ppFeeTax"' + (s.feeTax ? " checked" : "") + '> Etsy adds ' + esc(c.taxName) + ' to its fees and I can\'t claim it back <small>(untick if you\'re registered and claim it)</small></label>' : "") +
    '<label class="pp-field"><span>My hourly rate for making things</span><input class="dd-input" id="ppRate" inputmode="decimal" value="' + s.hourly + '"></label>' +
    '<details class="pp-details"><summary>Etsy\'s fee rates for ' + esc(c.label) + '</summary>' +
      '<p class="dd-note">Checked against Etsy\'s fee pages on ' + PP_CHECKED + '. Etsy changes fees now and then: if one looks different on your Etsy bill, fix it here.</p>' +
      rate("listing", "Listing fee (about US$0.20)", R.listing, "$") + rate("txn", "Transaction fee", R.txn, "%") +
      rate("proc", "Payment processing", R.proc, "%") + rate("fixed", "…plus per order", R.fixed, "$") +
      rate("reg", "Regulatory operating fee", R.reg, "%") + (c.tax ? rate("tax", esc(c.taxName) + " on fees", s.feeTax ? R.tax : c.tax, "%") : "") +
      (R.fixedByHand.length ? '<button class="dd-linkbtn" id="ppResetRates">Put back Etsy\'s rates</button>' : "") +
    '</details>' +
    '<div class="dd-btnrow"><button class="dd-btn" data-close>Done</button></div>', { sticky: true });
  var $ = function (id) { return sh.querySelector("#" + id); };
  var change = function (fn) { dd.update(fn); };
  $("ppCountry").addEventListener("change", function (e) { change(function (x) { x.settings.country = e.target.value; x.settings.rates = {}; }); ppOpenShop(); });
  if ($("ppAbroad")) $("ppAbroad").addEventListener("change", function (e) { change(function (x) { x.settings.abroad = e.target.checked; }); ppOpenShop(); });
  $("ppBig").addEventListener("change", function (e) { change(function (x) { x.settings.bigShop = e.target.checked; }); });
  if ($("ppFeeTax")) $("ppFeeTax").addEventListener("change", function (e) { change(function (x) { x.settings.feeTax = e.target.checked; }); ppOpenShop(); });
  $("ppRate").addEventListener("input", function (e) { var n = parseFloat(e.target.value); if (isFinite(n) && n >= 0) change(function (x) { x.settings.hourly = Math.round(n * 100) / 100; }); });
  sh.querySelectorAll("[data-rate]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var n = parseFloat(inp.value); if (!isFinite(n) || n < 0) return;
      var k = inp.getAttribute("data-rate");
      change(function (x) { var r = x.settings.rates.country === x.settings.country ? Object.assign({}, x.settings.rates) : { country: x.settings.country }; r[k] = n; x.settings.rates = r; });
    });
  });
  if ($("ppResetRates")) $("ppResetRates").addEventListener("click", function () { change(function (x) { x.settings.rates = {}; }); ppOpenShop(); dd.ui.toast("Back to Etsy's rates."); });
  sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
}

// For tests and the support report: the maths, on its own.
window.PP = { calc: ppCalc, rates: ppRates, countries: PP_COUNTRIES, report: ppReport, summary: ppSummary, take: ppTakeFile };
