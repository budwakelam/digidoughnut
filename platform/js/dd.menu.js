/* ===== DigiDoughnut Platform · dd.menu — the program menu (Phase 7.1) =====
   The program's name in the header is a button, "☰ <name> ▾", top-left, in the same place in
   every product (Oran, 2026-10-07). Top-right holds the sync chip and, on computers, Penny's
   column; bottom-right holds Penny's phone button and is where hosts lay their bars.

   It opens a sheet of items in a fixed order. Each module adds its own:
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
    items.sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
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

  menu.open = function () {
    var p = dd.getProgram && dd.getProgram();
    var list = menu.items();
    var sh = dd.ui.sheet('<h2>' + esc(p ? p.name : "Menu") + '</h2>' +
      '<div class="dd-menu-list" role="menu">' + list.map(function (it) {
        var note = ""; try { note = it.note ? it.note() || "" : ""; } catch (e) {}
        var badge = false; try { badge = !!(it.badge && it.badge()); } catch (e) {}
        return '<button class="dd-menu-item" role="menuitem" data-item="' + esc(it.id) + '">' +
          '<span class="dd-menu-item-ico" aria-hidden="true">' + (it.icon || "") + '</span>' +
          '<span class="dd-menu-item-text"><b>' + esc(it.label) + (badge ? ' <i class="dd-menu-new">New</i>' : "") + '</b>' +
          (note ? '<span>' + esc(note) + '</span>' : "") + '</span><span class="dd-menu-item-go" aria-hidden="true">›</span></button>';
      }).join("") + '</div>' +
      '<div class="dd-btnrow"><button class="dd-btn ghost" data-close>Close</button></div>', { sticky: true });
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    sh.querySelectorAll("[data-item]").forEach(function (b) {
      b.addEventListener("click", function () {
        var it = items.filter(function (x) { return x.id === b.dataset.item; })[0]; if (!it) return;
        dd.ui.closeSheet();
        try { it.run(); } catch (e) { dd.errors.record("menu:" + it.id, e); dd.ui.toast("That didn't open. Reloading the page usually fixes it.", 4000); }
      });
    });
    return sh;
  };

  /* ---------- items that belong to no other module ---------- */
  menu.add({ id: "privacy", icon: "🔒", label: "Privacy", order: 50, note: function () { return "What this program connects to"; },
             run: function () { dd.ui.privacy(); } });
  menu.add({ id: "about", icon: "ℹ️", label: "About", order: 70,
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
