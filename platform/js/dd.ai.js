/* ===== DigiDoughnut Platform · dd.ai =====
   The AI connection layer. Programs never call an AI company directly: they call
   dd.ai.chat() / dd.ai.connect(), and this module picks the code, the model and the adapter.

   - Provider registry: each company is a small data entry. Launch lineup: Google only
     (Oran, 2026-10-06). Adding a company later = a registry entry (+ an adapter if it speaks
     a new dialect). API addresses live HERE, in the program, never in the noticeboard file.
   - Neutral tools: programs declare tools once ({name, description, params}); the adapter
     writes the company's schema. Nobody hand-writes Gemini schemas, so the old
     "required goes inside parameters" bug can't come back.
   - Hard limits: 30 s per request, 60 s and 5 tool rounds per turn, Stop at any time.
     The endless "thinking…" can't happen.
   - Every failure maps to one of dd.errors' seven friendly types.

   Facts below were checked against Google's docs on 2026-10-06 (models, free tier, errors).
   The buyer never sees a model name; the diagnostic does. */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var ai = dd.ai = {};

  // request: one model, when it's the last one left · perModel: one model while others remain
  // turn: everything the helper does for one message · rounds: tool round-trips per message
  ai.limits = { request: 30000, perModel: 12000, turn: 90000, rounds: 5 };   // tests shrink these
  var CONN_KEY = "dd_ai_connections_v1", MODELS_KEY = "dd_ai_models_v1", LEGACY_KEY = "dd_gemini_key_v1";
  var RECHECK_MS = 7 * 24 * 3600 * 1000;
  var BUSY_MS = 10 * 60 * 1000;   // a model that just failed is tried last for 10 minutes

  /* ---------- provider registry ---------- */
  ai.providers = {
    google: {
      id: "google", label: "Google", adapter: "gemini",
      // "AQ." = auth keys, the only kind AI Studio creates since 2026-05-28; "AIza" = older
      // standard keys, which Google is retiring (rejected from Sept 2026 per Google's notice).
      codePattern: /^(AQ\.[0-9A-Za-z_.\-]{20,}|AIza[0-9A-Za-z_\-]{30,})$/,
      getCodeUrl: "https://aistudio.google.com/apikey",   // overridable via noticeboard helpLinks.getCode_google
      base: "https://generativelanguage.googleapis.com/v1beta",
      free: true,
      // Model picking hints: never shown to the buyer.
      exclude: /(tts|live|audio|transcri|image|banana|embed|robotics|veo|lyria|imagen|research|aqa|gemma|computer|learnlm|thinking-exp|antigravity|customtools)/i,
      privacyNote: "Google may use what you send through its free plan to improve its products, and people at Google may read it. Don't put anything private in your messages to the helper."
    }
  };

  ai.defaultProvider = "google";   // launch lineup: Google only

  /* The "get a free code" page for a company (noticeboard can update it). */
  ai.getCodeLink = function (id) {
    var p = ai.providers[id || "google"];
    return dd.notes ? dd.notes.link("getCode_" + p.id, p.getCodeUrl) : p.getCodeUrl;
  };

  /* Which company does a pasted code belong to? Returns a provider id or null. */
  ai.detectProvider = function (code) {
    code = String(code || "").trim();
    var hints = (dd.notes && dd.notes.get("codePatterns")) || {};
    for (var id in ai.providers) {
      var p = ai.providers[id];
      var re = p.codePattern;
      if (hints[id]) try { re = new RegExp(hints[id]); } catch (e) {}
      if (re.test(code)) return id;
    }
    return null;
  };

  /* Tidy what people paste: stray spaces, quotes, "key=" prefixes, line breaks. */
  ai.cleanCode = function (raw) {
    return String(raw || "").replace(/[\s​-‍﻿]+/g, "").replace(/^["'`]+|["'`]+$/g, "").replace(/^(?:key|api_?key)=/i, "");
  };

  /* ---------- saved connections ----------
     dd_ai_connections_v1 = { main: {provider, code, savedAt}, backup: null }
     Shared by every program on the same web address. The code sits in this browser's storage,
     which is NOT encrypted; we never claim it is. */
  function loadConns() {
    var c = dd.store.getJSON(CONN_KEY);
    if (!c || typeof c !== "object") c = { main: null, backup: null };
    // Profit Coach POC kept a bare Gemini key: move it across once.
    if (!c.main) {
      var legacy = dd.store.get(LEGACY_KEY);
      if (legacy) {
        c.main = { provider: "google", code: legacy, savedAt: new Date().toISOString(), migrated: true };
        if (dd.store.setJSON(CONN_KEY, c).ok) { dd.store.remove(LEGACY_KEY); dd.store.remove("dd_gemini_model_v1"); }
      }
    }
    return c;
  }
  ai.hasCode = function () { var c = loadConns(); return !!(c.main && c.main.code); };
  ai.connection = function () { var c = loadConns().main; return c ? { provider: c.provider, label: ai.providers[c.provider] ? ai.providers[c.provider].label : c.provider, hint: mask(c.code) } : null; };
  ai.forget = function () {
    dd.store.remove(CONN_KEY); dd.store.remove(MODELS_KEY); dd.store.remove(LEGACY_KEY);
    dd.emit("ai:changed", { connected: false });
  };
  function mask(code) { return code && code.length > 4 ? "…" + code.slice(-4) : ""; }

  /* ---------- model cache ---------- */
  function models() { return dd.store.getJSON(MODELS_KEY) || {}; }
  function saveModels(m) { dd.store.setJSON(MODELS_KEY, m); }

  /* Rank model ids: stable Flash first, newest first, then Flash-Lite, then previews; Pro last
     (no free tier as of 2026-10-06). Noticeboard hints can prefer or avoid specific ids. */
  ai.rankModels = function (provider, ids) {
    var p = ai.providers[provider];
    var hints = (dd.notes && dd.notes.get("modelHints") || {})[provider] || {};
    var avoid = hints.avoid || [], prefer = hints.prefer || [];
    function ver(id) { var m = id.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; }
    function score(id) {
      var s = 0;
      if (prefer.indexOf(id) >= 0) s += 1000;
      if (/flash/i.test(id) && !/lite/i.test(id)) s += 300;
      else if (/flash-?lite/i.test(id)) s += 200;
      else if (/pro/i.test(id)) s += 50;
      if (/preview|exp|latest/i.test(id)) s -= 150;
      return s + ver(id);
    }
    var ranked = ids.filter(function (id) { return !p.exclude.test(id) && avoid.indexOf(id) < 0; })
                    .sort(function (a, b) { return score(b) - score(a); });
    // Alternate Flash and Flash-Lite. When Google overloads one family ("high demand", seen
    // on 3.6-3.8 Flash in Sept-Oct 2026) the other usually still answers, so the fallback
    // after the first busy model should be a Flash-Lite, not the next Flash.
    var flash = ranked.filter(function (id) { return /flash/i.test(id) && !/lite/i.test(id) && prefer.indexOf(id) < 0; });
    var lite = ranked.filter(function (id) { return /flash-?lite/i.test(id) && prefer.indexOf(id) < 0; });
    var head = ranked.filter(function (id) { return prefer.indexOf(id) >= 0; });
    var rest = ranked.filter(function (id) { return head.indexOf(id) < 0 && flash.indexOf(id) < 0 && lite.indexOf(id) < 0; });
    var mixed = head.slice();
    for (var i = 0; i < Math.max(flash.length, lite.length); i++) {
      if (flash[i]) mixed.push(flash[i]);
      if (lite[i]) mixed.push(lite[i]);
    }
    return mixed.concat(rest);
  };

  /* ---------- low-level request with timeout + Stop ---------- */
  var current = null;   // the AbortController of the request in flight
  ai.stop = function () { stopped = true; if (current) try { current.abort(); } catch (e) {} };
  var stopped = false;

  /* Test drills (AI test page only): while ai.drill is set, every request behaves as if
     Google ran out of free share, went silent, or the internet dropped. The page clears it. */
  ai.drill = null;
  function drilled(ms, ctl) {
    var d = ai.drill;
    if (d === "offline") return Promise.resolve({ status: 0, network: true, error: "drill: offline" });
    if (d === "out_of_share") return Promise.resolve({ status: 429, ok: false, text: "", body: { error: { code: 429, status: "RESOURCE_EXHAUSTED",
      message: "drill: quota exceeded", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } } });
    if (d === "timeout") return new Promise(function (resolve) {
      var t = setTimeout(function () { resolve({ status: -1, timeout: true }); }, ms);
      ctl.signal.addEventListener("abort", function () { clearTimeout(t); resolve({ status: -1, stopped: true }); });
    });
    return null;
  }

  /* Timing log for support: the last 8 requests, newest first. No codes, no content. */
  var reqLog = [];
  ai.requestLog = function () { return reqLog.slice(); };
  function logStart(url) {
    var what = /\/models\?/.test(url) || /\/models$/.test(url.split("?")[0]) ? "list" : "send";
    var m = url.match(/\/models\/([^:?]+):/);
    var entry = { at: new Date().toLocaleTimeString(), what: what, model: m ? decodeURIComponent(m[1]) : "", secs: "…", outcome: "waiting for Google" };
    reqLog.unshift(entry);
    if (reqLog.length > 8) reqLog.length = 8;
    return entry;
  }
  function logRequest(url, started, r, entry) {
    var m = url.match(/\/models\/([^:?]+):/), what = entry.what;
    entry.outcome = r.timeout ? "TIMED OUT" : r.stopped ? "stopped" : r.network ? "no connection" : String(r.status);
    entry.secs = ((Date.now() - started) / 1000).toFixed(1);
    if (r.timeout) dd.errors.record("ai " + what + (m ? " " + decodeURIComponent(m[1]) : ""), "no answer within " + ((Date.now() - started) / 1000).toFixed(0) + " s");
  }

  function request(url, opts, ms) {
    var started = Date.now(), entry = logStart(url);
    var ctl = new AbortController(); current = ctl;
    var d = ai.drill && drilled(ms, ctl);
    if (d) return d.then(function (r) { logRequest(url, started, r, entry); return r; }).finally(function () { if (current === ctl) current = null; });
    var timer = setTimeout(function () { ctl.timedOut = true; ctl.abort(); }, ms);
    opts.signal = ctl.signal;
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (t) {
        var body = null; try { body = JSON.parse(t); } catch (e) {}
        return { status: res.status, ok: res.ok, body: body, text: t, headers: res.headers };
      });
    }).catch(function (e) {
      if (ctl.timedOut) return { status: -1, timeout: true };
      if (e && e.name === "AbortError") return { status: -1, stopped: true };
      return { status: 0, network: true, error: String(e && e.message || e) };
    }).then(function (r) { logRequest(url, started, r, entry); return r; })
      .finally(function () { clearTimeout(timer); if (current === ctl) current = null; });
  }

  /* ---------- the Gemini adapter ---------- */
  var adapters = ai.adapters = {};
  adapters.gemini = {
    headers: function (code) { return { "Content-Type": "application/json", "x-goog-api-key": code }; },

    listModels: function (p, code) {
      var all = [];
      function page(token) {
        var url = p.base + "/models?pageSize=200" + (token ? "&pageToken=" + encodeURIComponent(token) : "");
        return request(url, { method: "GET", headers: adapters.gemini.headers(code) }, ai.limits.request).then(function (r) {
          if (!r.ok) throw adapters.gemini.problem(r, "list");
          ((r.body && r.body.models) || []).forEach(function (m) {
            if ((m.supportedGenerationMethods || []).indexOf("generateContent") >= 0) all.push(String(m.name).replace(/^models\//, ""));
          });
          var next = r.body && r.body.nextPageToken;
          return next && all.length < 2000 ? page(next) : all;
        });
      }
      return page(null);
    },

    /* Neutral tools -> Gemini functionDeclarations. `required` goes INSIDE `parameters`. */
    tools: function (tools) {
      if (!tools || !tools.length) return undefined;
      return [{ functionDeclarations: tools.map(function (t) {
        var props = {}, required = [];
        Object.keys(t.params || {}).forEach(function (k) {
          var s = t.params[k], o = { type: s.type || "string" };
          if (s.description) o.description = s.description;
          if (s.enum) o.enum = s.enum;
          if (s.type === "array") o.items = s.items || { type: "string" };
          if (s.type === "object" && s.properties) o.properties = s.properties;
          props[k] = o;
          if (!s.optional) required.push(k);
        });
        var decl = { name: t.name, description: t.description || t.name, parameters: { type: "object", properties: props } };
        if (required.length) decl.parameters.required = required;
        return decl;
      }) }];
    },

    /* Neutral history -> Gemini contents. Model turns are sent back exactly as Google sent
       them (raw parts), which carries any thought signatures newer models require. */
    contents: function (history) {
      var out = [];
      history.forEach(function (h) {
        if (h.role === "user") out.push({ role: "user", parts: [{ text: h.text }] });
        else if (h.role === "model") out.push({ role: "model", parts: (h.raw && h.raw.provider === "gemini") ? h.raw.parts : [{ text: h.text || "" }] });
        else if (h.role === "tool") out.push({ role: "user", parts: h.results.map(function (r) {
          var fr = { name: r.name, response: { result: r.result } };
          if (r.id) fr.id = r.id;   // newer models tag each call with an id; echo it back
          return { functionResponse: fr };
        }) });
      });
      return out;
    },

    send: function (p, code, model, req) {
      var body = { contents: adapters.gemini.contents(req.history) };
      if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
      var tools = adapters.gemini.tools(req.tools);
      if (tools) body.tools = tools;
      if (req.forceTool) body.toolConfig = { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [req.forceTool] } };
      return request(p.base + "/models/" + encodeURIComponent(model) + ":generateContent",
        { method: "POST", headers: adapters.gemini.headers(code), body: JSON.stringify(body) }, req.ms).then(function (r) {
        if (!r.ok) throw adapters.gemini.problem(r, "send");
        var cand = r.body && r.body.candidates && r.body.candidates[0];
        var parts = (cand && cand.content && cand.content.parts) || [];
        var text = "", calls = [];
        parts.forEach(function (pt, i) {
          if (pt.text && !pt.thought) text += pt.text;
          if (pt.functionCall) calls.push({ id: pt.functionCall.id || null, name: pt.functionCall.name, args: pt.functionCall.args || {} });
        });
        if (!parts.length && r.body && r.body.promptFeedback && r.body.promptFeedback.blockReason) text = "";
        return { text: text.trim(), calls: calls, raw: { provider: "gemini", parts: parts.length ? parts : [{ text: "" }] },
                 finish: cand && cand.finishReason };
      });
    },

    /* Turn a failed response into {type, retry, wait, rediscover}. Only a real bad-key reason
       says "bad code" (fixes POC problem #6). */
    problem: function (r, where) {
      if (r.stopped) return { type: "stopped" };
      if (r.timeout) return { type: "timeout" };
      if (r.network) return { type: "offline", raw: r.error };
      var err = (r.body && r.body.error) || {};
      var msg = String(err.message || r.text || "");
      var status = String(err.status || "");
      var details = JSON.stringify(err.details || "");
      var raw = "HTTP " + r.status + " " + status + " " + msg.slice(0, 300) + " " + details.slice(0, 200);
      var out = { raw: raw, status: r.status };
      var badKey = /API_KEY_INVALID|API key not valid|API key expired|key is missing, invalid|invalid api key/i.test(msg + details);
      if (r.status === 401 || badKey) out.type = "bad_code";
      else if (r.status === 404 || /no longer available|is not found|not supported for generateContent|model_not_found/i.test(msg)) { out.type = "unexpected"; out.rediscover = true; }
      else if (r.status === 403 || /PERMISSION_DENIED|reported as leaked|SERVICE_DISABLED|API_KEY_SERVICE_BLOCKED/i.test(status + msg + details)) out.type = "not_allowed";
      else if (/location is not supported|FAILED_PRECONDITION/i.test(msg + status)) { out.type = "not_allowed"; out.region = true; }
      else if (r.status === 429 || r.status === 402) {
        out.type = "out_of_share";
        // A per-minute limit clears in seconds: wait and retry once. A daily one doesn't.
        var perMinute = /PerMinute|per minute|requests per min/i.test(details + msg) && !/PerDay|per day/i.test(details + msg);
        var m = details.match(/"retryDelay":"(\d+(?:\.\d+)?)s"/);
        if (perMinute) { out.retry = true; out.wait = Math.min(m ? parseFloat(m[1]) * 1000 : 5000, 15000); }
      }
      else if (r.status >= 500 || r.status === 499) { out.type = "busy"; out.retry = true; out.wait = 2500; }
      else out.type = "unexpected";
      return out;
    }
  };

  /* ---------- model choice ---------- */
  function pickModel(conn, force) {
    var p = ai.providers[conn.provider], ad = adapters[p.adapter];
    var all = models(), m = all[conn.provider];
    var stale = !m || !m.checkedAt || Date.now() - m.checkedAt > RECHECK_MS;
    if (m && m.model && !force && !stale && m.order >= 2) return Promise.resolve(m.model);
    return ad.listModels(p, conn.code).then(function (ids) {
      var ranked = ai.rankModels(conn.provider, ids);
      if (!ranked.length) throw { type: "unexpected", raw: "no usable models in list of " + ids.length };
      // Weekly re-check moves to the best model on the list. If it misbehaves, the next
      // call falls back down the candidate list on its own.
      var keep = ranked[0];
      all[conn.provider] = { model: keep, candidates: ranked, checkedAt: Date.now(), order: 3, busy: (m && m.busy) || {} };
      saveModels(all);
      return keep;
    }).catch(function (e) {
      // Quiet weekly re-check failed but we still have a model: keep using it.
      if (m && m.model && !force && !(e && e.type === "bad_code")) return m.model;
      throw e;
    });
  }
  /* Busy models: Google sometimes refuses a model for a while ("high demand", 503) while its
     sister models work fine. We remember a busy model for 10 minutes and use the next one. */
  function firstNotBusy(m) {
    var busy = m.busy || {}, now = Date.now();
    var list = [m.model].concat((m.candidates || []).filter(function (id) { return id !== m.model; }));
    for (var i = 0; i < list.length; i++) if (!(busy[list[i]] > now)) return list[i];
    return m.model;   // everything busy: try the main one anyway
  }
  function markBusy(provider, id) {
    if (ai.drill) return null;   // pretend failures from the test page leave no trace
    var all = models(), m = all[provider]; if (!m) return null;
    m.busy = m.busy || {}; m.busy[id] = Date.now() + BUSY_MS;
    saveModels(all);
    var next = firstNotBusy(m);
    return next !== id ? next : null;
  }
  ai._markBusy = markBusy;

  function nextCandidate(provider, failed) {
    var all = models(), m = all[provider]; if (!m) return null;
    m.candidates = (m.candidates || []).filter(function (id) { return id !== failed; });
    m.model = m.candidates[0] || null; saveModels(all);
    return m.model;
  }

  /* ---------- connect: test a pasted code with ONE REAL TOOL CALL ----------
     (fixes POC problem #7: a code could pass "say ok" and then fail when Penny used tools)
     Resolves {ok:true, provider, label} or {ok:false, type, title, help}. */
  ai.connect = function (rawCode, providerId) {
    var code = ai.cleanCode(rawCode);
    if (!code) return Promise.resolve(fail({ type: "bad_code" }, null, "Paste your code first."));
    // Patterns are only a hint for WHICH company. Google decides whether a code is valid:
    // codes change format over time, and we must never refuse a real code on a guess.
    var provider = providerId || ai.detectProvider(code) || ai.defaultProvider;
    if (code.length < 20 || /\s/.test(code)) {
      dd.errors.record("ai.connect", "pasted text not code-shaped: " + code.length + " characters, starts " + JSON.stringify(code.slice(0, 2)));
      return Promise.resolve(fail({ type: "bad_code" }, null));
    }
    if (!ai.detectProvider(code)) dd.errors.record("ai.connect", "unfamiliar code format (" + code.length + " characters, starts " + JSON.stringify(code.slice(0, 2)) + "), asking " + provider);
    var p = ai.providers[provider], ad = adapters[p.adapter];
    var conn = { provider: provider, code: code };
    stopped = false;
    var ranked = [], lastProblem = null, started = Date.now(), failed = {};
    return ad.listModels(p, code).then(function (ids) {
      ranked = ai.rankModels(provider, ids);
      if (!ranked.length) throw { type: "unexpected", raw: "no usable models" };
      return tryModels(ranked, 0);
    }).then(function (model) {
      var c = loadConns(); c.main = { provider: provider, code: code, savedAt: new Date().toISOString() };
      var saved = dd.store.setJSON(CONN_KEY, c);
      if (!saved.ok) return fail({ type: saved.reason }, provider);
      dd.store.remove(LEGACY_KEY);
      var all = models(); all[provider] = { model: model, candidates: [model].concat(ranked.filter(function (id) { return id !== model; })), checkedAt: Date.now(), order: 3, busy: failed }; saveModels(all);
      dd.emit("ai:changed", { connected: true, provider: provider });
      return { ok: true, provider: provider, label: p.label };
    }).catch(function (e) { return fail(e, provider); });

    function tryModels(list, i) {
      var left = ai.limits.turn - (Date.now() - started);
      if (i >= list.length || left < 3000) throw lastProblem || { type: "unexpected", raw: "no model passed the tool test" };
      var model = list[i];
      return ad.send(p, code, model, {
        system: "You are a connection test.", ms: Math.min(i < list.length - 1 ? ai.limits.perModel : ai.limits.request, left), forceTool: "confirm_ready",
        history: [{ role: "user", text: "Call confirm_ready with word set to ready." }],
        tools: [{ name: "confirm_ready", description: "Confirms the connection works.", params: { word: { type: "string", description: "Always 'ready'" } } }]
      }).then(function (res) {
        if (res.calls.some(function (c) { return c.name === "confirm_ready"; })) return model;
        lastProblem = { type: "unexpected", raw: model + " answered without using the tool" };
        failed[model] = Date.now() + BUSY_MS;
        return tryModels(list, i + 1);
      }, function (e) {
        // A bad code, no internet or Stop won't get better with another model: stop here.
        if (e.type === "bad_code" || e.type === "offline" || e.type === "stopped" || e.type === "not_allowed" && !e.rediscover) throw e;
        lastProblem = e; failed[model] = Date.now() + BUSY_MS;
        dd.errors.record("ai.connect", model + " " + describe(e) + (list[i + 1] ? ", trying " + list[i + 1] : ""));
        return tryModels(list, i + 1);
      });
    }
  };

  function fail(e, provider, title) {
    if (e && e.raw) dd.errors.record("ai", e.raw);
    var type = (e && e.type) || "unexpected";
    var f = dd.errors.friendly(type === "stopped" ? "unexpected" : type, { company: provider && ai.providers[provider] ? ai.providers[provider].label : undefined });
    if (title) f.title = title;
    if (e && e.region) f.help = "Google's free plan doesn't work in your country yet.";
    if (type === "bad_code" && !provider && !title) f.help = "That doesn't look like a code from Google. Copy it again with Google's Copy button and paste it here.";
    return { ok: false, type: type, stopped: type === "stopped", title: f.title, help: f.help };
  }

  /* ---------- chat: one helper turn, running tools as the model asks ----------
     req = { system, history:[neutral turns], tools:[neutral tools with run(args) ],
             onStatus(fn), onToolCall(call) }
     Every function call in a reply is run, in order (fixes POC problem #2).
     Resolves { ok, text, history (new turns appended), calls:[...] } or { ok:false, ... }. */
  ai.chat = function (req) {
    var conns = loadConns();
    if (!conns.main) return Promise.resolve(fail({ type: "bad_code" }, null, "The helper needs your free access code first."));
    var conn = conns.main, p = ai.providers[conn.provider], ad = adapters[p.adapter];
    var history = (req.history || []).slice();
    var started = Date.now(), rounds = 0, ran = [], queue = [], tried = {}, lastProblem = null, refreshed = false;
    var status = req.onStatus || function () {};
    stopped = false;

    function left() { return ai.limits.turn - (Date.now() - started); }
    function untried() { return queue.filter(function (id) { return !tried[id]; }); }

    function step(model) {
      if (stopped) return Promise.reject({ type: "stopped" });
      tried[model] = true;
      // A silent model gets a short wait while other models are still left to try.
      var ms = Math.min(untried().length ? ai.limits.perModel : ai.limits.request, left());
      if (left() <= 1000) return Promise.reject(lastProblem || { type: "timeout", raw: "turn budget used up" });
      status(rounds ? "working" : "thinking");
      return ad.send(p, conn.code, model, { system: req.system, history: history, tools: req.tools, ms: ms, model: model }).then(function (res) {
        history.push({ role: "model", text: res.text, calls: res.calls, raw: res.raw });
        if (!res.calls.length) { rememberWorking(conn.provider, model); return { ok: true, text: res.text, history: history, calls: ran, model: model }; }
        if (++rounds > ai.limits.rounds) { rememberWorking(conn.provider, model); return { ok: true, text: res.text || "", history: history, calls: ran, model: model, cappedRounds: true }; }
        // Run every call in order, collect every result, send them back together.
        var results = [];
        return res.calls.reduce(function (chain, call) {
          return chain.then(function () {
            if (stopped) throw { type: "stopped" };
            var tool = (req.tools || []).filter(function (t) { return t.name === call.name; })[0];
            if (req.onToolCall) try { req.onToolCall(call); } catch (e) {}
            return Promise.resolve(tool ? tool.run(call.args || {}, call) : { ok: false, message: "No tool called " + call.name })
              .catch(function (e) { dd.errors.record("tool:" + call.name, e); return { ok: false, message: "That didn't work." }; })
              .then(function (result) { results.push({ id: call.id, name: call.name, result: result }); ran.push({ name: call.name, args: call.args, result: result }); });
          });
        }, Promise.resolve()).then(function () {
          history.push({ role: "tool", results: results });
          return step(model);
        });
      }, function (e) {
        // Problems no other model can fix: stop and explain.
        if (e.type === "stopped" || e.type === "bad_code" || e.type === "offline" || (e.type === "not_allowed" && !e.rediscover)) throw e;
        // Anything else (busy, silent, retired, this model's daily share used up, a model-
        // specific refusal): note it and try the next model. Every model, until one answers.
        lastProblem = e;
        markBusy(conn.provider, model);
        var next = untried()[0];
        if (next && left() > 3000) {
          status("retrying");
          dd.errors.record("ai.switch", model + " " + describe(e) + ", trying " + next);
          return step(next);
        }
        // Every model we knew about failed. Google may have added new ones: look once.
        if (!refreshed && left() > 5000) {
          refreshed = true;
          return pickModel(conn, true).then(function () {
            queue = modelQueue(conn.provider);
            var fresh = untried()[0];
            if (!fresh) throw e;
            dd.errors.record("ai.switch", "all known models failed; new model found: " + fresh);
            return step(fresh);
          });
        }
        throw e;
      });
    }

    return pickModel(conn).then(function () {
      queue = modelQueue(conn.provider);
      return step(queue[0]);
    }).catch(function (e) {
      var out = fail(e, conn.provider);
      out.history = history; out.calls = ran; out.tried = Object.keys(tried);
      return out;
    });
  };

  function describe(e) {
    return { busy: "busy", timeout: "no answer", out_of_share: "used up its free share", unexpected: e.rediscover ? "retired" : "refused" }[e.type] || e.type;
  }

  /* Every usable model, in order: the one that last worked first, then the rest by rank,
     with models that recently failed moved to the end (still tried, never skipped). */
  function modelQueue(provider) {
    var m = models()[provider] || {}, busy = m.busy || {}, now = Date.now(), seen = {}, list = [];
    [m.model].concat(m.candidates || []).forEach(function (id) { if (id && !seen[id]) { seen[id] = 1; list.push(id); } });
    return list.filter(function (id) { return !(busy[id] > now); }).concat(list.filter(function (id) { return busy[id] > now; }));
  }
  ai._queue = modelQueue;
  /* The model that just answered becomes the first choice next time. */
  function rememberWorking(provider, id) {
    var all = models(), m = all[provider]; if (!m) return;
    m.model = id; if (m.busy) delete m.busy[id];
    saveModels(all);
  }

  /* Speed check (AI test page only): times each kind of request with a generous limit,
     so we can see what's slow. Resolves [{step, secs, outcome}]. */
  ai.speedCheck = function (limitMs, onRow) {
    var conn = loadConns().main; if (!conn) return Promise.resolve([{ step: "no code saved", secs: "-", outcome: "-" }]);
    var p = ai.providers[conn.provider], ad = adapters[p.adapter], out = [], keep = ai.limits.request;
    ai.limits.request = limitMs || 90000; stopped = false;
    function timed(step, fn) {
      var t = Date.now();
      if (onRow) onRow(out.concat({ step: step, secs: "…", outcome: "waiting for Google" }));
      return fn().then(function (r) { out.push({ step: step, secs: ((Date.now() - t) / 1000).toFixed(1), outcome: r }); },
                       function (e) { out.push({ step: step, secs: ((Date.now() - t) / 1000).toFixed(1), outcome: "failed: " + (e.type === "timeout" ? "no answer" : e.type || "?") + (e.status ? " (" + e.status + ")" : "") }); })
        .then(function () { if (onRow) onRow(out.slice()); });
    }
    var model, working = null;
    return pickModel(conn).then(function (m) { model = m; })
      .then(function () { return timed("model list", function () { return ad.listModels(p, conn.code).then(function (ids) { return ids.length + " models"; }); }); })
      .then(function () {
        var all = models()[conn.provider] || {}, list = [model].concat((all.candidates || []).filter(function (id) { return id !== model; })).slice(0, 3);
        return list.reduce(function (chain, id) {
          return chain.then(function () { return timed("plain answer (" + id + ")", function () {
            return ad.send(p, conn.code, id, { ms: ai.limits.request, history: [{ role: "user", text: "Say hi in three words." }] }).then(function () { if (!working) working = id; return "ok"; }); }); });
        }, Promise.resolve());
      })
      .then(function () { var use = working || model; return timed("tool answer (" + use + ")", function () {
        return ad.send(p, conn.code, use, { ms: ai.limits.request, history: [{ role: "user", text: "Add apples to my list." }],
          tools: [{ name: "add_item", description: "Add one item to the list.", params: { text: { type: "string" } } }] })
          .then(function (r) { return r.calls.length ? "ok, used the tool" : "ok, but answered without the tool"; }); }); })
      .then(function () { ai.limits.request = keep; return out; }, function (e) { ai.limits.request = keep; out.push({ step: "picking a model", secs: "-", outcome: "failed: " + (e.type || "?") }); return out; });
  };

  /* One-shot text answer without tools (e.g. the scripted guide's "ask anything" fallback). */
  ai.ask = function (prompt, system) {
    return ai.chat({ system: system, history: [{ role: "user", text: prompt }] });
  };

  function wait(ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(resolve, ms);
      var poll = setInterval(function () { if (stopped) { clearTimeout(t); clearInterval(poll); reject({ type: "stopped" }); } }, 200);
      setTimeout(function () { clearInterval(poll); }, ms + 50);
    });
  }

  /* ---------- phone pairing: the AI code travels in the QR (on by default) ----------
     Google codes travel as-is (the company is the default); others as "company:code". */
  if (dd.pair) dd.pair.register({
    key: "k", label: "access code",
    give: function (opts) {
      var c = loadConns().main;
      if (!opts.includeCode || !c || !c.code) return undefined;
      return c.provider === ai.defaultProvider ? c.code : c.provider + ":" + c.code;
    },
    take: function (v) {
      if (typeof v !== "string" || v.length < 20 || v.length > 300) return false;
      var i = v.indexOf(":"), provider = ai.defaultProvider, code = v;
      if (i > 0 && ai.providers[v.slice(0, i)]) { provider = v.slice(0, i); code = v.slice(i + 1); }
      var c = loadConns();
      if (c.main && c.main.code === code) return false;   // already here
      c.main = { provider: provider, code: code, savedAt: new Date().toISOString(), fromPhonePairing: true };
      if (!dd.store.setJSON(CONN_KEY, c).ok) return false;
      dd.emit("ai:changed", { connected: true, provider: provider });
      return true;
    }
  });

  /* ---------- support diagnostic ---------- */
  if (dd.diag) dd.diag.addSection("AI", function () {
    var c = loadConns().main, m = models();
    if (!c) return ["No access code saved."];
    var pm = m[c.provider] || {};
    return [
      (ai.providers[c.provider] ? ai.providers[c.provider].label : c.provider) + " code " + mask(c.code) + (c.migrated ? " (moved from older version)" : ""),
      "Model: " + (pm.model || "not picked yet") + (pm.checkedAt ? " · list checked " + new Date(pm.checkedAt).toLocaleDateString() : ""),
      "Candidates: " + ((pm.candidates || []).slice(0, 5).join(", ") || "-"),
      "Busy right now: " + (Object.keys(pm.busy || {}).filter(function (id) { return pm.busy[id] > Date.now(); }).join(", ") || "none")
    ].concat(reqLog.length ? ["Recent requests (newest first):"].concat(reqLog.map(function (q) {
      return "  " + q.at + " · " + q.what + (q.model ? " " + q.model : "") + " · " + q.secs + " s · " + q.outcome;
    })) : ["No AI requests yet this visit."]);
  });
})();
