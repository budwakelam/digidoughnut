/* ===== DigiDoughnut Platform · dd.move — where it lives, and moving between copies (7.2, 7.3) =====
   A buyer can have the same program in several places: the DigiDoughnut version
   (DD_BUILD.home), their own copy (GitHub, tiiny.host, their own website) or a file on their
   computer. Each place keeps its own data in that browser. They can switch at any time and take
   their data with them (Oran, 2026-10-07).

   Moving reuses the setup-carrying link the host wizards already make:
     dd.pair.makeLink({base, includeCode:true, maxLink:60000})
   code + data + live sync, after the "#", so no server sees it. Example data never travels
   (rule 10). With live sync on, the other copy joins the same database (anything already there is
   combined, never thrown away). Too big for a link: download a backup, restore it over there.

   Receiving (rule 15): a copy that already holds the buyer's own data, and it's different, asks
   "Replace what's here with the <dataLabel> from your other copy?" (Replace / Keep mine), with
   Undo after Replace. Phone pairing goes through the same question. */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var move = dd.move = {};
  var esc = function (s) { return dd.ui.esc(s); };
  var last = { opened: "-", received: "-" };
  function thing() { var p = dd.getProgram(); return (p && p.dataLabel) || "numbers"; }
  function hostOf(url) { try { var u = new URL(url); return u.host + (u.pathname.length > 1 ? u.pathname : ""); } catch (e) { return url; } }
  function syncOn() { return !!(dd.sync && dd.sync.isOn && dd.sync.isOn()); }
  function own() { return dd.setup && dd.setup.ownAddress ? dd.setup.ownAddress() : ""; }

  /* Which place is this? {kind: "home" | "own" | "file", place: one of PLACES' ids, title} */
  move.here = function () {
    if (dd.env.isHome) return { kind: "home", place: "digidoughnut", title: "The DigiDoughnut version" };
    if (dd.env.isHosted) {
      var h = location.hostname.toLowerCase();
      var place = /\.github\.io$/.test(h) ? "github" : /(^|\.)tiiny\.(site|host|co)$/.test(h) ? "tiiny" : /\.neocities\.org$/.test(h) ? "neocities" : "other";
      return { kind: "own", place: place, title: "Your own copy at " + location.host };
    }
    return { kind: "file", place: "computer", title: "A file on this computer" };
  };

  /* ---------- 🏠 Where it lives: one screen, every place, plain pros and cons ----------
     Oran, 2026-10-07: show where it lives now (highlighted), then every place it could live,
     with scales (easy to set up, time, on your phone, looks after itself) and the pros and
     cons, for someone who knows nothing. One switch: bring my data along. */
  var PLACES = {
    digidoughnut: { icon: "🍩", name: "The DigiDoughnut version", tag: "Recommended",
      what: "DigiDoughnut keeps the program online for you. Open the link and it's ready.",
      ease: 5, lasting: 5, time: "1 minute", phone: true,
      pros: ["Nothing to sign up for or upload", "Works on your phone straight away", "New versions arrive by themselves"],
      cons: ["It lives at DigiDoughnut's web address (your data still stays on your own devices)"] },
    github: { icon: "🐙", name: "GitHub", tag: "Best do-it-yourself choice",
      what: "A free GitHub account shows the file as your own web page.",
      ease: 3, lasting: 5, time: "About 10 minutes", phone: true,
      pros: ["Free, no ads, never expires", "Your own web address", "One account holds all your DigiDoughnut programs"],
      cons: ["You make a GitHub account and upload the file", "You upload new versions yourself"] },
    tiiny: { icon: "🌱", name: "tiiny.host",
      what: "A quick free page for one file.",
      ease: 4, lasting: 2, time: "About 5 minutes", phone: true,
      pros: ["Quick to set up", "Your own web address"],
      cons: ["One program per free account", "You log in every 3 months to keep it online", "A small tiiny.host banner on the page"] },
    other: { icon: "🌐", name: "My own website or another host",
      what: "Already have web hosting? Put the file there.",
      ease: 0, lasting: 0, time: "Depends on your host", phone: true,
      pros: ["Your own domain name", "You control everything"],
      cons: ["You need web hosting already", "You upload new versions yourself"] },
    neocities: { icon: "🐱", name: "Neocities",
      what: "A free page for your file.",
      ease: 4, lasting: 4, time: "About 10 minutes", phone: true,
      pros: ["Free"], cons: ["Its free plan blocks the helper"] },
    computer: { icon: "💻", name: "A file on this computer",
      what: "The file you downloaded, opened straight from this computer.",
      ease: 5, lasting: 3, time: "Nothing to do", phone: false,
      pros: ["Nothing to set up", "Nothing online"],
      cons: ["Only on this computer: your phone can't open it", "Easy to lose track of which file is which"] }
  };
  move.places = PLACES;

  function bars(label, n) {
    if (!n) return "";
    var cells = ""; for (var i = 1; i <= 5; i++) cells += '<i class="' + (i <= n ? "on" : "") + '"></i>';
    return '<span class="dd-bars"><span class="dd-bars-label">' + esc(label) + '</span><span class="dd-bars-cells" aria-label="' + n + ' out of 5">' + cells + '</span></span>';
  }
  function placeCard(id, isHere) {
    var o = PLACES[id], ownHost = id !== "digidoughnut" && id !== "computer";
    return '<div class="dd-place' + (isHere ? " here" : "") + '"' + (ownHost ? ' data-host="' + id + '"' : "") + ' data-place="' + id + '">' +
      '<div class="dd-place-top"><span class="dd-place-ico" aria-hidden="true">' + o.icon + '</span>' +
        '<span class="dd-place-title"><b class="dd-place-name">' + esc(o.name) + '</b>' +
        (isHere ? '<i class="dd-place-here">✓ You are here</i>' : o.tag ? '<i class="dd-place-tag">' + esc(o.tag) + '</i>' : "") + '</span></div>' +
      '<p class="dd-place-what">' + esc(isHere && id !== "computer" && id !== "digidoughnut" ? o.what + " Yours is at " + location.host + "." : o.what) + '</p>' +
      '<div class="dd-place-scales">' + bars("Easy to set up", o.ease) + bars("Looks after itself", o.lasting) +
        '<span class="dd-scale-text">⏱ ' + esc(o.time) + '</span><span class="dd-scale-text">' + (o.phone ? "📱 Works on your phone" : "📵 Not on your phone") + '</span></div>' +
      '<div class="dd-place-pc"><ul class="dd-pros">' + o.pros.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul>' +
        '<ul class="dd-cons">' + o.cons.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul></div>' +
      (isHere ? "" : '<div class="dd-place-act" data-act-box></div>') +
    '</div>';
  }

  move.where = function () {
    var p = dd.getProgram(), t = thing(), here = move.here(), mine = own();
    var ownHosts = (dd.setup && dd.setup.hostChoices) || ["github", "tiiny", "other"];
    var others = ["digidoughnut"].concat(ownHosts, ["computer"]).filter(function (id) { return id !== here.place && PLACES[id]; });
    if (here.place === "digidoughnut") others = others.filter(function (id) { return id !== "digidoughnut"; });
    var example = dd.isExample();
    var bring = [t].concat(dd.ai && dd.ai.hasCode() ? ["free access code"] : [], syncOn() ? ["live sync"] : []).join(", ").replace(/, ([^,]*)$/, " and $1");
    var sh = dd.ui.sheet('<h2>🏠 Where it lives</h2>' +
      '<p class="dd-note" style="margin-top:0">' + esc(p.name) + ' can live in different places. The place decides which devices can open it. You can switch any time.</p>' +
      '<h3 class="dd-sub">Where it lives now</h3>' + placeCard(here.place, true) +
      '<h3 class="dd-sub">Other places it could live</h3>' +
      '<label class="dd-check dd-bring"><input type="checkbox" id="dd-bring"' + (example ? " disabled" : " checked") + '> ' +
        (example ? "Bring my " + esc(t) + " along (what you see now are only examples, so there's nothing of yours to bring yet)" : "Bring my " + esc(bring) + " along") + '</label>' +
      others.map(function (id) { return placeCard(id, false); }).join("") +
      '<p class="dd-note">Got a newer version of the file? Put it in the same place with the same file name, and your ' + esc(t) + ' stays.</p>' +
      '<div class="dd-btnrow">' +
        (here.kind !== "file" && !dd.env.isPhone && dd.pair ? '<button class="dd-btn ghost" data-phone>📲 Send to my phone</button>' : "") +
        (here.kind !== "file" && dd.env.isPhone && !dd.env.isStandalone && dd.setup && dd.setup.showHomeScreen ? '<button class="dd-btn ghost" data-homescreen>Add to Home Screen</button>' : "") +
        '<button class="dd-btn ghost" data-close>Close</button></div>', { sticky: true });
    sh.classList.add("dd-sheet-wide");
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    var ph = sh.querySelector("[data-phone]"); if (ph) ph.addEventListener("click", function () { dd.pair.open(); });
    var hs = sh.querySelector("[data-homescreen]"); if (hs) hs.addEventListener("click", function () { dd.setup.showHomeScreen(); });
    others.forEach(function (id) { fillAction(sh, id, mine, here); });
    return sh;
  };
  move.open = function () { return move.where(); };   // older callers ("Move to another copy")

  function fillAction(sh, id, mine, here) {
    var card = sh.querySelector('[data-place="' + id + '"]'), box = card.querySelector("[data-act-box]"), t = thing();
    var bringOn = function () { var b = sh.querySelector("#dd-bring"); return !!(b && b.checked && !b.disabled); };
    var btn = function (label, cls, fn, attr) {
      var b = document.createElement("button"); b.className = "dd-btn small" + (cls ? " " + cls : ""); b.textContent = label;
      if (attr) b.setAttribute(attr, ""); b.addEventListener("click", fn); box.appendChild(b); return b;
    };
    var say = function (kind, html) { var n = card.querySelector(".dd-place-msg") || document.createElement("p"); n.className = "dd-place-msg dd-status show " + kind; n.innerHTML = html; card.appendChild(n); return n; };
    if (id === "digidoughnut") {
      btn("Use the DigiDoughnut version", "", function () {
        if (!dd.env.home) { say("info", "<b>Almost ready.</b> The DigiDoughnut version isn't switched on in this file yet. It comes in the next update, from the same link you got this file from. Your " + esc(t) + " stays right here meanwhile."); return; }
        go(dd.env.home, card);
      }, "data-act");
      return;
    }
    if (id === "computer") {
      btn("How to use the file", "ghost", function () {
        var m = say("info", "Open the program file you downloaded (often in your Downloads folder) by double-clicking it. " +
          "It keeps its own " + esc(t) + ". To take yours along, download a backup here, then in the file open the menu (top left) → 💾 Backup &amp; new versions → Restore from a backup.");
        if (!dd.isExample() && dd.backup) { var r = document.createElement("div"); r.className = "dd-btnrow"; r.innerHTML = '<button class="dd-btn small">⬇ Download a backup</button>'; r.firstChild.addEventListener("click", function () { dd.backup.download(); }); m.appendChild(r); }
      }, "data-act");
      return;
    }
    // GitHub / tiiny.host / own website / Neocities: open the copy you already have, or set one up.
    var remembered = mine && !(dd.env.isHosted && dd.env.sameAddress(mine, location.href)) && placeOf(mine) === id ? mine : "";
    if (remembered) btn("Open my copy at " + hostOf(remembered), "", function () { go(remembered, card); }, "data-act");
    var going = dd.setup && dd.setup.hostInProgress && dd.setup.hostInProgress(id);
    btn(going ? "Continue setting it up" : remembered ? "Set up a new one" : "Set it up, step by step", remembered ? "ghost" : "", function () {
      dd.setup.startHost(id);
    }, remembered ? "data-setup" : "data-act");
    if (!remembered) {
      // Already have a copy there (made on another device)? Paste its address and go.
      var have = document.createElement("button"); have.className = "dd-linkbtn"; have.textContent = "I already have one"; have.setAttribute("data-have", "");
      box.appendChild(have);
      have.addEventListener("click", function () {
        have.remove();
        var row = document.createElement("div"); row.className = "dd-copyrow";
        row.innerHTML = '<input class="dd-input" data-addr placeholder="Paste its web address" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="dd-btn small" data-open>Open it</button>';
        card.appendChild(row);
        row.querySelector("[data-open]").addEventListener("click", function () {
          var dest = dd.setup && dd.setup.cleanAddress ? dd.setup.cleanAddress(row.querySelector("[data-addr]").value) : null;
          if (!dest) { var m = card.querySelector(".dd-place-msg") || document.createElement("p"); m.className = "dd-place-msg dd-status show warn"; m.innerHTML = "<b>Paste the address first.</b> It starts with https:// and ends with the file name, like " + esc(fileName()) + "."; card.appendChild(m); return; }
          if (dd.setup && dd.setup.ownAddress) dd.setup.ownAddress(dest);
          go(dest, card);
        });
      });
    }
    if (dd.env.isPhone) { var n = document.createElement("span"); n.className = "dd-note"; n.textContent = " Best done on your computer."; box.appendChild(n); }
  }
  function placeOf(url) { try { var h = new URL(url).hostname; return /\.github\.io$/.test(h) ? "github" : /tiiny\./.test(h) ? "tiiny" : /neocities\.org$/.test(h) ? "neocities" : "other"; } catch (e) { return ""; } }

  /* Open another copy, carrying everything (or nothing, if "Bring my … along" is off). */
  function go(dest, card) {
    var sh = (card && card.closest(".dd-sheet")) || document.querySelector(".dd-sheet");
    var bringBox = sh && sh.querySelector("#dd-bring"), bare = !!(bringBox && !bringBox.checked && !bringBox.disabled);
    var made = dd.pair.makeLink({ base: dest, includeCode: true, maxLink: 60000, bare: bare }), t = thing();
    last.opened = new Date().toLocaleTimeString() + " → " + hostOf(dest) + " · " + made.link.length + " characters" + (bare ? " · nothing carried" : "") + (made.left.length ? " · data too big" : "");
    var say = function (kind, html) { if (!card) { dd.ui.toast(html.replace(/<[^>]+>/g, ""), 5000); return null; } var n = card.querySelector(".dd-place-msg") || document.createElement("p"); n.className = "dd-place-msg dd-status show " + kind; n.innerHTML = html; card.appendChild(n); return n; };
    if (made.left.length) {
      var m = say("warn", "<b>Your " + esc(t) + " is too big to carry in a link.</b> Download a backup here. Then, in the other copy, open the menu (top left) → 💾 Backup &amp; new versions → Restore from a backup.");
      if (m) {
        var row = document.createElement("div"); row.className = "dd-btnrow";
        row.innerHTML = '<button class="dd-btn small" data-down>⬇ Download a backup</button><button class="dd-btn small ghost" data-open>Open the other copy</button>';
        m.appendChild(row);
        row.querySelector("[data-down]").addEventListener("click", function () { dd.backup && dd.backup.download(); });
        row.querySelector("[data-open]").addEventListener("click", function () { window.open(made.link, "_blank", "noopener"); });
      }
      return made;
    }
    window.open(made.link, "_blank", "noopener");
    say("ok", "<b>Opened in a new tab.</b> " + (bare ? "It starts fresh there." : "Your " + esc(t) + " came along.") + " Bookmark that page and use it from now on. This copy stays as it is.");
    return made;
  }
  move.go = go;

  function fileName() {
    if (dd.setup && dd.setup.fileName) { var f = dd.setup.fileName(); if (/\.html?$/i.test(f)) return f; }
    var p = dd.getProgram(); return p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".html";
  }
  move.fileName = fileName;

  /* ---------- the receiving guard (rule 15) ----------
     Called with data that has already been upgraded and checked. Returns true when it was put in
     straight away, false when the buyer is being asked (or nothing changed). */
  move.receiveData = function (body, source) {
    var t = thing(), now = dd.getData();
    var mineReal = !dd.isExample() && JSON.stringify(now) !== JSON.stringify(dd.getProgram().emptyData());
    if (!mineReal || JSON.stringify(now) === JSON.stringify(body)) {
      last.received = new Date().toLocaleTimeString() + " · put in (" + (mineReal ? "same" : "nothing of the buyer's here") + ")";
      return dd.replaceData(body, { example: false, source: source || "move" });
    }
    last.received = new Date().toLocaleTimeString() + " · asked";
    // Wait a moment so the page has drawn before the question appears.
    setTimeout(function () { ask(body, source); }, 50);
    return false;
  };
  function ask(body, source) {
    var t = thing(), p = dd.getProgram();
    var sh = dd.ui.sheet('<h2>Replace what\'s here with the ' + esc(t) + ' from your other copy?</h2>' +
      '<p>This copy already has your own ' + esc(t) + ', and it\'s different from the one coming in. Pick which to keep here. ' +
        (syncOn() ? "Live sync is on here, so your other devices would get the change too." : "") + '</p>' +
      '<div class="dd-btnrow"><button class="dd-btn ghost" data-keep>Keep mine</button><button class="dd-btn" data-replace>Replace</button></div>' +
      '<p class="dd-note">You can undo Replace straight after.</p>',
      { sticky: true, onEscape: function () {}, onOutside: function () { dd.ui.toast("Pick Replace or Keep mine."); } });
    sh.querySelector("[data-keep]").addEventListener("click", function () {
      last.received += " → kept mine";
      dd.ui.closeSheet(); dd.ui.toast("Kept your " + t + " here. Nothing changed.", 3500);
    });
    sh.querySelector("[data-replace]").addEventListener("click", function () {
      var before = JSON.stringify(dd.getData()), wasExample = dd.isExample();
      dd.ui.closeSheet();
      if (!dd.replaceData(body, { example: false, source: source || "move" })) { dd.ui.toast("That didn't come through properly. Nothing changed.", 4000); return; }
      last.received += " → replaced";
      dd.ui.notice("moved", "Replaced with the " + t + " from your other copy.", "info", [
        { label: "Undo", onClick: function () { dd.replaceData(JSON.parse(before), { example: wasExample, source: "move-undo" }); dd.ui.clearNotice("moved"); dd.ui.toast("Put back the way it was."); last.received += " → undone"; } },
        { label: "OK", primary: true, onClick: function () { dd.ui.clearNotice("moved"); } }
      ]);
    });
  }

  if (dd.menu) dd.menu.add({ id: "where", icon: "🏠", label: "Where it lives", order: 20,
    note: function () { return "Now: " + move.here().title.charAt(0).toLowerCase() + move.here().title.slice(1); }, run: function () { move.where(); } });

  if (dd.diag) dd.diag.addSection("Where it lives", function () {
    return ["This copy: " + move.here().title + (dd.env.home ? " · DigiDoughnut version: " + hostOf(dd.env.home) : " · no DigiDoughnut version set"),
            "Own copy remembered: " + (own() ? hostOf(own()) : "none"),
            "Move link opened: " + last.opened + " · data received: " + last.received];
  });
})();
