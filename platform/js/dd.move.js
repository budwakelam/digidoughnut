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

  /* Which copy is this? {kind: "home" | "own" | "file", title, line} */
  move.here = function () {
    if (dd.env.isHome) return { kind: "home", title: "Hosted by DigiDoughnut", line: "This is the DigiDoughnut version, at " + location.host + ". Open it on any device, nothing to upload." };
    if (dd.env.isHosted) return { kind: "own", title: "Your own copy at " + location.host, line: "This copy lives at your own web address. Open it on any device from that address." };
    return { kind: "file", title: "A file on this computer", line: "Your phone can't open a file that lives on this computer. Put it online to use it on your phone too." };
  };

  /* ---------- 🏠 Where it lives (menu item 2) ---------- */
  move.where = function () {
    var h = move.here(), t = thing();
    var sh = dd.ui.sheet('<h2>🏠 Where it lives</h2>' +
      '<p class="dd-status show ' + (h.kind === "file" ? "info" : "ok") + '"><b>' + (h.kind === "file" ? "" : "✓ ") + esc(h.title) + '</b><br>' + esc(h.line) + '</p>' +
      '<p class="dd-note">Your ' + esc(t) + ' is kept in this browser, at this address. ' +
        (syncOn() ? "Live sync is on, so it's also in your own Firebase database." : "Another copy keeps its own, until you move your " + esc(t) + " across or turn on live sync.") + '</p>' +
      '<div class="dd-btnrow">' +
        (h.kind === "file" && dd.setup ? '<button class="dd-btn" data-online>Put it online</button>' : "") +
        '<button class="dd-btn' + (h.kind === "file" ? " ghost" : "") + '" data-move>Move to another copy</button>' +
        '<button class="dd-btn ghost" data-close>Close</button></div>', { sticky: true });
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    sh.querySelector("[data-move]").addEventListener("click", function () { move.open(); });
    var on = sh.querySelector("[data-online]"); if (on) on.addEventListener("click", function () { dd.ui.closeSheet(); dd.setup.open("host"); });
    return sh;
  };

  /* ---------- Move to another copy ----------
     opts.to: "home" | "own" | "same" to open with that one picked. */
  move.open = function (opts) {
    opts = opts || {};
    var p = dd.getProgram(), t = thing(), here = move.here();
    var mine = own(), ownIsHere = mine && dd.env.isHosted && dd.env.sameAddress(mine, location.href);
    var choices = [];
    // Always offered (Oran, 2026-10-07). Before its address is set in the build, it says so.
    if (!dd.env.isHome)
      choices.push({ id: "home", title: "The DigiDoughnut version", line: dd.env.home ? "Ready to go at " + hostOf(dd.env.home) + ". Works on your phone straight away."
                                                                                : "Ready to go. Works on your phone straight away, nothing to upload." });
    if (here.kind !== "own" || (mine && !ownIsHere))
      choices.push({ id: "own", title: "My own copy", line: mine && !ownIsHere ? "At " + hostOf(mine) : "Paste its web address" });
    choices.push({ id: "same", title: "A new version at this same " + (here.kind === "file" ? "place" : "address"), line: "Nothing to move" });
    var pick = choices.filter(function (c) { return c.id === opts.to; })[0] ? opts.to : null;

    var sh = dd.ui.sheet('<h2>Move to another copy</h2>' +
      '<p class="dd-note" style="margin-top:0">Takes your ' + esc([t].concat(dd.ai && dd.ai.hasCode() ? ["free access code"] : [], syncOn() ? ["live sync"] : []).join(", ").replace(/, ([^,]*)$/, " and $1")) +
        ' with you. You can come back any time.</p>' +
      '<div class="dd-choice">' + choices.map(function (c) {
        return '<button class="dd-choice-btn" data-to="' + c.id + '"><b>' + esc(c.title) + '</b><span>' + esc(c.line) + '</span></button>';
      }).join("") + '</div>' +
      '<div data-detail></div>' +
      '<div class="dd-status" id="dd-move-status"></div>' +
      '<div class="dd-btnrow"><button class="dd-btn ghost" data-close>Close</button></div>', { sticky: true });
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    sh.querySelectorAll("[data-to]").forEach(function (b) { b.addEventListener("click", function () { choose(b.dataset.to); }); });
    if (pick) choose(pick);
    return sh;

    function choose(id) {
      sh.querySelectorAll("[data-to]").forEach(function (b) { b.classList.toggle("picked", b.dataset.to === id); });
      dd.ui.clearStatus(sh.querySelector("#dd-move-status"));
      var box = sh.querySelector("[data-detail]");
      if (id === "same") {
        box.innerHTML = '<div class="dd-move-detail"><p><b>Nothing to move.</b> ' + (here.kind === "file"
          ? "Save the new file in place of this one, keeping the same file name, and open it in this same browser. Your " + esc(t) + " should still be there. If it isn't, use <b>💾 Backup &amp; new versions</b> to carry it across."
          : "Upload the new file over the old one, keeping the same file name, so the address stays the same. Your " + esc(t) + " just stays.") + '</p>' +
          (syncOn() ? '<p class="dd-note">Live sync is on, so your ' + esc(t) + ' is also safe in your own Firebase database.</p>' : "") + '</div>';
        return;
      }
      if (id === "home" && !dd.env.home) {
        box.innerHTML = '<div class="dd-move-detail"><p><b>Almost ready.</b> The DigiDoughnut version isn\'t switched on in this file yet. ' +
          'It will be in the next update, from the same link you got this file from. Your ' + esc(t) + ' stays right here meanwhile.</p>' +
          '<p class="dd-note">Need it on your phone today? Pick <b>My own copy</b> instead.</p></div>';
        return;
      }
      var target = id === "home" ? dd.env.home : (mine && !ownIsHere ? mine : "");
      box.innerHTML = '<div class="dd-move-detail">' +
        (id === "own" && !target ? '<p>Paste the web address of your own copy:</p><input class="dd-input" id="dd-move-addr" placeholder="e.g. yourname.github.io/digidoughnut/' + esc(fileName()) + '" autocomplete="off" autocapitalize="off" spellcheck="false">' : "") +
        '<p class="dd-note" data-travels>' + esc(travels()) + '</p>' +
        '<div class="dd-btnrow"><button class="dd-btn" data-go>' + (dd.isExample() ? "Open it" : "Open it with my " + esc(t)) + '</button></div>' +
        '<p class="dd-note">It opens in a new tab. The link works for 10 minutes, once.</p></div>';
      box.querySelector("[data-go]").addEventListener("click", function () {
        var dest = target;
        if (!dest) {
          dest = dd.setup && dd.setup.cleanAddress ? dd.setup.cleanAddress(box.querySelector("#dd-move-addr").value) : null;
          if (!dest) { dd.ui.status(sh.querySelector("#dd-move-status"), "warn", "Paste the address of your own copy first.", "It starts with https:// and ends with the file name, like " + fileName() + "."); return; }
          if (dd.setup && dd.setup.ownAddress) dd.setup.ownAddress(dest);
        }
        go(dest);
      });
    }
    function travels() {
      if (dd.isExample()) return "These are example " + t + ", so they don't travel. The other copy starts with its own examples.";
      if (syncOn()) return "Live sync is on: the other copy joins your same database, so your " + t + " is there and stays in step. Anything already in that copy is combined with it.";
      return "Your " + t + " goes across in the link. If the other copy already has a different " + t + " of yours, it asks before replacing it.";
    }
    function go(dest) {
      var made = dd.pair.makeLink({ base: dest, includeCode: true, maxLink: 60000 });
      var st = sh.querySelector("#dd-move-status");
      last.opened = new Date().toLocaleTimeString() + " → " + hostOf(dest) + " · " + made.link.length + " characters" + (made.left.length ? " · data too big" : "");
      if (made.left.length) {
        // Too big for a link: say so, and offer the backup way. Still open the copy (code and sync travel).
        dd.ui.status(st, "warn", "Your " + t + " is too big to carry in a link.",
          "Download a backup here. Then, in the other copy, open the menu (top left), tap 💾 Backup & new versions, and Restore from a backup.");
        var row = document.createElement("div"); row.className = "dd-btnrow";
        row.innerHTML = '<button class="dd-btn small" data-down>⬇ Download a backup</button><button class="dd-btn small ghost" data-open>Open the other copy</button>';
        st.appendChild(row);
        row.querySelector("[data-down]").addEventListener("click", function () { dd.backup && dd.backup.download(); });
        row.querySelector("[data-open]").addEventListener("click", function () { window.open(made.link, "_blank", "noopener"); });
        return;
      }
      window.open(made.link, "_blank", "noopener");
      dd.ui.status(st, "ok", "Opened in a new tab.", "Check your " + t + " there, then bookmark that page and use it from now on. This copy stays as it is.");
    }
  };
  function fileName() {
    if (dd.setup && dd.setup.fileName) { var f = dd.setup.fileName(); if (/\.html?$/i.test(f)) return f; }
    var p = dd.getProgram(); return p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".html";
  }

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
    note: function () { return move.here().title; }, run: function () { move.where(); } });

  if (dd.diag) dd.diag.addSection("Where it lives", function () {
    return ["This copy: " + move.here().title + (dd.env.home ? " · DigiDoughnut version: " + hostOf(dd.env.home) : " · no DigiDoughnut version set"),
            "Own copy remembered: " + (own() ? hostOf(own()) : "none"),
            "Move link opened: " + last.opened + " · data received: " + last.received];
  });
})();
