/* ===== DigiDoughnut Platform · dd.errors =====
   Every failure the buyer could see is one of a few named types with one friendly message.
   Raw technical detail is recorded for the support diagnostic only, with codes masked.
   RULE: buyer-facing text never contains provider wording, JSON, status codes or jargon. */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var errors = dd.errors = {};

  /* {company} is filled in with the AI company's friendly name, e.g. "Google". */
  var TYPES = {
    // the seven AI error types (plan, "AI connections")
    offline:       ["You're not connected to the internet.", "Check your Wi-Fi or data, then try again."],
    // The website hosting the page forbids talking to other websites (e.g. Neocities' free plan).
    host_blocked:  ["The website hosting this page won't let the helper reach {company}.", "Open the program from a different web address (see setup step 3, Where it lives), or contact DigiDoughnut and we'll help."],
    bad_code:      ["That code didn't work.", "It may have a typo or a missing piece. Copy it fresh from {company} and paste it again."],
    not_allowed:   ["That code isn't allowed to do this.", "Make a new code on {company}'s site and paste it here."],
    out_of_share:  ["You've used today's free share.", "It refills on its own. Try again later or tomorrow."],
    busy:          ["{company}'s servers are having a busy moment.", "Wait a minute and try again. This usually clears on its own."],
    timeout:       ["That took too long, so we stopped waiting.", "Tap Try again. If it keeps happening, check your internet."],
    unexpected:    ["Something unexpected happened.", "Wait a moment and try again."],
    // platform types
    storage_full:    ["This browser's storage is full, so your last change wasn't saved.", "Make a backup, then clear some space or old data."],
    storage_blocked: ["This browser isn't letting the program save.", "Private or incognito windows often block saving. Open the program in a normal window."],
    // live sync (Phase 5): the buyer's own Firebase project
    sync_config:   ["That Firebase setup code didn't work.", "Copy the whole firebaseConfig box again from Firebase (Project settings, Your apps) and paste it in."],
    sync_auth:     ["Firebase didn't let this program sign in.", "In Firebase, open Authentication, then Sign-in method, and switch on Anonymous. Then try again."],
    sync_rules:    ["Your Firebase database said no.", "Open the sync setup again and redo the step where you paste the rules, then tap Publish."],
    sync_offline:  ["Can't reach your Firebase database right now.", "Check your internet. Your changes are kept on this device and go across when it's back."],
    sync_newer:    ["Your other device has a newer version of this program.", "Put the newer file on this device too, then open it from the same address."],
    sync_moved:    ["This device's live sync address was retired on your other device.", "Open the program on that device and use Send to my phone again to get back in step."],
    sync_file:     ["Live sync needs the program to be online.", "Put it online first (setup step 3, Where it lives), then open it from its web address and turn on sync there."],
    backup_bad:    ["That file didn't look like a backup from this program.", "Choose a file that ends in .json and was made with the Download a backup button."]
  };

  errors.types = Object.keys(TYPES);

  /* -> {type, title, help} in plain words */
  errors.friendly = function (type, vars) {
    var t = TYPES[type] || TYPES.unexpected;
    var company = (vars && vars.company) || "the AI company";
    function fill(s) { return s.replace(/\{company\}/g, company).replace(/^the AI company's/, "The AI company's"); }
    return { type: TYPES[type] ? type : "unexpected", title: fill(t[0]), help: fill(t[1]) };
  };

  /* Generic first guess from an HTTP status or a thrown error. AI adapters (Phase 2) refine
     this with the provider's own error reason. A 400 is NOT "bad code": it usually means a bug
     on our side, so it maps to "unexpected" (fixes POC problem #6). */
  errors.classify = function (info) {
    info = info || {};
    var name = info.name || (info.error && info.error.name);
    if (name === "AbortError" || name === "TimeoutError") return "timeout";
    if (navigator.onLine === false) return "offline";
    var s = info.status;
    if (s === 0 || name === "TypeError") return "offline";      // fetch() network failure
    if (s === 401) return "bad_code";
    if (s === 403) return "not_allowed";
    if (s === 429) return "out_of_share";
    if (s >= 500 && s <= 599) return "busy";
    return "unexpected";
  };

  /* Show a friendly message in a status box. kind defaults to "err". */
  errors.show = function (el, type, vars, kind) {
    var f = errors.friendly(type, vars);
    dd.ui.status(el, kind || "err", f.title, f.help);
    return f;
  };

  /* ---------- raw detail for support only ---------- */
  var log = [];
  /* Anything that looks like a code or secret is masked before it's stored or shown.
     Three layers, so it never depends on one company's code format:
       1. the buyer's actual saved codes, wherever they appear (modules register them below);
       2. any long run of letters and digits that mixes upper case, lower case and digits:
          real codes from every company look like that, while model names, dates, addresses
          and messages don't;
       3. known code formats and the usual places codes travel (key=, Bearer, x-api-key,
          the "k" piece of a phone-pairing link), as a backstop. */
  var secretSources = [];
  errors.addSecrets = function (fn) { secretSources.push(fn); };
  function knownSecrets() {
    var out = [];
    secretSources.forEach(function (fn) { try { (fn() || []).forEach(function (s) { if (s && String(s).length >= 8) out.push(String(s)); }); } catch (e) {} });
    return out.sort(function (a, b) { return b.length - a.length; });
  }
  function keep4(m) { return m.slice(0, 4) + "…[hidden]"; }
  function scrub(s) {
    s = String(s);
    knownSecrets().forEach(function (code) { s = s.split(code).join(keep4(code)); });
    return s
      .replace(/([?&](?:key|api_?key|token|access_token)=)[^&\s"']+/gi, "$1[hidden]")
      .replace(/(Bearer\s+)[^\s"',;]{8,}/gi, "$1[hidden]")
      .replace(/((?:x-api-key|x-goog-api-key|api_?key|apikey)["']?\s*[:=]\s*["']?)[^\s"',;]{8,}/gi, "$1[hidden]")
      .replace(/([#&~]dd=1~[^~\s]*~[^~\s]*(?:~[^~\s]*)*?~k)[^~\s"']+/g, "$1[hidden]")
      .replace(/\b(?:AQ\.|AIza|sk-|gsk_|xai-|pk-|or-)[0-9A-Za-z_.\-]{12,}/g, keep4)
      .replace(/[0-9A-Za-z_.\-]{24,}/g, function (m) {
        return /[a-z]/.test(m) && /[A-Z]/.test(m) && /[0-9]/.test(m) ? keep4(m) : m;
      });
  }
  errors.scrub = scrub;

  errors.record = function (where, detail) {
    var text = detail instanceof Error ? (detail.name + ": " + detail.message) :
               (typeof detail === "object" && detail !== null) ? safeJson(detail) : String(detail);
    log.unshift({ when: new Date().toLocaleTimeString(), where: String(where), detail: scrub(text).slice(0, 600) });
    if (log.length > 10) log.length = 10;
  };
  errors.recent = function () { return log.slice(); };
  function safeJson(o) { try { return JSON.stringify(o); } catch (e) { return String(o); } }

  /* Pages can be blocked from talking to other websites by the site that hosts them (a
     "content security policy"). The browser then reports it like a dropped connection, so we
     listen for the browser's own notice and tell the two apart. */
  var violations = [];
  errors.blockedRecently = function (url, withinMs) {
    var origin; try { origin = new URL(url).origin; } catch (e) { return false; }
    var since = Date.now() - (withinMs || 5000);
    return violations.some(function (v) { return v.at >= since && v.origin === origin; });
  };
  errors.blockedList = function () { return violations.slice(0, 5); };
  document.addEventListener("securitypolicyviolation", function (e) {
    var origin = ""; try { origin = new URL(e.blockedURI).origin; } catch (x) { origin = String(e.blockedURI || ""); }
    violations.unshift({ at: Date.now(), origin: origin, directive: e.effectiveDirective || e.violatedDirective || "" });
    if (violations.length > 20) violations.length = 20;
    errors.record("page security rule", "this website blocks " + origin + " (" + (e.effectiveDirective || "") + ")");
  });

  // Catch anything that slips through so support can see it. The buyer sees nothing scary.
  window.addEventListener("error", function (e) { errors.record("page", (e && e.message) || "error"); });
  window.addEventListener("unhandledrejection", function (e) { errors.record("promise", (e && e.reason) || "rejected"); });
})();
