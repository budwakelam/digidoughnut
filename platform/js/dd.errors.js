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
    bad_code:      ["That code didn't work.", "It may have a typo or a missing piece. Copy it fresh from {company} and paste it again."],
    not_allowed:   ["That code isn't allowed to do this.", "Make a new code on {company}'s site and paste it here."],
    out_of_share:  ["You've used today's free share.", "It refills on its own. Try again later or tomorrow."],
    busy:          ["{company}'s servers are having a busy moment.", "Wait a minute and try again. This usually clears on its own."],
    timeout:       ["That took too long, so we stopped waiting.", "Tap Try again. If it keeps happening, check your internet."],
    unexpected:    ["Something unexpected happened.", "Wait a moment and try again."],
    // platform types
    storage_full:    ["This browser's storage is full, so your last change wasn't saved.", "Make a backup, then clear some space or old data."],
    storage_blocked: ["This browser isn't letting the program save.", "Private or incognito windows often block saving. Open the program in a normal window."]
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
  // Anything that looks like a code or secret is masked before it's stored.
  function scrub(s) {
    return String(s)
      .replace(/([?&](?:key|api_key|token)=)[^&\s"']+/gi, "$1[hidden]")
      .replace(/\b(AIza[0-9A-Za-z_\-]{4})[0-9A-Za-z_\-]{20,}/g, "$1…[hidden]")
      .replace(/\b((?:sk-or-|sk-ant-|sk-|gsk_|xai-)[0-9A-Za-z]{0,2})[0-9A-Za-z_\-]{12,}/g, "$1…[hidden]")
      .replace(/(Bearer\s+)\S+/gi, "$1[hidden]");
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

  // Catch anything that slips through so support can see it. The buyer sees nothing scary.
  window.addEventListener("error", function (e) { errors.record("page", (e && e.message) || "error"); });
  window.addEventListener("unhandledrejection", function (e) { errors.record("promise", (e && e.reason) || "rejected"); });
})();
