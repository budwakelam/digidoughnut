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

  ai.limits = { request: 30000, turn: 60000, rounds: 5 };   // tests shrink these
  var CONN_KEY = "dd_ai_connections_v1", MODELS_KEY = "dd_ai_models_v1", LEGACY_KEY = "dd_gemini_key_v1";
  var RECHECK_MS = 7 * 24 * 3600 * 1000;

  /* ---------- provider registry ---------- */
  ai.providers = {
    google: {
      id: "google", label: "Google", adapter: "gemini",
      codePattern: /^AIza[0-9A-Za-z_\-]{30,}$/,
      getCodeUrl: "https://aistudio.google.com/apikey",   // overridable via noticeboard helpLinks.getCode_google
      base: "https://generativelanguage.googleapis.com/v1beta",
      free: true,
      // Model picking hints: never shown to the buyer.
      exclude: /(tts|live|audio|transcri|image|banana|embed|robotics|veo|lyria|imagen|research|aqa|gemma|computer|learnlm|thinking-exp)/i,
      privacyNote: "Google may use what you send through its free plan to improve its products, and people at Google may read it. Don't put anything private in your messages to the helper."
    }
  };

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
    return ids.filter(function (id) { return !p.exclude.test(id) && avoid.indexOf(id) < 0; })
              .sort(function (a, b) { return score(b) - score(a); });
  };

  /* ---------- low-level request with timeout + Stop ---------- */
  var current = null;   // the AbortController of the request in flight
  ai.stop = function () { stopped = true; if (current) try { current.abort(); } catch (e) {} };
  var stopped = false;

  /* Test drills (used only by the AI test page): make the NEXT request behave as if
     Google ran out of free share, went silent, or the internet dropped. */
  ai.drill = null;
  function drilled(ms, ctl) {
    var d = ai.drill; ai.drill = null;
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
  function logRequest(url, started, r) {
    var what = /\/models\?/.test(url) || /\/models$/.test(url.split("?")[0]) ? "list" : "send";
    var m = url.match(/\/models\/([^:?]+):/);
    var outcome = r.timeout ? "TIMED OUT" : r.stopped ? "stopped" : r.network ? "no connection" : String(r.status);
    reqLog.unshift({ at: new Date().toLocaleTimeString(), what: what, model: m ? decodeURIComponent(m[1]) : "", secs: ((Date.now() - started) / 1000).toFixed(1), outcome: outcome });
    if (reqLog.length > 8) reqLog.length = 8;
    if (r.timeout) dd.errors.record("ai " + what + (m ? " " + decodeURIComponent(m[1]) : ""), "no answer within " + ((Date.now() - started) / 1000).toFixed(0) + " s");
  }

  function request(url, opts, ms) {
    var started = Date.now();
    var ctl = new AbortController(); current = ctl;
    var d = ai.drill && drilled(ms, ctl);
    if (d) return d.finally(function () { if (current === ctl) current = null; });
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
    }).then(function (r) { logRequest(url, started, r); return r; })
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
    if (m && m.model && !force && !stale) return Promise.resolve(m.model);
    return ad.listModels(p, conn.code).then(function (ids) {
      var ranked = ai.rankModels(conn.provider, ids);
      if (!ranked.length) throw { type: "unexpected", raw: "no usable models in list of " + ids.length };
      // Weekly re-check moves to the best model on the list. If it misbehaves, the next
      // call falls back down the candidate list on its own.
      var keep = ranked[0];
      all[conn.provider] = { model: keep, candidates: ranked.slice(0, 8), checkedAt: Date.now() };
      saveModels(all);
      return keep;
    }).catch(function (e) {
      // Quiet weekly re-check failed but we still have a model: keep using it.
      if (m && m.model && !force && !(e && e.type === "bad_code")) return m.model;
      throw e;
    });
  }
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
    var provider = providerId || ai.detectProvider(code);
    if (!provider) return Promise.resolve(fail({ type: "bad_code" }, null));
    var p = ai.providers[provider], ad = adapters[p.adapter];
    var conn = { provider: provider, code: code };
    stopped = false;
    var ranked = [], lastProblem = null;
    return ad.listModels(p, code).then(function (ids) {
      ranked = ai.rankModels(provider, ids);
      if (!ranked.length) throw { type: "unexpected", raw: "no usable models" };
      return tryModels(ranked.slice(0, 4), 0);
    }).then(function (model) {
      var c = loadConns(); c.main = { provider: provider, code: code, savedAt: new Date().toISOString() };
      var saved = dd.store.setJSON(CONN_KEY, c);
      if (!saved.ok) return fail({ type: saved.reason }, provider);
      dd.store.remove(LEGACY_KEY);
      var all = models(); all[provider] = { model: model, candidates: [model].concat(ranked.filter(function (id) { return id !== model; })).slice(0, 8), checkedAt: Date.now() }; saveModels(all);
      dd.emit("ai:changed", { connected: true, provider: provider });
      return { ok: true, provider: provider, label: p.label };
    }).catch(function (e) { return fail(e, provider); });

    function tryModels(list, i) {
      if (i >= list.length) throw lastProblem || { type: "unexpected", raw: "no model passed the tool test" };
      var model = list[i];
      return ad.send(p, code, model, {
        system: "You are a connection test.", ms: ai.limits.request, forceTool: "confirm_ready",
        history: [{ role: "user", text: "Call confirm_ready with word set to ready." }],
        tools: [{ name: "confirm_ready", description: "Confirms the connection works.", params: { word: { type: "string", description: "Always 'ready'" } } }]
      }).then(function (res) {
        if (res.calls.some(function (c) { return c.name === "confirm_ready"; })) return model;
        lastProblem = { type: "unexpected", raw: model + " answered without using the tool" };
        return tryModels(list, i + 1);
      }, function (e) {
        // A bad code, no internet or Stop won't get better with another model: stop here.
        if (e.type === "bad_code" || e.type === "offline" || e.type === "stopped" || e.type === "not_allowed" && !e.rediscover) throw e;
        lastProblem = e; dd.errors.record("ai.connect:" + model, e.raw || e.type);
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
    var started = Date.now(), rounds = 0, retried = 0, rediscovered = false, ran = [];
    var status = req.onStatus || function () {};
    stopped = false;

    function left() { return ai.limits.turn - (Date.now() - started); }

    function step(model) {
      if (stopped) return Promise.reject({ type: "stopped" });
      var ms = Math.min(ai.limits.request, left());
      if (ms <= 500) return Promise.reject({ type: "timeout", raw: "turn budget used up" });
      status(rounds ? "working" : "thinking");
      return ad.send(p, conn.code, model, { system: req.system, history: history, tools: req.tools, ms: ms }).then(function (res) {
        history.push({ role: "model", text: res.text, calls: res.calls, raw: res.raw });
        if (!res.calls.length) return { ok: true, text: res.text, history: history, calls: ran, model: model };
        if (++rounds > ai.limits.rounds) return { ok: true, text: res.text || "", history: history, calls: ran, model: model, cappedRounds: true };
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
        if (e.type === "stopped") throw e;
        if (e.rediscover && !rediscovered) {
          rediscovered = true; dd.errors.record("ai.model", e.raw);
          var next = nextCandidate(conn.provider, model);
          return (next ? Promise.resolve(next) : pickModel(conn, true)).then(step);
        }
        if (e.retry && retried < 2 && left() > (e.wait || 0) + 3000) {
          retried++; status("retrying"); dd.errors.record("ai.retry", e.raw);
          return wait(e.wait || 2500).then(function () { return step(model); });
        }
        throw e;
      });
    }

    return pickModel(conn).then(step).catch(function (e) {
      var out = fail(e, conn.provider);
      out.history = history; out.calls = ran;
      return out;
    });
  };

  /* Speed check (AI test page only): times each kind of request with a generous limit,
     so we can see what's slow. Resolves [{step, secs, outcome}]. */
  ai.speedCheck = function (limitMs) {
    var conn = loadConns().main; if (!conn) return Promise.resolve([{ step: "no code saved", secs: "-", outcome: "-" }]);
    var p = ai.providers[conn.provider], ad = adapters[p.adapter], out = [], keep = ai.limits.request;
    ai.limits.request = limitMs || 90000; stopped = false;
    function timed(step, fn) {
      var t = Date.now();
      return fn().then(function (r) { out.push({ step: step, secs: ((Date.now() - t) / 1000).toFixed(1), outcome: r }); },
                       function (e) { out.push({ step: step, secs: ((Date.now() - t) / 1000).toFixed(1), outcome: "failed: " + (e.type || "?") + (e.status ? " (" + e.status + ")" : "") }); });
    }
    var model;
    return pickModel(conn).then(function (m) { model = m; })
      .then(function () { return timed("model list", function () { return ad.listModels(p, conn.code).then(function (ids) { return ids.length + " models"; }); }); })
      .then(function () { return timed("plain answer (" + model + ")", function () {
        return ad.send(p, conn.code, model, { ms: ai.limits.request, history: [{ role: "user", text: "Say hi in three words." }] }).then(function (r) { return "ok"; }); }); })
      .then(function () { return timed("tool answer (" + model + ")", function () {
        return ad.send(p, conn.code, model, { ms: ai.limits.request, history: [{ role: "user", text: "Add apples to my list." }],
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

  /* ---------- support diagnostic ---------- */
  if (dd.diag) dd.diag.addSection("AI", function () {
    var c = loadConns().main, m = models();
    if (!c) return ["No access code saved."];
    var pm = m[c.provider] || {};
    return [
      (ai.providers[c.provider] ? ai.providers[c.provider].label : c.provider) + " code " + mask(c.code) + (c.migrated ? " (moved from older version)" : ""),
      "Model: " + (pm.model || "not picked yet") + (pm.checkedAt ? " · list checked " + new Date(pm.checkedAt).toLocaleDateString() : ""),
      "Candidates: " + ((pm.candidates || []).slice(0, 5).join(", ") || "-")
    ].concat(reqLog.length ? ["Recent requests (newest first):"].concat(reqLog.map(function (q) {
      return "  " + q.at + " · " + q.what + (q.model ? " " + q.model : "") + " · " + q.secs + " s · " + q.outcome;
    })) : ["No AI requests yet this visit."]);
  });
})();
