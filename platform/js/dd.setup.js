/* ===== DigiDoughnut Platform · dd.setup — the Setup Center and its wizards =====
   Spec 3.8 (Oran, 2026-10-06/07):
   - One checklist card, four steps, green ticks; identical in every program.
   - Popup wizards: one action per screen, progress, big buttons, checkmarks. Every Google/tiiny
     button label quoted exactly (labels can be corrected through the noticeboard). Every
     "you can ignore this" said out loud. "Start over" on every screen. Dismissible and resumable.
   - Two layers of help inside a wizard: before the access code works, a SCRIPTED guide answers
     the predictable questions by keyword (offline, free, and it never pretends to be the AI).
     Once the code works, the live AI answers inside the same wizard.
   Wizard screens are DATA (see dd.setup.wizards below): copy lives in one place Oran can edit. */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var setup = dd.setup = {};
  var program = null;

  function stateKey() { return dd.store.programKey(program.id, "setup"); }
  function state() { return dd.store.getJSON(stateKey()) || { folded: false, wizards: {} }; }
  function saveState(s) { dd.store.setJSON(stateKey(), s); }
  var esc = function (s) { return dd.ui.esc(s); };
  var L = function (key, fallback) { return dd.notes ? dd.notes.label(key, fallback) : fallback; };
  var link = function (key, fallback) { return dd.notes ? dd.notes.link(key, fallback) : fallback; };

  /* ---------- the four steps ---------- */
  setup.steps = [
    { id: "try", title: "Try it", gives: "Everything works right now, saved in this browser.", time: "Done",
      done: function () { return true; } },
    { id: "ai", title: "Turn on the helper", gives: "The AI helper and every smart feature.", time: "About 2 minutes",
      done: function () { return !!(dd.ai && dd.ai.hasCode()); }, wizard: "ai" },
    { id: "phone", title: "Put it on your phone", gives: "The same program on your phone, moved over by scanning a code.", time: "About 5 minutes",
      done: function () { return dd.env.isHosted; }, wizard: "host" },
    { id: "sync", title: "Keep devices in step", gives: "Changes on one device show up on the other.", time: "About 10 minutes",
      done: function () { return !!(dd.sync && dd.sync.isOn && dd.sync.isOn()); }, wizard: "sync" }
  ];

  setup.doneCount = function () { return setup.steps.filter(function (s) { return s.done(); }).length; };

  /* ---------- the card / chip ---------- */
  setup.paint = function () {
    var host = document.getElementById("dd-setup"); if (!host || !program) return;
    var st = state(), n = setup.doneCount(), total = setup.steps.length;
    if (st.folded || n === total) {
      host.innerHTML = '<button class="dd-setup-chip" id="dd-setup-chip">' + (n === total ? "✓ All set up" : "Setup: " + n + " of " + total + " done") + '</button>';
      document.getElementById("dd-setup-chip").addEventListener("click", function () { var s = state(); s.folded = false; saveState(s); setup.paint(); });
      return;
    }
    var rows = setup.steps.map(function (s, i) {
      var done = s.done(), wiz = s.wizard && setup.wizards[s.wizard];
      var btn = done
        ? (wiz && wiz.ready !== false && s.id !== "try" ? '<button class="dd-linkbtn" data-start="' + s.wizard + '">Change</button>' : "")
        : (wiz && wiz.ready !== false ? '<button class="dd-btn small" data-start="' + s.wizard + '">' + (st.wizards[s.wizard] ? "Continue" : "Start") + '</button>'
                                      : '<span class="dd-note">Coming soon</span>');
      return '<li class="dd-step' + (done ? " done" : "") + '"><span class="dd-tick" aria-hidden="true">' + (done ? "✓" : i + 1) + '</span>' +
        '<div class="dd-step-text"><b>' + esc(s.title) + '</b><span>' + esc(s.gives) + (done ? "" : " · " + esc(s.time)) + '</span></div>' + btn + '</li>';
    }).join("");
    host.innerHTML = '<div class="dd-card dd-setup-card"><h2>Set up ' + esc(program.name) + ' <span class="dd-setup-count">' + n + ' of ' + total + ' done</span></h2>' +
      '<p class="dd-note" style="margin:0 0 8px">Each step is optional. Do them in any order, any time.</p><ol class="dd-steps">' + rows + '</ol>' +
      '<div class="dd-btnrow"><button class="dd-linkbtn" id="dd-setup-fold">Hide this for now</button></div></div>';
    host.querySelectorAll("[data-start]").forEach(function (b) { b.addEventListener("click", function () { setup.open(b.dataset.start); }); });
    document.getElementById("dd-setup-fold").addEventListener("click", function () { var s = state(); s.folded = true; saveState(s); setup.paint(); });
  };

  /* Just-in-time: an AI feature was tapped with no code. Opens the helper wizard with context. */
  setup.needAI = function (why) {
    setup.open("ai", { context: (why || "To do that, the helper needs a free access code from Google.") + " It takes about 2 minutes." });
  };

  /* ---------- the wizard ---------- */
  var cur = null;   // {id, wiz, at, context}
  setup.open = function (id, opts) {
    var wiz = setup.wizards[id]; if (!wiz || wiz.ready === false || !wiz.screens.length) return;
    var st = state(), at = (st.wizards[id] && st.wizards[id].at) || 0;
    if (at >= wiz.screens.length) at = 0;
    cur = { id: id, wiz: wiz, at: at, context: opts && opts.context };
    draw();
  };
  function remember() { var s = state(); s.wizards[cur.id] = { at: cur.at }; saveState(s); }
  function finish() { var s = state(); delete s.wizards[cur.id]; saveState(s); }

  function draw() {
    var wiz = cur.wiz, sc = wiz.screens[cur.at], total = wiz.screens.length;
    remember();
    var dots = wiz.screens.map(function (_, i) { return '<i class="' + (i < cur.at ? "done" : i === cur.at ? "now" : "") + '"></i>'; }).join("");
    var body = typeof sc.body === "function" ? sc.body() : sc.body;
    var html =
      '<div class="dd-wiz-top"><span class="dd-wiz-name">' + esc(wiz.title) + '</span><span class="dd-wiz-progress">Step ' + (cur.at + 1) + ' of ' + total + '</span></div>' +
      '<div class="dd-wiz-dots">' + dots + '</div>' +
      (cur.context && cur.at === 0 ? '<p class="dd-status show info">' + esc(cur.context) + '</p>' : "") +
      '<h2>' + esc(sc.title) + '</h2><div class="dd-wiz-body">' + body + '</div>' +
      (sc.action ? '<div class="dd-btnrow"><button class="dd-btn dd-wiz-big" data-action>' + esc(sc.action.label) + '</button></div>' : "") +
      '<div class="dd-status" id="dd-wiz-status"></div>' +
      '<div class="dd-wiz-nav">' +
        (cur.at > 0 ? '<button class="dd-btn ghost" data-back>Back</button>' : "") +
        (sc.next !== false ? '<button class="dd-btn" data-next>' + esc(sc.nextLabel || "Next") + '</button>' : "") +
      '</div>' +
      '<div class="dd-wiz-help">' +
        '<button class="dd-linkbtn" data-stuck>I\'m stuck</button>' +
        '<button class="dd-linkbtn" data-ask>Ask a question</button>' +
        (cur.at > 0 ? '<button class="dd-linkbtn" data-over>Start over</button>' : "") +
        '<button class="dd-linkbtn" data-later>Finish later</button>' +
      '</div>' +
      '<div class="dd-wiz-stuck" id="dd-wiz-stuck" hidden></div>' +
      '<div class="dd-wiz-ask" id="dd-wiz-ask" hidden></div>';
    var sh = dd.ui.sheet(html, { onClose: function () { setup.paint(); } });
    sh.classList.add("dd-wiz");

    var q = function (sel) { return sh.querySelector(sel); };
    if (q("[data-back]")) q("[data-back]").addEventListener("click", function () { cur.at--; draw(); });
    if (q("[data-over]")) q("[data-over]").addEventListener("click", function () { cur.at = 0; draw(); });
    q("[data-later]").addEventListener("click", function () { dd.ui.closeSheet(); dd.ui.toast("Saved. Tap Continue in the setup card to pick up here."); });
    if (q("[data-action]")) q("[data-action]").addEventListener("click", function () { sc.action.run(ctxFor(sh)); });
    if (q("[data-next]")) q("[data-next]").addEventListener("click", function () { next(sh); });
    q("[data-stuck]").addEventListener("click", function () { toggleStuck(sh, sc); });
    q("[data-ask]").addEventListener("click", function () { toggleAsk(sh); });
    if (sc.mount) sc.mount(ctxFor(sh));
  }

  function ctxFor(sh) {
    return {
      el: sh, status: function (kind, title, help) { dd.ui.status(sh.querySelector("#dd-wiz-status"), kind, title, help); },
      next: function () { next(sh, true); }, open: function (url) { window.open(url, "_blank", "noopener"); }
    };
  }

  function next(sh, skipCheck) {
    var sc = cur.wiz.screens[cur.at];
    var go = function () {
      if (cur.at < cur.wiz.screens.length - 1) { cur.at++; draw(); }
      else { finish(); dd.ui.closeSheet(); setup.paint(); if (cur.wiz.onDone) cur.wiz.onDone(); }
    };
    if (skipCheck || !sc.check) return go();
    var c = ctxFor(sh);
    var btn = sh.querySelector("[data-next]"); if (btn) btn.disabled = true;
    Promise.resolve(sc.check(c)).then(function (ok) { if (btn) btn.disabled = false; if (ok) go(); });
  }

  /* "I'm stuck": common fixes for THIS screen, plus a link to the picture guide. */
  function toggleStuck(sh, sc) {
    var box = sh.querySelector("#dd-wiz-stuck");
    box.hidden = !box.hidden; sh.querySelector("#dd-wiz-ask").hidden = true;
    if (box.hidden) return;
    var fixes = (sc.stuck || []).concat(["Close this and tap Continue later. Your place is saved.", "Nothing you do here can break the program. Every step can be done again."]);
    var guide = sc.guide ? link("guide_" + sc.guide, null) : null;
    box.innerHTML = "<b>Things that usually help:</b><ul>" + fixes.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" +
      (guide ? '<p><a href="' + esc(guide) + '" target="_blank" rel="noopener">See this step with pictures</a></p>' : "");
  }

  /* ---------- "Ask a question": scripted guide first, live AI once the code works ---------- */
  function toggleAsk(sh) {
    var box = sh.querySelector("#dd-wiz-ask");
    box.hidden = !box.hidden; sh.querySelector("#dd-wiz-stuck").hidden = true;
    if (box.hidden) return;
    var live = dd.ai && dd.ai.hasCode();
    box.innerHTML = '<p class="dd-note" style="margin:0 0 6px">' + (live
        ? "Ask anything about this step. The helper (AI) answers."
        : "Ask about this step. These are ready-made answers from the setup guide; the AI helper takes over once your code is connected.") + '</p>' +
      '<div class="dd-ask-msgs" id="dd-ask-msgs"></div>' +
      '<div class="dd-ask-row"><input class="dd-input" id="dd-ask-in" placeholder="e.g. Is it really free?" autocomplete="off"><button class="dd-btn small" id="dd-ask-go">Ask</button></div>' +
      '<div class="dd-ask-chips">' + setup.suggestQuestions(cur.id).map(function (t) { return '<button class="dd-chip">' + esc(t) + '</button>'; }).join("") + '</div>';
    var input = box.querySelector("#dd-ask-in");
    var send = function (text) {
      text = (text || input.value).trim(); if (!text) return;
      input.value = "";
      say(box, "me", text);
      var live = dd.ai && dd.ai.hasCode();
      var wait = live ? say(box, "bot pending", "The helper is thinking…") : null;
      box.querySelector("#dd-ask-go").disabled = true;
      setup.answer(text, cur).then(function (a) {
        if (wait) wait.remove();
        box.querySelector("#dd-ask-go").disabled = false;
        say(box, a.live ? "bot live" : "bot", a.text);
      });
    };
    box.querySelector("#dd-ask-go").addEventListener("click", function () { send(); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
    box.querySelectorAll(".dd-chip").forEach(function (c) { c.addEventListener("click", function () { send(c.textContent); }); });
    input.focus();
  }
  function say(box, who, text) {
    var m = document.createElement("div"); m.className = "dd-ask-msg " + who;
    m.textContent = text; box.querySelector("#dd-ask-msgs").appendChild(m);
    m.scrollIntoView({ block: "nearest" });
    return m;
  }

  /* Returns Promise<{text, live}>. Live AI when a code works; otherwise (or if the AI fails)
     the scripted answer. The scripted guide never pretends to be the AI. */
  setup.answer = function (question, where) {
    var scripted = setup.scriptedAnswer(question);
    if (!(dd.ai && dd.ai.hasCode())) return Promise.resolve({ text: scripted || setup.noMatch, live: false });
    var wiz = where && where.wiz, sc = wiz && wiz.screens[where.at];
    var context = "The buyer is in the '" + (wiz ? wiz.title : "setup") + "' wizard, on step " + (where ? where.at + 1 : "?") +
      " ('" + (sc ? sc.title : "") + "'). That screen says: " + (sc ? stripTags(typeof sc.body === "function" ? sc.body() : sc.body) : "");
    return dd.ai.chat({ system: setup.helperPrompt() + "\n\n" + context, history: [{ role: "user", text: question }] }).then(function (r) {
      if (r.ok && r.text) return { text: r.text, live: true };
      return { text: scripted || "The helper can't answer right now (" + r.title.replace(/\.$/, "") + "). " + setup.noMatch, live: false };
    });
  };
  function stripTags(h) { var d = document.createElement("div"); d.innerHTML = h; return d.textContent.replace(/\s+/g, " ").trim(); }

  setup.helperPrompt = function () {
    return "You are the friendly setup guide inside " + (program ? program.name : "a DigiDoughnut program") + ", a one-page program sold by DigiDoughnut. " +
      "The buyer is not technical. Answer in 1-3 short sentences, plain words, no jargon. Say 'free access code', not 'API key'. " +
      "Only help with the step they're on. If unsure what a screen shows, say so and suggest the 'I'm stuck' button. " +
      "Facts: the access code is free from Google AI Studio, no credit card. The program keeps the code only in this browser. " +
      "Nothing they do in setup can break the program; every step can be redone.";
  };

  /* ---------- the scripted question bank (spec 3.8: all must be answered in-wizard) ---------- */
  setup.noMatch = "I don't have a ready answer for that one. Try the \"I'm stuck\" button, or tap Finish later and come back any time.";
  setup.bank = [
    { keys: ["free", "cost", "pay", "price", "charge", "money"], a: "Yes, it's free. Google gives every account a free daily share. If you ever use it up, it refills on its own. You won't be charged." },
    { keys: ["credit card", "card", "billing", "bank"], a: "No credit card needed. If Google ever asks for billing, you've gone somewhere you don't need. Tap Back and use the button on the screen before." },
    { keys: ["account", "gmail", "sign in", "log in", "login", "google account"], a: "Any Google account works, the same one you use for Gmail or YouTube. If you don't have one, Google lets you make one for free." },
    { keys: ["name", "project", "call it", "what do i write", "title"], a: "Anything you like. Try \"My " + "Program" + "\". The name is only for you." },
    { keys: ["region", "location", "country", "where", "united states", "europe"], a: "Pick United States if you're in Canada or the US. In the UK, pick Belgium (europe-west1). It only decides where your copy is stored." },
    { keys: ["locked", "test mode", "mode", "security rules", "production"], a: "Choose \"Start in locked mode\". It sounds strict, but the next step opens exactly what this program needs and nothing more." },
    { keys: ["setup code", "config", "firebaseconfig", "where do i find", "find the code"], a: "It's the box of text Firebase shows after you register the app, starting with \"const firebaseConfig\". Copy the whole box." },
    { keys: ["paste", "what exactly", "copy", "which part", "whole thing"], a: "Copy the whole thing Google shows you, using Google's own Copy button. Then come back here and paste it in the box. Extra spaces don't matter." },
    { keys: ["mistake", "wrong", "messed up", "undo", "break", "broke", "start over"], a: "Nothing can break. Every step can be done again: tap Start over, or Back. Your numbers in the program are never touched by setup." },
    { keys: ["safe", "private", "privacy", "share", "who can see", "secure"], a: "Your code stays in this browser on this device. Your numbers stay here too. When you use the helper, the numbers it needs go to Google to get an answer." },
    { keys: ["ignore", "skip", "terms", "email", "updates", "checkbox", "tick"], a: "Tick the box agreeing to Google's terms (you have to). Any box about emails or news is up to you: you can leave it empty." },
    { keys: ["long", "time", "how many", "minutes"], a: "About 2 minutes for the helper, 5 for the phone, 10 for sync. You can stop any time and pick up where you left off." },
    { keys: ["api", "key", "what is", "access code"], a: "Google calls it an API key. We call it your free access code: it's how the helper gets to use Google's AI for free." },
    { keys: ["phone", "iphone", "android", "mobile"], a: "Setting up the helper is easiest on a computer. Once it works, Send to my phone moves it over by scanning a code." }
  ];
  setup.suggestQuestions = function (wizardId) {
    return wizardId === "sync" ? ["Which region?", "Locked or test mode?", "Where's the setup code?"]
                               : ["Is it really free?", "Do I need a credit card?", "What if I make a mistake?"];
  };
  setup.scriptedAnswer = function (q) {
    var t = " " + String(q).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ") + " ";
    var best = null, bestScore = 0;
    setup.bank.forEach(function (e) {
      var score = 0;
      e.keys.forEach(function (k) { if (t.indexOf(" " + k + " ") >= 0 || (k.length > 4 && t.indexOf(k) >= 0)) score += k.split(" ").length; });
      if (score > bestScore) { bestScore = score; best = e; }
    });
    if (!best) return null;
    return best.a.replace("My Program", "My " + (program ? program.name : "Program"));
  };

  /* ---------- wizards (screens as data) ---------- */
  setup.wizards = {};

  setup.wizards.ai = {
    title: "Turn on the helper",
    onDone: function () { dd.ui.toast("The helper is turned on.", 4000); },
    screens: [
      { title: "A free code from Google",
        body: function () { return '<p>The helper runs on Google\'s AI. To use it, you need a free code from Google. <b>Google calls this an API key. We call it your free access code.</b></p>' +
          '<ul class="dd-facts"><li>✓ Free. No credit card.</li><li>✓ About 2 minutes.</li>' + (dd.env.isPhone ? "" : '<li>✓ Easiest on a computer, like you\'re using now.</li>') + '</ul>' +
          (dd.env.isPhone ? '<p class="dd-status show warn">This is easiest on a computer. You can do it there, then send it to your phone with one scan.</p>' : "") +
          '<p class="dd-note">' + esc(dd.ai.providers.google.privacyNote) + '</p>'; } },
      { title: "Open Google AI Studio",
        body: function () { return '<p>Tap the button. Google AI Studio opens in a new tab. Sign in with your Google account (the one you use for Gmail or YouTube).</p>' +
          '<p class="dd-note">Keep this page open. You\'ll come back here in a minute.</p>'; },
        action: { label: "Open Google AI Studio", run: function (c) { c.open(dd.ai.getCodeLink("google")); } },
        stuck: ["If Google asks you to make an account, that's free too.", "If the page is blank, close that tab and tap the button again."], guide: "ai_open" },
      { title: "Agree to Google's terms (first time only)",
        body: function () { return '<p>The first time, Google shows its terms. Tick the box that you agree, then tap <b>' + esc(L("ai_terms_continue", "Continue")) + '</b>.</p>' +
          '<p><b>You can ignore</b> any box about emails, news or research. Leave those empty if you like.</p>' +
          '<p class="dd-note">Didn\'t see any terms? That\'s fine, you\'ve agreed before. Tap Next.</p>'; },
        stuck: ["You need to be 18 or older to use Google AI Studio.", "If Google says it isn't available in your country, the helper can't be used there yet."], guide: "ai_terms" },
      { title: "Find your code",
        body: function () { return '<p>Look for the page called <b>' + esc(L("ai_keys_page", "API Keys")) + '</b> (Google sometimes opens it for you).</p>' +
          '<ul><li>If you see a code in the list already, you\'re done with this step: Google made one for you.</li>' +
          '<li>If the list is empty, tap <b>' + esc(L("ai_create_key", "Create API key")) + '</b>.</li></ul>' +
          '<p><b>You can ignore</b> anything about projects, billing or "upgrade". You don\'t need any of it.</p>'; },
        stuck: ["Can't find the API Keys page? Tap Back, then tap Open Google AI Studio again: it opens the right page.", "If Google asks you to choose or name a project, pick the one it suggests, or type anything, like \"My helper\"."], guide: "ai_find" },
      { title: "Copy your code",
        body: function () { return '<p>Next to your code, tap Google\'s <b>' + esc(L("ai_copy", "Copy")) + '</b> button (it may just be a small copy icon).</p>' +
          '<p class="dd-note">Copying the whole code with Google\'s button is the safest way. Don\'t worry about what it looks like.</p>'; },
        stuck: ["If you can only see part of the code, click on it first, then copy.", "On a phone, press and hold the code, then tap Copy."], guide: "ai_copy" },
      { title: "Paste it here",
        body: '<p>Paste your code in the box, then tap <b>Connect</b>. We\'ll check it with Google straight away.</p>' +
              '<input class="dd-input" id="dd-wiz-code" placeholder="Paste your free access code" autocomplete="off" autocapitalize="off" spellcheck="false">',
        action: { label: "Connect", run: function (c) { connectFromWizard(c); } },
        mount: function (c) {
          var input = c.el.querySelector("#dd-wiz-code");
          input.addEventListener("keydown", function (e) { if (e.key === "Enter") connectFromWizard(c); });
          if (!dd.env.isPhone) input.focus();
        },
        next: false,
        stuck: ["Paste with Ctrl+V (Windows) or Cmd+V (Mac). On a phone, press and hold the box, then tap Paste.", "If it says the code didn't work, go back to Google, copy it again with Google's Copy button, and paste again."], guide: "ai_paste" },
      { title: "You're connected!",
        body: '<p class="dd-big-tick">✓</p><p>The helper is ready. Your code stays in this browser, on this device.</p>' +
              '<p class="dd-note">To use the helper on your phone too, use <b>Send to my phone</b>: it brings your code across with one scan.</p>',
        nextLabel: "Done" }
    ]
  };

  function connectFromWizard(c) {
    var input = c.el.querySelector("#dd-wiz-code"), btn = c.el.querySelector("[data-action]");
    if (btn.disabled) return;
    if (!input.value.trim()) { c.status("warn", "Paste your code in the box first."); input.focus(); return; }
    btn.disabled = true; btn.textContent = "Checking with Google…";
    c.status("info", "Checking your code with Google. This can take up to a minute when Google is busy.");
    dd.ai.connect(input.value).then(function (r) {
      btn.disabled = false; btn.textContent = "Connect";
      if (r.ok) { c.status("ok", "It works!"); setTimeout(function () { if (document.body.contains(c.el)) c.next(); }, 600); }
      else c.status("err", r.title, r.help);
    });
  }

  setup.wizards.host = { title: "Put it on your phone", ready: false, screens: [] };   // next: tiiny.host wizard
  setup.wizards.sync = { title: "Keep devices in step", ready: false, screens: [] };   // Phase 5 sync + Firebase wizard

  /* ---------- start ---------- */
  setup.start = function (p) {
    program = p;
    setup.paint();
    dd.on("ai:changed", setup.paint);
    dd.on("pair:received", setup.paint);
  };

  if (dd.diag) dd.diag.addSection("Setup", function () {
    if (!program) return ["-"];
    var st = state();
    return [setup.steps.map(function (s) { return s.title + ": " + (s.done() ? "done" : "not yet"); }).join(" · "),
            "Wizards in progress: " + (Object.keys(st.wizards).map(function (k) { return k + " at screen " + (st.wizards[k].at + 1); }).join(", ") || "none")];
  });
})();
