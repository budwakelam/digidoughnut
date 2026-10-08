/* ===== DigiDoughnut Platform · dd.brand — the look: banner, colours, logo (2026-10-08) =====
   Oran: "the top banner looks sterile… let the customer pick the accent colours to match their
   branding, and link their store banner image and use it in the app's banner."

   - A banner at the top of every program (#dd-hero). Out of the box it's DigiDoughnut's own
     placeholder look: the program's colours, sprinkles, the program's name. The buyer can make it
     theirs: their Etsy shop banner (a link, "Copy image address"), their shop icon, their shop name,
     and two colours (main + second) picked from presets or any colour.
   - The DigiDoughnut logo sits in the footer (embedded at build time as DD_LOGO, no outside image).
   - The look is saved INSIDE the program's data as data.brand, so it syncs to the buyer's other
     devices, travels with Send to my phone and goes into backups. Programs never see it: their
     validateData ignores keys they don't know, and dd.migrateData carries it through upgrades.
     Changing the look never ends "example mode" (it uses replaceData with the same example flag).
   - Every value is checked before use: colours are #rrggbb, pictures are https links only. A
     picture is only ever shown as a picture (CSS background or <img>), never run.
   - The main colour is darkened if needed so white text on buttons stays readable (4.5:1). */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var brand = dd.brand = {};
  var program = null;
  var esc = function (s) { return dd.ui.esc(s); };

  /* Ready-made colour pairs: [name, main, second]. The first is filled in with the program's own. */
  brand.PRESETS = [
    ["Sprinkle pink", "#db2777", "#f59e0b"],
    ["Terracotta", "#c2410c", "#f59e0b"],
    ["Berry", "#9d174d", "#7c3aed"],
    ["Lavender", "#6d28d9", "#ec4899"],
    ["Ocean", "#0369a1", "#06b6d4"],
    ["Sage", "#3f6212", "#84cc16"],
    ["Forest", "#166534", "#ca8a04"],
    ["Sunny", "#b45309", "#facc15"],
    ["Charcoal", "#374151", "#9ca3af"],
    ["Midnight", "#1e3a8a", "#f472b6"]
  ];

  /* ---------- colour helpers ---------- */
  var HEX = /^#[0-9a-f]{6}$/i;
  function rgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function hex(a) { return "#" + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join(""); }
  function lum(h) {
    var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  brand.contrast = function (a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /* The same colour, darkened step by step until white text on it is easy to read. */
  brand.readable = function (h) {
    if (!HEX.test(h)) return h;
    var out = h, i = 0;
    while (brand.contrast(out, "#ffffff") < 4.5 && i++ < 40) out = hex(rgb(out).map(function (v) { return v * 0.92; }));
    return out;
  };

  /* ---------- what's saved ---------- */
  function httpsLink(v) {
    var s = String(v || "").trim(); if (!s) return "";
    try { var u = new URL(s); return u.protocol === "https:" && s.length <= 800 ? u.href : null; } catch (e) { return null; }
  }
  brand.httpsLink = httpsLink;
  /* A clean copy of a saved look: anything unexpected is dropped. */
  brand.clean = function (b) {
    b = b && typeof b === "object" ? b : {};
    var out = {};
    if (typeof b.shop === "string") out.shop = b.shop.trim().slice(0, 60);
    ["banner", "logo"].forEach(function (k) { var u = httpsLink(b[k]); if (u) out[k] = u; });
    ["accent", "accent2"].forEach(function (k) { if (HEX.test(b[k] || "")) out[k] = b[k].toLowerCase(); });
    if (typeof b.text === "boolean") out.text = b.text;
    if (typeof b.hidden === "boolean") out.hidden = b.hidden;
    return out;
  };
  brand.get = function () { var d = dd.getData && dd.getData(); return brand.clean(d && d.brand); };
  brand.defaults = function () {
    var p = program || (dd.getProgram && dd.getProgram()) || {};
    return { accent: HEX.test(p.accent || "") ? p.accent.toLowerCase() : "#2563eb", accent2: HEX.test(p.accent2 || "") ? p.accent2.toLowerCase() : "#f59e0b" };
  };
  /* The look in use: what the buyer chose, else the program's own. */
  brand.look = function () {
    var b = brand.get(), d = brand.defaults();
    return { shop: b.shop || "", banner: b.banner || "", logo: b.logo || "", accent: b.accent || d.accent, accent2: b.accent2 || d.accent2,
             text: b.text !== false, hidden: !!b.hidden, custom: !!(b.shop || b.banner || b.logo || b.accent || b.accent2) };
  };
  brand.isCustom = function () { return brand.look().custom; };

  /* Change the look. Never ends example mode, never touches the program's own data. */
  brand.set = function (patch) {
    var d = dd.getData(); if (!d) return;
    var next = brand.clean(Object.assign({}, brand.get(), patch));
    Object.keys(patch).forEach(function (k) { if (patch[k] === null || patch[k] === "") delete next[k]; });
    var copy = Object.assign({}, d);
    if (Object.keys(next).length) copy.brand = next; else delete copy.brand;
    dd.replaceData(copy, { example: dd.isExample(), source: "brand" });
    brand.apply();
  };
  brand.reset = function () {
    var d = dd.getData(); if (!d || !d.brand) return;
    var copy = Object.assign({}, d); delete copy.brand;
    dd.replaceData(copy, { example: dd.isExample(), source: "brand" });
    brand.apply();
  };

  /* ---------- painting ---------- */
  var lastSig = "";
  brand.apply = function (force) {
    if (!program) return;
    var L = brand.look(), main = brand.readable(L.accent), sig = JSON.stringify(L);
    if (sig === lastSig && !force && document.querySelector("#dd-hero .dd-hero, #dd-hero[hidden]")) return;
    lastSig = sig;
    dd.ui.setAccent(main);
    var r = document.documentElement.style;
    r.setProperty("--dd-accent2", L.accent2);
    r.setProperty("--dd-accent-raw", L.accent);
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", main);
    paintHero(L);
    paintTop(L);
  };

  /* Sprinkles: a small repeating pattern for the placeholder banner (no outside image). */
  function sprinkles() {
    var cols = ["#ffffff", "#fde68a", "#f9a8d4", "#a5f3fc", "#bbf7d0", "#ddd6fe"], bits = "";
    var spots = [[14, 18, 30], [52, 10, -40], [86, 30, 70], [30, 52, 10], [70, 62, -20], [104, 70, 45], [18, 90, -60], [58, 100, 25], [96, 108, -10], [40, 124, 80]];
    spots.forEach(function (s, i) {
      bits += '<rect x="' + s[0] + '" y="' + s[1] + '" width="11" height="3.6" rx="1.8" fill="' + cols[i % cols.length] + '" transform="rotate(' + s[2] + ' ' + (s[0] + 5) + ' ' + (s[1] + 2) + ')"/>';
    });
    return "url(\"data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="136" opacity=".55">' + bits + '</svg>') + "\")";
  }
  var SPRINKLES = null;

  function paintHero(L) {
    var host = document.getElementById("dd-hero"); if (!host || program.brand === false) return;
    if (L.hidden) { host.innerHTML = ""; host.hidden = true; return; }
    host.hidden = false;
    SPRINKLES = SPRINKLES || sprinkles();
    var img = L.banner ? ' style="--dd-hero-img:url(&quot;' + esc(L.banner) + '&quot;)"' : ' style="--dd-hero-sprinkles:' + esc(SPRINKLES) + '"';
    var title = L.shop || program.name;
    var showText = !L.banner || L.text;
    host.innerHTML = '<div class="dd-hero' + (L.banner ? " dd-hero-img" : " dd-hero-plain") + (showText ? "" : " dd-hero-notext") + '"' + img + '>' +
      (L.banner ? '<img class="dd-hero-probe" alt="" src="' + esc(L.banner) + '" referrerpolicy="no-referrer">' : '<span class="dd-hero-blob a"></span><span class="dd-hero-blob b"></span>') +
      (showText ? '<div class="dd-hero-text">' +
        (L.logo ? '<img class="dd-hero-logo" alt="" src="' + esc(L.logo) + '" referrerpolicy="no-referrer">' : '<span class="dd-hero-mark" aria-hidden="true">' + esc((program.icon || "🍩")) + '</span>') +
        '<div><div class="dd-hero-title">' + esc(title) + '</div>' +
        '<div class="dd-hero-sub">' + (L.shop ? esc(program.name) + (program.tagline ? '<span class="dd-hero-tag"> · ' + esc(program.tagline) + '</span>' : "") : esc(program.tagline || "")) + '</div></div></div>' : "") +
      '<button class="dd-hero-edit" id="dd-hero-edit" aria-label="Change the look">🎨<span class="dd-hero-edit-label"> ' + (L.custom ? "Look" : "Make it yours") + '</span></button>' +
      '</div>';
    host.querySelector("#dd-hero-edit").addEventListener("click", function () { brand.open(); });
    // A banner link that doesn't load (moved, private, typo): fall back to the colours, and say so in the sheet.
    var probe = host.querySelector(".dd-hero-probe");
    if (probe) probe.addEventListener("error", function () {
      brand.bannerFailed = L.banner;
      var h = host.querySelector(".dd-hero"); if (h) { h.classList.remove("dd-hero-img"); h.classList.add("dd-hero-plain"); h.style.setProperty("--dd-hero-sprinkles", SPRINKLES); }
      dd.errors.record("brand", "the banner picture didn't load");
    });
  }

  /* The sticky top bar: the shop's icon beside the program's name, and the tagline lives in the banner. */
  function paintTop(L) {
    var top = document.getElementById("dd-top"); if (!top) return;
    top.classList.toggle("dd-top-hero", program.brand !== false && !L.hidden);
    var old = top.querySelector(".dd-top-logo"); if (old) old.remove();
    if (L.logo) {
      var i = document.createElement("img"); i.className = "dd-top-logo"; i.alt = ""; i.referrerPolicy = "no-referrer"; i.src = L.logo;
      i.addEventListener("error", function () { i.remove(); });
      top.insertBefore(i, top.firstChild);
    }
  }

  /* ---------- the "🎨 Look & branding" sheet ---------- */
  brand.open = function () {
    var L = brand.look(), D = brand.defaults(), p = program;
    var presets = [[p.name + "'s own", D.accent, D.accent2]].concat(brand.PRESETS.filter(function (c) { return !(c[1] === D.accent && c[2] === D.accent2); }));
    var sh = dd.ui.sheet('<h2>🎨 Look &amp; branding</h2>' +
      '<p class="dd-note" style="margin-top:0">Make ' + esc(p.name) + ' match your shop. Changes show straight away and go to your other devices with sync.</p>' +
      '<div class="dd-brand-preview" id="dd-brand-preview"></div>' +
      '<h3 class="dd-sub">Colours</h3>' +
      '<div class="dd-swatches" role="list">' + presets.map(function (c, i) {
        var on = c[1] === L.accent && c[2] === L.accent2;
        return '<button class="dd-swatch' + (on ? " on" : "") + '" data-preset="' + i + '" role="listitem" aria-label="' + esc(c[0]) + '" title="' + esc(c[0]) + '">' +
          '<i style="background:linear-gradient(135deg,' + c[1] + ' 0 50%,' + c[2] + ' 50% 100%)"></i><span>' + esc(c[0]) + '</span></button>';
      }).join("") + '</div>' +
      '<div class="dd-colorrow"><label><input type="color" id="dd-c1" value="' + L.accent + '"> Main colour <small>buttons, links, highlights</small></label>' +
        '<label><input type="color" id="dd-c2" value="' + L.accent2 + '"> Second colour <small>the banner and accents</small></label></div>' +
      '<p class="dd-note" id="dd-c-note"></p>' +
      '<h3 class="dd-sub">Your shop</h3>' +
      '<label class="dd-brand-field"><span>Shop name <small>shown in the banner instead of "' + esc(p.name) + '"</small></span>' +
        '<input class="dd-input" id="dd-b-shop" maxlength="60" autocomplete="off" placeholder="e.g. Clay &amp; Co. Pottery" value="' + esc(L.shop) + '"></label>' +
      '<label class="dd-brand-field"><span>Shop banner picture <small>a link to the picture</small></span>' +
        '<input class="dd-input" id="dd-b-banner" autocomplete="off" placeholder="https://i.etsystatic.com/…" value="' + esc(L.banner) + '"></label>' +
      '<details class="dd-wiz-more"><summary>How do I get the link to my Etsy banner?</summary>' +
        '<ol class="dd-home-steps"><li>Open your Etsy shop page on a computer.</li><li>Right-click your shop banner (the wide picture at the top) and choose <b>Copy image address</b> (Safari: <b>Copy Image Address</b>).</li>' +
        '<li>Paste it in the box above.</li></ol><p class="dd-note">The same works for your shop icon. The picture stays on Etsy; ' + esc(p.name) + ' only keeps the link.</p></details>' +
      '<label class="dd-check"><input type="checkbox" id="dd-b-text"' + (L.text ? " checked" : "") + '> Show the name on the banner <small>(untick if your banner already has your shop name on it)</small></label>' +
      '<label class="dd-brand-field"><span>Shop icon or logo <small>a link to the picture, shown next to the name</small></span>' +
        '<input class="dd-input" id="dd-b-logo" autocomplete="off" placeholder="https://i.etsystatic.com/…" value="' + esc(L.logo) + '"></label>' +
      '<div class="dd-status" id="dd-b-status"></div>' +
      '<label class="dd-check"><input type="checkbox" id="dd-b-hide"' + (L.hidden ? " checked" : "") + '> Hide the banner (keep the colours)</label>' +
      '<div class="dd-btnrow"><button class="dd-btn" data-close>Done</button>' + (L.custom || L.hidden ? '<button class="dd-btn ghost" data-reset>Back to ' + esc(p.name) + '\'s own look</button>' : "") + '</div>',
      { sticky: true });
    sh.classList.add("dd-sheet-wide");
    var q = function (s) { return sh.querySelector(s); };
    function preview() {
      var host = q("#dd-brand-preview"), hero = document.querySelector("#dd-hero .dd-hero");
      host.innerHTML = hero ? hero.outerHTML : '<p class="dd-note">The banner is hidden.</p>';
      var b = host.querySelector(".dd-hero-edit"); if (b) b.remove();
      var c1 = q("#dd-c1").value;
      q("#dd-c-note").textContent = brand.readable(c1) !== c1.toLowerCase() ? "That main colour is light, so buttons use a slightly deeper shade of it to keep their white text readable." : "";
    }
    // One wait per box, so quick typing in two boxes saves both.
    var timers = {};
    function later(key, fn) { clearTimeout(timers[key]); timers[key] = setTimeout(function () { fn(); preview(); }, 250); }
    sh.querySelectorAll("[data-preset]").forEach(function (b) { b.addEventListener("click", function () {
      var c = presets[+b.getAttribute("data-preset")];
      if (+b.getAttribute("data-preset") === 0) brand.set({ accent: null, accent2: null }); else brand.set({ accent: c[1], accent2: c[2] });
      q("#dd-c1").value = c[1]; q("#dd-c2").value = c[2];
      sh.querySelectorAll(".dd-swatch").forEach(function (x) { x.classList.toggle("on", x === b); });
      preview();
    }); });
    ["#dd-c1", "#dd-c2"].forEach(function (id, i) { q(id).addEventListener("input", function (e) {
      var v = e.target.value; later(id, function () { var o = {}; o[i ? "accent2" : "accent"] = v; brand.set(o); });
      sh.querySelectorAll(".dd-swatch").forEach(function (x) { x.classList.remove("on"); });
    }); });
    q("#dd-b-shop").addEventListener("input", function (e) { var v = e.target.value; later("shop", function () { brand.set({ shop: v.trim() || null }); }); });
    function linkBox(id, key, what) {
      q(id).addEventListener("input", function (e) {
        var raw = e.target.value.trim(), u = httpsLink(raw), st = q("#dd-b-status");
        if (raw && u === null) { dd.ui.status(st, "warn", "That doesn't look like a picture link.", "It should start with https://. On Etsy, right-click the picture and choose Copy image address."); return; }
        dd.ui.clearStatus(st);
        later(key, function () { var o = {}; o[key] = u || null; brand.set(o); });
        if (u) { var t = new Image(); t.referrerPolicy = "no-referrer"; t.onerror = function () { if (q(id) && q(id).value.trim() === raw) dd.ui.status(st, "warn", "That " + what + " picture didn't load.", "Check the link opens a picture in your browser. Etsy picture links start with https://i.etsystatic.com/."); }; t.src = u; }
      });
    }
    linkBox("#dd-b-banner", "banner", "banner");
    linkBox("#dd-b-logo", "logo", "shop icon");
    q("#dd-b-text").addEventListener("change", function (e) { brand.set({ text: e.target.checked }); preview(); });
    q("#dd-b-hide").addEventListener("change", function (e) { brand.set({ hidden: e.target.checked || null }); preview(); });
    q("[data-close]").addEventListener("click", dd.ui.closeSheet);
    var rs = q("[data-reset]"); if (rs) rs.addEventListener("click", function () { brand.reset(); dd.ui.closeSheet(); dd.ui.toast("Back to " + p.name + "'s own look."); });
    preview();
    return sh;
  };

  /* ---------- the footer: the DigiDoughnut logo ---------- */
  brand.footerLogo = function () {
    return window.DD_LOGO ? '<img class="dd-foot-logo" src="' + window.DD_LOGO + '" alt="DigiDoughnut" width="180" height="60">' : "<b>DigiDoughnut</b>";
  };

  /* The look travels with Send to my phone even while the numbers are still examples. */
  if (dd.pair) dd.pair.register({ key: "b", label: "look", hidden: true,
    give: function () { var b = brand.get(); return Object.keys(b).length ? b : undefined; },
    take: function (v) { var b = brand.clean(v); if (!Object.keys(b).length) return false; brand.set(b); return true; } });

  /* The helper can change the look too ("make it purple", "use my Etsy banner"). dd.helper adds this
     tool to the program's own when the program has a banner. */
  brand.tool = { name: "change_look", description: "Change how the program looks: the main and second colours (hex like #7c3aed, or a preset name: " +
      brand.PRESETS.map(function (c) { return c[0]; }).join(", ") + "), the shop name shown in the banner, the shop's banner picture or icon (https links, e.g. from 'Copy image address' on Etsy), or reset to the program's own look.",
    params: { preset: { type: "string", description: "A preset name", optional: true },
              main_colour: { type: "string", description: "#rrggbb", optional: true },
              second_colour: { type: "string", description: "#rrggbb", optional: true },
              shop_name: { type: "string", description: "Shop name for the banner; empty to remove", optional: true },
              banner_link: { type: "string", description: "https link to the banner picture; empty to remove", optional: true },
              icon_link: { type: "string", description: "https link to the shop icon; empty to remove", optional: true },
              reset: { type: "boolean", description: "true = back to the program's own look", optional: true } },
    run: function (a) {
      if (a.reset) { brand.reset(); return { ok: true, message: "Back to " + program.name + "'s own look." }; }
      var o = {}, said = [];
      if (a.preset) {
        var pr = brand.PRESETS.filter(function (c) { return c[0].toLowerCase() === String(a.preset).toLowerCase(); })[0];
        if (!pr) return { ok: false, message: "No preset called '" + a.preset + "'. Presets: " + brand.PRESETS.map(function (c) { return c[0]; }).join(", ") + "." };
        o.accent = pr[1]; o.accent2 = pr[2]; said.push("colours " + pr[0]);
      }
      [["main_colour", "accent"], ["second_colour", "accent2"]].forEach(function (k) {
        if (a[k[0]] == null) return;
        if (!HEX.test(String(a[k[0]]))) { said.push("(skipped " + k[0].replace("_", " ") + ": use #rrggbb)"); return; }
        o[k[1]] = String(a[k[0]]).toLowerCase(); said.push(k[0].replace("_", " ") + " " + o[k[1]]);
      });
      if (a.shop_name != null) { o.shop = String(a.shop_name).trim() || null; said.push(o.shop ? "shop name" : "no shop name"); }
      var bad = [];
      [["banner_link", "banner"], ["icon_link", "logo"]].forEach(function (k) {
        if (a[k[0]] == null) return;
        var u = httpsLink(a[k[0]]);
        if (u === null) { bad.push(k[0].replace("_", " ")); return; }
        o[k[1]] = u || null; said.push(u ? k[1] + " picture" : "no " + k[1] + " picture");
      });
      if (!Object.keys(o).length) return { ok: false, message: bad.length ? "The " + bad.join(" and ") + " must start with https://." : "Nothing to change." };
      brand.set(o);
      return { ok: true, message: "Changed the look: " + said.join(", ") + "." + (bad.length ? " Not changed: the " + bad.join(" and ") + " (must start with https://)." : "") };
    } };

  /* ---------- start ---------- */
  brand.start = function (p) {
    program = p;
    brand.apply();
    dd.on("change", function (ev) { if (!ev || ev.source !== "brand") brand.apply(); });
  };

  if (dd.menu) dd.menu.add({ id: "look", icon: "🎨", label: "Look & branding", order: 5,
    show: function () { var p = dd.getProgram && dd.getProgram(); return !!(p && p.brand !== false); },
    note: function () { return brand.isCustom() ? "Your colours and banner" : "Your colours, banner and shop name"; },
    run: function () { brand.open(); } });

  if (dd.diag) dd.diag.addSection("Look", function () {
    var L = brand.look();
    return ["Colours " + L.accent + " / " + L.accent2 + (L.custom ? " (chosen)" : " (program's own)") + " · banner picture: " + (L.banner ? "yes" + (brand.bannerFailed === L.banner ? " (DIDN'T LOAD)" : "") : "no") +
            " · shop icon: " + (L.logo ? "yes" : "no") + " · shop name: " + (L.shop ? "yes" : "no") + (L.hidden ? " · banner hidden" : "")];
  });
})();
