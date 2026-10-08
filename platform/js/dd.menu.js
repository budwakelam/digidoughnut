/* ===== DigiDoughnut Platform · dd.menu — the program menu (Phase 7.1) =====
   The program's name in the header is a button, "☰ <name> ▾", top-left, in the same place in
   every product (Oran, 2026-10-07). Top-right holds the sync chip and, on computers, Penny's
   column; bottom-right holds Penny's phone button and is where hosts lay their bars.

   It opens the program's own items first, then ⚙️ Settings › (the platform's items), then Help and
   About. Each module adds its own:
     dd.menu.add({id, icon, label, order, show(), run(), note()})
       order   10 Setup & connections · 20 Where it lives · 30 Send to my phone ·
               40 Backup & new versions · 50 Privacy · 60 Help & support details · 70 About
       show()  optional; return false to leave the item out right now
       note()  optional; a short second line under the label (plain text)
   The footer links stay as a second way in. Sheets never close on a stray click (rule 9). */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var menu = dd.menu = {};
  var items = [];
  var esc = function (s) { return dd.ui.esc(s); };

  menu.add = function (item) {
    items = items.filter(function (x) { return x.id !== item.id; }).concat(item);
    var ord = function (x) { return typeof x.order === "number" ? x.order : 99; };
    items.sort(function (a, b) { return ord(a) - ord(b); });
  };
  menu.items = function () {
    return items.filter(function (it) { try { return !it.show || it.show(); } catch (e) { return false; } });
  };

  /* The header button. dd.ui.mount draws the header; this turns the name into the button. */
  menu.mount = function (program) {
    var top = document.getElementById("dd-top"); if (!top) return;
    var h1 = top.querySelector("h1"); if (!h1) return;
    h1.innerHTML = '<button class="dd-menu-btn" id="dd-menu-btn" aria-haspopup="dialog" aria-label="' + esc(program.name) + ' menu">' +
      '<span class="dd-menu-ico" aria-hidden="true">☰</span><span class="dd-menu-name">' + esc(program.name) + '</span>' +
      '<span class="dd-menu-caret" aria-hidden="true">▾</span><span class="dd-menu-dot" id="dd-menu-dot" hidden></span></button>';
    document.getElementById("dd-menu-btn").addEventListener("click", function (e) { e.stopPropagation(); menu.open(); });
    menu.refreshDot();
  };

  /* A small dot on the button when an item has news (for example "A newer version is ready"). */
  menu.refreshDot = function () {
    var dot = document.getElementById("dd-menu-dot"); if (!dot) return;
    dot.hidden = !menu.items().some(function (it) { return it.badge && it.badge(); });
  };

  /* Groups (Oran, 2026-10-08): the menu is the APP's menu first. The platform's own items are
     settings, kept one level down so each program can put its own things at the top.
       app       the program's own items (DD_PROGRAM.menu, or dd.menu.add({group:"app"}))
       settings  ⚙️ Settings › Setup & connections, Where it lives, Send to my phone, Backup, Privacy
       end       Help & support details, About (always at the bottom) */
  function groupOf(it) { return it.group || "settings"; }
  function rowHtml(it) {
    var note = ""; try { note = it.note ? it.note() || "" : ""; } catch (e) {}
    var badge = false; try { badge = !!(it.badge && it.badge()); } catch (e) {}
    return '<button class="dd-menu-item" role="menuitem" data-item="' + esc(it.id) + '">' +
      '<span class="dd-menu-item-ico" aria-hidden="true">' + (it.icon || "") + '</span>' +
      '<span class="dd-menu-item-text"><b>' + esc(it.label) + (badge ? ' <i class="dd-menu-new">New</i>' : "") + '</b>' +
      (note ? '<span>' + esc(note) + '</span>' : "") + '</span><span class="dd-menu-item-go" aria-hidden="true">›</span></button>';
  }
  function wire(sh, list) {
    sh.querySelectorAll("[data-item]").forEach(function (b) {
      b.addEventListener("click", function () {
        var it = list.filter(function (x) { return x.id === b.dataset.item; })[0]; if (!it) return;
        if (it.keepOpen) { it.run(); return; }
        dd.ui.closeSheet();
        try { it.run(dd.ctx ? dd.ctx() : null); } catch (e) { dd.errors.record("menu:" + it.id, e); dd.ui.toast("That didn't open. Reloading the page usually fixes it.", 4000); }
      });
    });
  }
  var settingsRow = { id: "settings", icon: "⚙️", label: "Settings", keepOpen: true,
    note: function () { return "Setup, where it lives, backup, privacy"; },
    badge: function () { return menu.items().some(function (it) { return groupOf(it) === "settings" && it.badge && it.badge(); }); },
    run: function () { menu.openSettings(); } };

  menu.open = function () {
    var p = dd.getProgram && dd.getProgram(), all = menu.items();
    var app = all.filter(function (it) { return groupOf(it) === "app"; });
    var end = all.filter(function (it) { return groupOf(it) === "end"; });
    var top = app.concat([settingsRow]).concat(end);
    var sh = dd.ui.sheet('<h2>' + esc(p ? p.name : "Menu") + '</h2>' +
      (app.length ? '<div class="dd-menu-list" role="menu">' + app.map(rowHtml).join("") + '</div><div class="dd-menu-sep" role="separator"></div>' : "") +
      '<div class="dd-menu-list" role="menu">' + [settingsRow].concat(end).map(rowHtml).join("") + '</div>' +
      '<div class="dd-btnrow"><button class="dd-btn ghost" data-close>Close</button></div>', { sticky: true });
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    wire(sh, top);
    return sh;
  };

  menu.openSettings = function () {
    var list = menu.items().filter(function (it) { return groupOf(it) === "settings"; });
    var sh = dd.ui.sheet('<button class="dd-linkbtn dd-menu-back" data-back>‹ Menu</button>' +
      '<h2>⚙️ Settings</h2>' +
      '<div class="dd-menu-list" role="menu">' + list.map(rowHtml).join("") + '</div>' +
      '<div class="dd-btnrow"><button class="dd-btn ghost" data-close>Close</button></div>', { sticky: true, onEscape: function () { menu.open(); } });
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    sh.querySelector("[data-back]").addEventListener("click", function () { menu.open(); });
    wire(sh, list);
    return sh;
  };

  /* A program's own menu items: DD_PROGRAM.menu = [{id, icon, label, note?, run(ctx)}], shown at the top. */
  menu.fromProgram = function (program) {
    (program.menu || []).forEach(function (it, i) {
      if (!it || !it.id || !it.label || typeof it.run !== "function") return;
      menu.add({ id: "app-" + it.id, icon: it.icon || "•", label: it.label, group: "app", order: i,
                 note: typeof it.note === "function" ? it.note : it.note ? function () { return it.note; } : null,
                 show: it.show, run: it.run });
    });
  };

  /* ---------- items that belong to no other module ---------- */
  menu.add({ id: "privacy", icon: "🔒", label: "Privacy", order: 50, group: "settings", note: function () { return "What this program connects to"; },
             run: function () { dd.ui.privacy(); } });
  menu.add({ id: "about", icon: "ℹ️", label: "About", order: 70, group: "end",
             note: function () { var p = dd.getProgram(); return p.name + " " + p.version; },
             run: function () { menu.about(); } });

  /* About: name, version, where it was built. Phase 7.4 adds "A newer version is ready". */
  menu.aboutExtras = [];   // functions returning HTML, added by other modules
  menu.about = function () {
    var p = dd.getProgram(), b = window.DD_BUILD || {};
    var extra = menu.aboutExtras.map(function (f) { try { return f() || ""; } catch (e) { return ""; } }).join("");
    var sh = dd.ui.sheet('<h2>ℹ️ About ' + esc(p.name) + '</h2>' +
      (p.tagline ? '<p>' + esc(p.tagline) + '</p>' : "") +
      '<p class="dd-about-ver"><b>Version ' + esc(p.version) + '</b><br><span class="dd-note">Made by DigiDoughnut · built ' + esc(b.built || "-") +
        ' · platform ' + esc(b.platform || "dev") + '</span></p>' + extra +
      '<div class="dd-btnrow"><button class="dd-btn ghost" data-close>Close</button></div>');
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    return sh;
  };
})();
