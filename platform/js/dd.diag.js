/* ===== DigiDoughnut Platform · dd.diag =====
   Hidden support tool. Triple-click (or triple-tap) the footer to open a report that support
   can read from one screenshot, with a Copy button. Codes and keys are never shown.
   Other modules add their own section: dd.diag.addSection("Sync", function () { return ["State: on", ...]; }) */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var diag = dd.diag = {};
  var sections = [];

  diag.addSection = function (title, fn) { sections.push({ title: title, fn: fn }); };

  function core() {
    var p = dd.getProgram && dd.getProgram();
    var b = window.DD_BUILD || {};
    var e = dd.env || {};
    var out = [];
    out.push("--- Program ---");
    out.push((p ? p.name + " " + p.version + " (data v" + p.schemaVersion + ")" : "not started") +
             " · platform " + (b.platform || "dev") + " · built " + (b.built || "-") + " " + (b.commit || ""));
    out.push("--- Page ---");
    out.push((e.isFile ? "Opened from a file on this computer" : "Hosted at " + location.host) +
             (e.isStandalone ? " · Home Screen app" : " · browser tab"));
    out.push("--- Device ---");
    out.push((e.isIOS ? "iPhone/iPad" : e.isAndroid ? "Android" : e.isPhone ? "phone" : "computer") +
             " · screen " + screen.width + "×" + screen.height + " · " + (navigator.onLine ? "online" : "offline"));
    out.push(navigator.userAgent);
    out.push("--- Storage ---");
    out.push("Saving works: " + (dd.store.available() ? "yes" : "NO") +
             " · keep-storage request: " + dd.store.persisted +
             (p ? " · data " + dd.store.dataBytes(p.id) + " bytes" + (dd.isExample() ? " (example)" : "") : ""));
    if (p && dd.store.get(dd.store.programKey(p.id, "data_recovery")) != null) out.push("A recovery copy of older data is saved on this device.");
    var blocked = dd.errors.blockedList ? dd.errors.blockedList() : [];
    if (blocked.length) out.push("This website BLOCKS outside connections: " + blocked.map(function (v) { return v.origin; }).filter(function (o, i, a) { return a.indexOf(o) === i; }).join(", "));
    out.push("--- Last problems (newest first) ---");
    var log = dd.errors.recent();
    if (!log.length) out.push("No problems recorded. Everything's talking fine.");
    log.forEach(function (r) { out.push(r.when + " · " + r.where + " · " + r.detail); });
    return out;
  }

  diag.text = function () {
    var lines = core();
    sections.forEach(function (s) {
      lines.push("--- " + s.title + " ---");
      try { lines = lines.concat(s.fn()); } catch (e) { lines.push("(couldn't read: " + e.message + ")"); }
    });
    return dd.errors.scrub(lines.join("\n"));
  };

  diag.open = function () {
    var text = diag.text();
    var sh = dd.ui.sheet('<h2>Support details</h2>' +
      '<p class="dd-note">If DigiDoughnut support asked for this, take a screenshot or tap Copy and paste it into your message.</p>' +
      '<pre id="dd-diag-text"></pre>' +
      '<div class="dd-btnrow"><button class="dd-btn" data-copy>Copy</button><button class="dd-btn ghost" data-close>Close</button></div>');
    sh.querySelector("#dd-diag-text").textContent = text;
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    sh.querySelector("[data-copy]").addEventListener("click", function () {
      copyText(text).then(function (ok) { dd.ui.toast(ok ? "Copied." : "Couldn't copy. A screenshot works too."); });
    });
  };

  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(function () { return true; }, fallback);
    return Promise.resolve(fallback());
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove(); return ok;
    }
  }

  /* Three clicks/taps on the footer within 600 ms. */
  var attached = false;
  diag.attach = function () {
    if (attached) return;
    var foot = document.getElementById("dd-footer"); if (!foot) return;
    if (!foot.textContent.trim()) foot.innerHTML = "<p>Made with care by DigiDoughnut</p>";
    attached = true;
    var n = 0, t = null;
    foot.addEventListener("click", function () {
      n++; clearTimeout(t); t = setTimeout(function () { n = 0; }, 600);
      if (n >= 3) { n = 0; diag.open(); }
    });
  };
})();
