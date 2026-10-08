/* ===== DigiDoughnut Platform · dd.pair — send setup to your phone by QR =====
   The computer shows a QR code. The phone's camera opens the program's own web address with
   the setup packed into the part after "#", which browsers never send to any server
   (not even tiiny.host). The phone unpacks it once and forgets the link.

   What can travel (each module adds its own piece with dd.pair.register):
     k  the AI code            (dd.ai; on by default, with a switch to leave it out)
     d  the program's numbers  (dd.core; only while small enough to keep the QR simple)
     s/f sync details          (Phase 5, dd.sync)
   Packing, as short as possible so the QR stays simple and scans fast:
     #dd=1~<time>~<id>~k<code>~d*<base64url of JSON>
   Plain text pieces (like the code) travel as-is; anything else as base64url JSON marked "*".
   Safety: every QR has a time stamp and a one-time ID. It stops working after 10 minutes,
   and each one can be used once. Pairing from a file on the computer is refused kindly:
   the phone can't open a file that lives on the computer. */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var pair = dd.pair = {};
  var USED_KEY = "dd_pair_used_v1", LIFE_S = 600, SKEW_S = 300;
  var MAX_LINK = 900;          // above this the QR gets dense; numbers are left out instead
  var pieces = [];             // {key, label, give(opts) -> value|undefined, take(value, ctx)}
  var last = { made: null, received: null };

  pair.register = function (piece) { pieces.push(piece); };

  /* ---------- packing ---------- */
  function b64urlEncode(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function newId() {   // 6 random base-36 characters (about 2 billion possibilities)
    var b = new Uint32Array(1); crypto.getRandomValues(b);
    return ("00000" + (b[0] % 2176782336).toString(36)).slice(-6);
  }
  var PLAIN = /^[A-Za-z0-9_.:\-]+$/;   // safe after "#" without escaping, and contains no "~"
  function pack(payload) {
    var out = ["1", payload.t, payload.i];
    Object.keys(payload).forEach(function (k) {
      if (k === "v" || k === "t" || k === "i") return;
      var v = payload[k];
      out.push(k + (typeof v === "string" && PLAIN.test(v) ? v : "*" + b64urlEncode(JSON.stringify(v))));
    });
    return out.join("~");
  }
  function unpack(s) {
    var parts = s.split("~");
    if (parts[0] !== "1" || parts.length < 3) return null;
    var payload = { v: 1, t: parts[1], i: parts[2] };
    parts.slice(3).forEach(function (piece) {
      var k = piece.charAt(0), rest = piece.slice(1);
      payload[k] = rest.charAt(0) === "*" ? JSON.parse(b64urlDecode(rest.slice(1))) : rest;
    });
    return payload;
  }
  pair._unpack = unpack;
  function baseUrl() { return location.href.split("#")[0]; }

  /* Build the link. opts = {includeCode:true, base:"https://…" (default: this page),
     maxLink: characters (default: small enough for a simple QR)}.
     Returns {link, included:[keys], left:[labels]}. The Setup Center uses base + a large
     maxLink to carry everything from the file on the computer to its new web address. */
  pair.makeLink = function (opts) {
    opts = opts || {};
    var base = (opts.base || baseUrl()).split("#")[0], max = opts.maxLink || MAX_LINK;
    function link(payload) { return base + "#dd=" + pack(payload); }
    var payload = { v: 1, t: Math.floor(Date.now() / 1000).toString(36), i: newId() };
    var included = [], left = [];
    // Small, essential pieces first; the program's numbers last (they're the optional extra).
    // bare: open the other copy carrying nothing ("Bring my … along" switched off)
    if (!opts.bare) pieces.slice().sort(function (a, b) { return (a.optional ? 1 : 0) - (b.optional ? 1 : 0); }).forEach(function (p) {
      var v; try { v = p.give(opts); } catch (e) { dd.errors.record("pair.give:" + p.key, e); }
      if (v === undefined || v === null) return;
      payload[p.key] = v;
      if (p.optional && link(payload).length > max) { delete payload[p.key]; left.push(p.label); return; }
      included.push(p.key);
    });
    var out = link(payload);
    last.made = { at: new Date().toLocaleTimeString(), size: out.length, parts: included.join(",") || "none" };
    return { link: out, included: included, left: left, expiresAt: (parseInt(payload.t, 36) + LIFE_S) * 1000 };
  };

  /* ---------- QR drawing (vendored qrcode-generator, fixed cell size: never scalable:true) ---------- */
  pair.qrSvg = function (text, maxPx) {
    // Medium error correction while the QR stays small; otherwise Low, which keeps it simpler
    // (screens don't get scratched, so Low scans fine).
    var qr = qrcode(0, "M"); qr.addData(text, "Byte"); qr.make();
    if (qr.getModuleCount() > 41) { qr = qrcode(0, "L"); qr.addData(text, "Byte"); qr.make(); }
    var n = qr.getModuleCount();
    var cell = Math.max(3, Math.min(8, Math.floor((maxPx || 280) / (n + 8))));
    return { svg: qr.createSvgTag({ cellSize: cell, margin: cell * 4 }), modules: n };
  };

  /* ---------- the "Send to my phone" sheet ---------- */
  var timer = null;
  pair.open = function () {
    if (dd.env.isFile) {
      var s1 = dd.ui.sheet('<h2>Send to your phone</h2>' +
        '<p>Your phone can\'t open a file that lives on this computer. Put the program online first (setup step 3, Where it lives), then open it from its web address and tap this again.</p>' +
        '<div class="dd-btnrow"><button class="dd-btn" data-close>OK</button></div>');
      s1.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
      return;
    }
    var hasCode = dd.ai && dd.ai.hasCode();
    var sh = dd.ui.sheet('<h2>Send to your phone</h2>' +
      '<p class="dd-note" style="margin-top:0">Open your phone\'s camera and point it at this square. Tap the link that appears.</p>' +
      '<div class="dd-qr" id="dd-qr"></div>' +
      '<p class="dd-qr-timer" id="dd-qr-timer"></p>' +
      (hasCode ? '<label class="dd-check"><input type="checkbox" id="dd-qr-code" checked> Include my free access code, so the phone is ready to use</label>' +
                 '<p class="dd-note" id="dd-qr-warn">This square contains your access code. Only scan it with your own phone, and close this when you\'re done.</p>' : "") +
      '<p class="dd-note" id="dd-qr-left"></p>' +
      '<div class="dd-btnrow"><button class="dd-btn ghost" data-new>Make a new code</button><button class="dd-btn" data-close>Done</button></div>',
      { onClose: function () { clearInterval(timer); } });
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    sh.querySelector("[data-new]").addEventListener("click", draw);
    var box = sh.querySelector("#dd-qr-code");
    if (box) box.addEventListener("change", draw);
    draw();

    function draw() {
      var include = box ? box.checked : false;
      var made = pair.makeLink({ includeCode: include });
      var q = pair.qrSvg(made.link, Math.min(300, window.innerWidth - 80));
      sh.querySelector("#dd-qr").innerHTML = q.svg;
      var warn = sh.querySelector("#dd-qr-warn"); if (warn) warn.style.display = include ? "" : "none";
      sh.querySelector("#dd-qr-left").textContent = pair.whatTravels(made);
      clearInterval(timer);
      var tick = function () {
        var s = Math.round((made.expiresAt - Date.now()) / 1000), el = sh.querySelector("#dd-qr-timer");
        if (!el) { clearInterval(timer); return; }
        if (s <= 0) {
          clearInterval(timer);
          sh.querySelector("#dd-qr").innerHTML = '<p class="dd-qr-expired">This code expired. Tap <b>Make a new code</b>.</p>';
          el.textContent = "";
          return;
        }
        el.textContent = "Works for " + Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60) + " more, one phone only.";
      };
      tick(); timer = setInterval(tick, 1000);
    }
  };

  /* One plain sentence: what this square carries, and what stays behind and why.
     Oran (2026-10-07): buyers expect their numbers to come along, so always say. */
  pair.whatTravels = function (made) {
    var p = dd.getProgram && dd.getProgram(), thing = (p && p.dataLabel) || "numbers";
    var parts = [], code = made.included.indexOf("k") >= 0, data = made.included.indexOf("d") >= 0;
    var synced = made.included.indexOf("s") >= 0;
    if (code) parts.push("your access code");
    if (data) parts.push("your " + thing);
    if (synced) parts.push("live sync");
    var says = parts.length ? "This brings " + parts.join(" and ") + " to your phone. " : "";
    if (synced && !(dd.isExample && dd.isExample())) says += "Your " + thing + " comes across through live sync, and stays in step from then on.";
    else if (!data && dd.isExample && dd.isExample()) says += "Example data doesn't travel: once you start your own " + thing + ", it will come along too.";
    else if (made.left.length) says += "Your " + thing + " can't fit in one square, so it will stay on this computer for now. Keeping devices in step (setup step 4) will move it.";
    else if (!data) says += "Your " + thing + " will stay on this computer.";
    return says.trim();
  };

  /* ---------- the phone side: unpack once, then forget the link ---------- */
  pair.receive = function () {
    var m = location.hash.match(/[#&]dd=([^&]+)/);
    if (!m) return null;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}   // never leave the code in the address bar
    var payload;
    try { payload = unpack(decodeURIComponent(m[1])); if (!payload) throw new Error("bad"); } catch (e) {
      dd.errors.record("pair.receive", "unreadable pairing link");
      dd.ui.notice("pair", "That pairing link didn't come through completely. Make a new code on your computer and scan it again.", "warn");
      return { ok: false, why: "unreadable" };
    }
    if (!payload || payload.v !== 1) return { ok: false, why: "version" };
    var made = parseInt(payload.t, 36), now = Date.now() / 1000;
    if (!(made > 0) || now - made > LIFE_S || made - now > SKEW_S) {
      dd.ui.notice("pair", "This pairing code expired. Make a new one on your computer and scan again.", "warn");
      last.received = { at: new Date().toLocaleTimeString(), result: "expired" };
      return { ok: false, why: "expired" };
    }
    var used = dd.store.getJSON(USED_KEY) || [];
    if (used.indexOf(payload.i) >= 0) {
      dd.ui.notice("pair", "This pairing code was already used on this phone. Make a new one on your computer if you need to send again.", "warn");
      last.received = { at: new Date().toLocaleTimeString(), result: "already used" };
      return { ok: false, why: "used" };
    }
    dd.store.setJSON(USED_KEY, used.concat(payload.i).slice(-30));
    var got = [];
    pieces.forEach(function (p) {
      if (!(p.key in payload)) return;
      try { if (p.take(payload[p.key]) !== false && !p.hidden) got.push(p.label); } catch (e) { dd.errors.record("pair.take:" + p.key, e); }
    });
    last.received = { at: new Date().toLocaleTimeString(), result: got.length ? "got " + got.join(", ") : "nothing new" };
    dd.ui.clearNotice("pair");
    if (got.length) dd.ui.toast("Your " + got.join(" and ") + " came across from your computer.", 4000);
    dd.emit("pair:received", { got: got });
    return { ok: true, got: got };
  };

  // Scanning again while the program is already open in that tab only changes the part after
  // "#", which doesn't reload the page: catch that too.
  window.addEventListener("hashchange", function () { if (/[#&]dd=/.test(location.hash) && dd.getProgram && dd.getProgram()) pair.receive(); });

  if (dd.menu) dd.menu.add({ id: "phone", icon: "📲", label: "Send to my phone", order: 30,
    show: function () { return !dd.env.isPhone; },
    note: function () { return dd.env.isFile ? "Needs setup step 3 first" : "Scan a square with your phone's camera"; },
    run: function () { pair.open(); } });

  if (dd.diag) dd.diag.addSection("Phone pairing", function () {
    return ["Last code made: " + (last.made ? last.made.at + " · " + last.made.size + " characters · carried " + last.made.parts : "none this visit"),
            "Last code received: " + (last.received ? last.received.at + " · " + last.received.result : "none this visit")];
  });
})();
