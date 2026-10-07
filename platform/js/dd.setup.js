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

  function inProgress(st, id) { return !!(st.wizards[id] || (id === "host" && (st.wizards.host_neocities || st.wizards.host_tiiny))); }
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
      var btn = done && s.id === "phone" && needsHomeScreen() ? '<button class="dd-btn small" data-home>Add to Home Screen</button>'
        : done && s.id === "phone" && dd.env.isPhone ? ""
        : done && s.id === "phone" && dd.pair ? '<button class="dd-btn small ghost" data-phone>📲 Send to my phone</button>' : done
        ? (wiz && wiz.ready !== false && s.id !== "try" ? '<button class="dd-linkbtn" data-start="' + s.wizard + '">Change</button>' : "")
        : (wiz && wiz.ready !== false ? '<button class="dd-btn small" data-start="' + s.wizard + '">' + (inProgress(st, s.wizard) ? "Continue" : "Start") + '</button>'
                                      : '<span class="dd-note">Coming soon</span>');
      return '<li class="dd-step' + (done ? " done" : "") + '"><span class="dd-tick" aria-hidden="true">' + (done ? "✓" : i + 1) + '</span>' +
        '<div class="dd-step-text"><b>' + esc(s.title) + '</b><span>' + esc(s.gives) + (done ? "" : " · " + esc(s.time)) + '</span></div>' + btn + '</li>';
    }).join("");
    host.innerHTML = '<div class="dd-card dd-setup-card"><h2>Set up ' + esc(program.name) + ' <span class="dd-setup-count">' + n + ' of ' + total + ' done</span></h2>' +
      '<p class="dd-note" style="margin:0 0 8px">Each step is optional. Do them in any order, any time.</p><ol class="dd-steps">' + rows + '</ol>' +
      '<div class="dd-btnrow"><button class="dd-linkbtn" id="dd-setup-fold">Hide this for now</button></div></div>';
    var ph = host.querySelector("[data-phone]"); if (ph) ph.addEventListener("click", function () { dd.pair.open(); });
    var hs = host.querySelector("[data-home]"); if (hs) hs.addEventListener("click", function () { setup.showHomeScreen(); });
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
    // "Put it on your phone" picks up inside whichever service the buyer already chose.
    if (id === "host") {
      var hs = state(), only = hostChoice();
      if (only) id = "host_" + only;
      else if (hs.hostWith && hs.wizards["host_" + hs.hostWith]) id = "host_" + hs.hostWith;
    }
    var wiz = setup.wizards[id]; if (!wiz || wiz.ready === false || !wiz.screens.length) return;
    var st = state(), at = (st.wizards[id] && st.wizards[id].at) || 0;
    if (at >= wiz.screens.length) at = 0;
    cur = { id: id, wiz: wiz, at: at, context: opts && opts.context };
    draw();
  };
  // Screen 1 isn't progress: only remember a place once the buyer has moved past it.
  function remember() { var s = state(); if (cur.at > 0 || (cur.wiz.parent && !hostChoice())) s.wizards[cur.id] = { at: cur.at }; else delete s.wizards[cur.id]; saveState(s); }
  function finish() { var s = state(); delete s.wizards[cur.id]; saveState(s); }

  function draw() {
    var wiz = cur.wiz, sc = wiz.screens[cur.at], total = wiz.screens.length;
    remember();
    // A wizard reached from a chooser (wiz.parent) counts the chooser as its step 1.
    var parent = wiz.parent && !hostChoice() ? wiz.parent : null;
    var off = parent ? 1 : 0, shownAt = cur.at + off, shownTotal = total + off;
    var dots = Array.apply(null, Array(shownTotal)).map(function (_, i) { return '<i class="' + (i < shownAt ? "done" : i === shownAt ? "now" : "") + '"></i>'; }).join("");
    var canBack = cur.at > 0 || !!parent;
    var body = typeof sc.body === "function" ? sc.body() : sc.body;
    var html =
      '<div class="dd-wiz-top"><span class="dd-wiz-name">' + esc(wiz.title) + '</span><span class="dd-wiz-progress">' + (shownTotal > 1 ? 'Step ' + (shownAt + 1) + ' of ' + shownTotal : '') + '</span></div>' +
      '<div class="dd-wiz-dots">' + dots + '</div>' +
      (cur.context && cur.at === 0 ? '<p class="dd-status show info">' + esc(cur.context) + '</p>' : "") +
      '<h2>' + esc(sc.title) + '</h2><div class="dd-wiz-body">' + body + '</div>' +
      (sc.action ? '<div class="dd-btnrow"><button class="dd-btn dd-wiz-big" data-action>' + esc(sc.action.label) + '</button></div>' : "") +
      '<div class="dd-status" id="dd-wiz-status"></div>' +
      '<div class="dd-wiz-nav">' +
        (canBack ? '<button class="dd-btn ghost" data-back>Back</button>' : "") +
        (sc.next !== false ? '<button class="dd-btn" data-next>' + esc(sc.nextLabel || "Next") + '</button>' : "") +
      '</div>' +
      '<div class="dd-wiz-help">' +
        '<button class="dd-linkbtn" data-stuck>I\'m stuck</button>' +
        '<button class="dd-linkbtn" data-ask>Ask a question</button>' +
        (canBack ? '<button class="dd-linkbtn" data-over>Start over</button>' : "") +
        '<button class="dd-linkbtn" data-later>Finish later</button>' +
      '</div>' +
      '<div class="dd-wiz-stuck" id="dd-wiz-stuck" hidden></div>' +
      '<div class="dd-wiz-ask" id="dd-wiz-ask" hidden></div>';
    var sh = dd.ui.sheet(html, { onClose: function () { setup.paint(); } });
    sh.classList.add("dd-wiz");

    var q = function (sel) { return sh.querySelector(sel); };
    if (q("[data-back]")) q("[data-back]").addEventListener("click", function () { if (cur.at > 0) { cur.at--; draw(); } else toParent(); });
    if (q("[data-over]")) q("[data-over]").addEventListener("click", function () { if (parent) toParent(); else { cur.at = 0; draw(); } });
    q("[data-later]").addEventListener("click", function () { dd.ui.closeSheet(); dd.ui.toast("Saved. Tap Continue in the setup card to pick up here."); });
    if (q("[data-action]")) q("[data-action]").addEventListener("click", function () { sc.action.run(ctxFor(sh)); });
    if (q("[data-next]")) q("[data-next]").addEventListener("click", function () { next(sh); });
    q("[data-stuck]").addEventListener("click", function () { toggleStuck(sh, sc); });
    q("[data-ask]").addEventListener("click", function () { toggleAsk(sh); });
    if (sc.mount) sc.mount(ctxFor(sh));
  }

  /* Leave a sub-wizard for its chooser (e.g. pick a different service). Its place is forgotten. */
  function toParent() {
    var s = state(), parent = cur.wiz.parent; delete s.wizards[cur.id]; s.hostWith = null; saveState(s);
    setup.open(parent);
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
    { keys: ["tiiny", "tiny host", "neocities", "hosting", "online", "upload", "address", "link", "website"], a: "Neocities or tiiny.host puts your program online for free, so your phone can open it. Your numbers and your code are never uploaded: they stay on your own devices." },
    { keys: ["which one", "neocities or", "difference", "better", "choose", "pick"], a: "Pick Neocities if you're not sure. One free Neocities account holds all your DigiDoughnut programs and shows no ads. tiiny.host holds one program per free account." },
    { keys: ["username", "user name"], a: "On Neocities, your username becomes your web address: username.neocities.org. Letters, numbers and hyphens only. Anything you like, for example yourname-tools." },
    { keys: ["supporter", "5 a month", "card number", "plan"], a: "Pick Free and tap Continue. You don't need the Supporter plan, and you never need to enter a card." },
    { keys: ["confirmation", "token", "email code", "didn t get", "no email"], a: "Neocities emails you a code: paste it into Email Confirmation Token and tap Confirm Email. No email? Check spam, or tap Resend Confirmation Email." },
    { keys: ["3 months", "expire", "taken down", "stay online", "disappear", "how long does it stay", "how long will it stay"], a: "On tiiny.host's free plan the page stays online as long as you log in to tiiny.host at least once every 3 months." },
    { keys: ["update", "new version", "upgrade"], a: "To put a new version online, log in to tiiny.host and use Update on the same project. That keeps the same address, so your numbers stay." },
    { keys: ["trial", "free trial", "solo"], a: "You don't need tiiny.host's free trial: tap Skip. The trial turns into a paid plan, and the free plan is all this program needs." },
    { keys: ["home screen", "icon", "app", "bookmark", "shortcut"], a: "Bookmark it on your computer and add it to your Home Screen on your phone. Then it opens like an app, always from the same address, so your numbers are always there." },
    { keys: ["phone", "iphone", "android", "mobile"], a: "Setting up the helper is easiest on a computer. Once it works, Send to my phone moves it over by scanning a code." }
  ];
  setup.suggestQuestions = function (wizardId) {
    if (/^host_neo/.test(wizardId || "")) return ["Which username?", "Do I need Supporter?", "No email came"];
    if (/^host/.test(wizardId || "")) return ["Is it really free?", "Do I need the free trial?", "How long does it stay online?"];
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

  /* ---------- "Put it on your phone" ----------
     The program file has to be online before a phone can open it. Two free services, checked
     with Oran 2026-10-07:
     - Neocities (first choice): one free account holds every DigiDoughnut program, no banner,
       no ads. Sign up = Username (becomes <name>.neocities.org) + Password + Email + "I am
       human" + "Create My Site"; then a plan page (Free -> "Continue"; Supporter has card boxes);
       then "Check your Email" (Email Confirmation Token -> "Confirm Email"); dashboard has
       "Upload". A file keeps its address: <name>.neocities.org/<file name>.
     - tiiny.host: 1 project per free account, small banner, log in every 3 months, a
       "Start your free trial" popup whose way out is "Skip"; "Upload file", "Update".
     Either way, the last steps carry the code + numbers from the file to the new address in one
     link (dd.pair), then bookmark it (the page title is the bookmark name). */
  function fileName() {
    try { return decodeURIComponent(location.pathname.split("/").pop()) || "the program file"; } catch (e) { return "the program file"; }
  }
  function hostState(v) { var s = state(); if (v !== undefined) { s.hostUrl = v; saveState(s); } return s.hostUrl || ""; }
  /* Tidy a pasted address. Returns a full https address, or null if it isn't one. */
  setup.cleanAddress = function (raw) {
    var t = String(raw || "").trim().replace(/^["'<]+|["'>]+$/g, "");
    if (!t) return null;
    if (!/^[a-z]+:\/\//i.test(t)) t = "https://" + t;
    try {
      var u = new URL(t);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      if (!/\./.test(u.hostname) || /\s/.test(t)) return null;
      u.hash = "";
      return u.href;
    } catch (e) { return null; }
  };
  /* Neocities: a username (or a pasted address) -> https://<name>.neocities.org/<this file's name> */
  setup.neocitiesAddress = function (raw) {
    var t = String(raw || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.neocities\.org$/, "");
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(t)) return null;
    return "https://" + t + ".neocities.org/" + encodeURIComponent(fileName());
  };

  var facts = '<ul class="dd-facts"><li>✓ Free. No credit card.</li><li>✓ About 5 minutes.</li><li>✓ Your numbers and your code are never uploaded.</li></ul>';
  var publicNote = '<p class="dd-note">The page itself can be opened by anyone who has its address, like a shared link. What you type into it stays on each of your own devices.</p>';
  function phoneWarn() { return dd.env.isPhone ? '<p class="dd-status show warn">Do this step on the computer where you saved the program file. Then come back to your phone at the end.</p>' : ""; }

  /* Which services the wizard offers. Neocities is PARKED (2026-10-07): its free plan sends
     "connect-src 'self'", so a page there can't reach Google, Firebase or the noticeboard.
     Seen on Oran's site; the helper said "no internet". Its wizard stays below for a paid plan
     or a policy change, but isn't offered. When only one service is offered, the choice screen
     is skipped. */
  setup.hostChoices = ["tiiny"];
  function hostChoice() { return setup.hostChoices.length === 1 ? setup.hostChoices[0] : null; }

  /* Screen 1, shared: why, then pick a service. */
  setup.wizards.host = {
    title: "Put it on your phone",
    screens: [
      { title: "Put it online, for free",
        body: function () { return '<p>Your phone can\'t open a file that lives on this computer. So first we put the program online, at its own web address, using a free service.</p>' +
          facts + phoneWarn() +
          '<div class="dd-choice">' +
            '<button class="dd-choice-btn" data-host="neocities"><b>Neocities</b><span>Recommended. One free account holds all your DigiDoughnut programs. No ads.</span></button>' +
            '<button class="dd-choice-btn" data-host="tiiny"><b>tiiny.host</b><span>Also free, but holds one program per account.</span></button>' +
          '</div>' + publicNote; },
        mount: function (c) {
          c.el.querySelectorAll("[data-host]").forEach(function (b) { b.addEventListener("click", function () {
            var s = state(); s.hostWith = b.dataset.host; saveState(s);
            setup.open("host_" + b.dataset.host);
          }); });
        },
        next: false }
    ]
  };

  /* The last three screens, shared by both services. */
  function finishScreens(svc) {
    return [
      { title: "Move your setup across",
        body: function () {
          var url = hostState(), host = url; try { host = new URL(url).host + new URL(url).pathname; } catch (e) {}
          return '<p>Tap the button. Your program opens at <b>' + esc(host) + '</b>' + (dd.ai && dd.ai.hasCode() ? ', with your free access code' : '') +
            (dd.isExample && !dd.isExample() ? ' and your numbers' : '') + ' already in it.</p>' +
            '<p class="dd-note">The button works for 10 minutes. If it runs out, just tap it again.</p>'; },
        action: { label: "Open my program at its new address", run: function (c) {
          var made = dd.pair.makeLink({ base: hostState(), includeCode: true, maxLink: 60000 });
          c.open(made.link);
          c.status(made.left.length ? "warn" : "ok", made.left.length ? "Opened. Your " + made.left.join(" and ") + " were too big to carry, so they stay here for now." : "Opened in a new tab. Check it, then come back here and tap Next.");
        } },
        stuck: ["Nothing opened? Your browser may have blocked the new tab. Allow pop-ups for this page, or tap the button again.",
                svc === "neocities" ? "Page not found? Check the upload finished, and that your username is right: tap Back to fix it."
                                    : "If the new page looks empty, check the address you pasted: tap Back and fix it."], guide: "host_move" },
      { title: "Bookmark it and keep it",
        body: function () { return '<p class="dd-big-tick">✓</p><p>In the new tab, <b>bookmark the page</b> (Ctrl+D on Windows, Cmd+D on a Mac). Name the bookmark:</p>' +
          '<p class="dd-filename">' + esc(setup.bookmarkName()) + '</p>' +
          '<p>From now on, always open the program from that bookmark.</p>' +
          '<ul><li><b>Same address, same numbers.</b> A different address, or the file on this computer, starts with its own separate numbers.</li>' +
          (svc === "tiiny"
            ? '<li><b>Log in to tiiny.host at least once every 3 months.</b> That keeps your free page online.</li>' +
              '<li><b>Getting an update?</b> On tiiny.host, use <b>' + esc(L("host_update", "Update")) + '</b> on this same project. Don\'t upload it as a new one.</li>'
            : '<li><b>Getting an update?</b> Upload the new file to Neocities with the <b>same file name</b>. It replaces the old one and keeps the same address.</li>') +
          '</ul>' +
          '<p>Last step: in the new tab, open the setup card and tap <b>Send to my phone</b>. On your phone, add it to your Home Screen when it asks.</p>' +
          (svc === "tiiny" ? '<p class="dd-note">You can ignore the small tiiny.host banner on your page.</p>' : ""); },
        nextLabel: "Done" }
    ];
  }

  setup.wizards.host_neocities = {
    title: "Put it on your phone · Neocities", parent: "host",
    onDone: function () { dd.ui.toast("Use your new address from now on. Bookmark it!", 4500); },
    screens: [
      { title: "Make a free Neocities account",
        body: function () { return '<p>Tap the button. Neocities opens in a new tab. Under <b>' + esc(L("neo_signup", "Sign up for free")) + '</b>:</p>' +
          '<ul><li><b>Username</b>: this becomes your web address, like <i>yourname</i>.neocities.org. Letters, numbers and hyphens only. Write it down.</li>' +
          '<li><b>Password</b> and <b>Email</b>.</li>' +
          '<li>Tick <b>' + esc(L("neo_human", "I am human")) + '</b>. It may ask you to tap a picture: that\'s normal.</li>' +
          '<li>Tap <b>' + esc(L("neo_create", "Create My Site")) + '</b>.</li></ul>' +
          '<p><b>You can ignore</b> Tags. Leave it empty.</p>' + phoneWarn(); },
        action: { label: "Open Neocities", run: function (c) { c.open(link("host_neocities", "https://neocities.org/")); } },
        stuck: ["Already have a Neocities account? Tap Sign In at the top right, then skip ahead with Next.",
                "Username taken? Try adding a word or a number, like yourname-tools."], guide: "neo_signup" },
      { title: "Pick the free plan",
        body: function () { return '<p>Neocities shows two plans. Under <b>Free</b>, tap <b>' + esc(L("neo_free_continue", "Continue")) + '</b>.</p>' +
          '<p><b>You can ignore</b> the Supporter plan and its card boxes. You don\'t need them.</p>'; },
        stuck: ["Didn't see the plans? That's fine. Tap Next."], guide: "neo_plan" },
      { title: "Confirm your email",
        body: function () { return '<p>Neocities emails you a code. Open that email, copy the code, paste it into <b>' + esc(L("neo_token", "Email Confirmation Token")) + '</b>, and tap <b>' + esc(L("neo_confirm", "Confirm Email")) + '</b>.</p>' +
          '<p><b>You can ignore</b> the rules box above it. This program is your own private tool, which is fine there.</p>'; },
        stuck: ["No email after a few minutes? Check your spam folder, or tap Resend Confirmation Email."], guide: "neo_email" },
      { title: "Upload this program",
        body: function () { return '<p>Go to your Neocities <b>dashboard</b>. (If you see a page about learning to make websites, tap <b>' + esc(L("neo_dashboard", "Head to your dashboard")) + '</b>.)</p>' +
          '<p>Tap <b>' + esc(L("neo_upload", "Upload")) + '</b> and choose this file:</p>' +
          '<p class="dd-filename">' + esc(fileName()) + '</p>' +
          '<p class="dd-note">It\'s wherever you saved it from Etsy, often the Downloads folder.</p>' +
          '<p><b>You can ignore</b> index.html and the other files Neocities made for you. Leave them alone.</p>'; },
        stuck: ["Can't find the file? On Windows, open File Explorer and look in Downloads. On a Mac, open Finder and look in Downloads.",
                "Don't rename the file. Its name becomes part of its address."], guide: "neo_upload" },
      { title: "Your Neocities username",
        body: function () { var s = state(); return '<p>Type the username you picked when you signed up.</p>' +
          '<input class="dd-input" id="dd-wiz-addr" placeholder="e.g. smith-tools" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(s.neoUser || "") + '">' +
          '<p class="dd-note">It\'s at the top right of Neocities, and in your site\'s address: <i>username</i>.neocities.org.</p>'; },
        mount: function (c) { var i = c.el.querySelector("#dd-wiz-addr"); if (!dd.env.isPhone && !i.value) i.focus(); },
        check: function (c) {
          var raw = c.el.querySelector("#dd-wiz-addr").value, url = setup.neocitiesAddress(raw);
          if (!url) { c.status("warn", "Type your Neocities username first.", "Letters, numbers and hyphens only, like smith-tools."); return false; }
          var s = state(); s.neoUser = raw.trim(); saveState(s);
          hostState(url); return true;
        },
        guide: "neo_address" }
    ].concat(finishScreens("neocities"))
  };

  setup.wizards.host_tiiny = {
    title: "Put it on your phone · tiiny.host", parent: "host",
    onDone: function () { dd.ui.toast("Use your new address from now on. Bookmark it!", 4500); },
    screens: [
      { title: "Open tiiny.host and sign up",
        body: function () { return (hostChoice() ? '<p>Your phone can\'t open a file that lives on this computer. So first we put the program online, at its own web address, using a free service called <b>tiiny.host</b>.</p>' + facts + publicNote : "") +
          '<p>Tap the button. tiiny.host opens in a new tab. Sign up for free, with your email or your Google account.</p>' +
          '<p>If tiiny.host offers a free trial, tap <b>' + esc(L("host_skip_trial", "Skip")) + '</b>. You don\'t need it.</p>' +
          '<p><b>You can ignore</b> anything about upgrading, custom domains, analytics or teams.</p>' + phoneWarn(); },
        action: { label: "Open tiiny.host", run: function (c) { c.open(link("host_open", "https://tiiny.host/")); } },
        stuck: ["Already have a tiiny.host account? Just log in.", "If a big \"Start free trial\" button appears, look below it for Skip. The trial turns into a paid plan, so skip it."], guide: "host_open" },
      { title: "Upload this program",
        body: function () { return '<p>On tiiny.host, tap <b>' + esc(L("host_upload", "Upload file")) + '</b> and choose this file:</p>' +
          '<p class="dd-filename">' + esc(fileName()) + '</p>' +
          '<p class="dd-note">It\'s wherever you saved it from Etsy, often the Downloads folder.</p>' +
          '<p><b>You can ignore</b> options for passwords, domains or names. The address tiiny.host picks is fine.</p>'; },
        stuck: ["Can't find the file? On Windows, open File Explorer and look in Downloads. On a Mac, open Finder and look in Downloads.",
                "If tiiny.host says you've used your free project, the free plan holds one program at a time. Contact DigiDoughnut and we'll help."], guide: "host_upload" },
      { title: "Copy your new address",
        body: function () { return '<p>When the upload finishes, tiiny.host shows your program\'s new address. It ends in <b>.tiiny.site</b>. Copy it, then paste it here.</p>' +
          '<input class="dd-input" id="dd-wiz-addr" placeholder="e.g. something-12.tiiny.site" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(hostState()) + '">'; },
        mount: function (c) { var i = c.el.querySelector("#dd-wiz-addr"); if (!dd.env.isPhone && !i.value) i.focus(); },
        check: function (c) {
          var url = setup.cleanAddress(c.el.querySelector("#dd-wiz-addr").value);
          if (!url) { c.status("warn", "Paste your new address first.", "It looks something like something-12.tiiny.site."); return false; }
          if (url.split("#")[0] === location.href.split("#")[0]) { c.status("warn", "That's the address of this page.", "Paste the new address that tiiny.host gave you."); return false; }
          hostState(url); return true;
        },
        stuck: ["On tiiny.host, the address is shown as a link. Copy it, or click the link and copy the address from the top of your browser.", "It's also listed under Live Projects when you log in to tiiny.host."], guide: "host_address" }
    ].concat(finishScreens("tiiny"))
  };

  setup.wizards.sync = { title: "Keep devices in step", ready: false, screens: [] };   // Phase 5 sync + Firebase wizard

  /* ---------- bookmark name + Home Screen ----------
     Phones: a page added to the Home Screen opens like an app, and iPhones keep its saved
     numbers. Safari (and Chrome on iPhone, which uses Safari's engine) can clear a website's
     saved data when it hasn't been opened for about a week, unless it's on the Home Screen. */
  setup.bookmarkName = function () { return (program ? program.name : "My program") + " · DigiDoughnut"; };
  setup.homeScreenSteps = function () {
    if (dd.env.isIOS) return ["Tap the <b>Share</b> button (a square with an arrow pointing up). In Safari it's at the bottom of the screen; in Chrome it's at the top, next to the address.",
                              "Scroll down and tap <b>" + esc(L("home_ios_add", "Add to Home Screen")) + "</b>.",
                              "Keep the name <b>" + esc(program ? program.name : "") + "</b>, then tap <b>" + esc(L("home_ios_confirm", "Add")) + "</b>."];
    return ["Tap the browser menu (the three dots <b>⋮</b>, top right).",
            "Tap <b>" + esc(L("home_android_add", "Add to Home screen")) + "</b> (some phones say <b>Install app</b>).",
            "Keep the name <b>" + esc(program ? program.name : "") + "</b>, then tap <b>" + esc(L("home_android_confirm", "Add")) + "</b>."];
  };
  setup.showHomeScreen = function (arrived) {
    // Shown right after a QR scan: say what arrived here, instead of a toast on top of the sheet.
    var old = document.querySelector(".dd-toast"); if (old) old.remove();
    var got = arrived && arrived.got && arrived.got.length ? '<p class="dd-status show ok">✓ Your ' + esc(arrived.got.join(" and ")) + ' came across from your computer.</p>' : "";
    var sh = dd.ui.sheet(got + '<h2>Add it to your Home Screen</h2>' +
      '<p>Then it opens like an app, and your phone keeps your numbers safe.</p>' +
      '<ol class="dd-home-steps">' + setup.homeScreenSteps().map(function (t) { return "<li>" + t + "</li>"; }).join("") + '</ol>' +
      (dd.env.isIOS ? '<p class="dd-note">Why it matters: an iPhone can clear a website\'s saved data if you don\'t open it for about a week. Programs on the Home Screen are kept.</p>' : "") +
      '<p class="dd-note">From now on, open it from the Home Screen icon.</p>' +
      '<div class="dd-btnrow"><button class="dd-btn" data-close>Got it</button></div>');
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    var s = state(); s.homeShown = Date.now(); saveState(s);
  };
  function needsHomeScreen() { return dd.env.isPhone && dd.env.isHosted && !dd.env.isStandalone; }

  /* ---------- start ---------- */
  setup.start = function (p) {
    program = p;
    setup.paint();
    dd.on("ai:changed", setup.paint);
    dd.on("pair:received", function (ev) {
      setup.paint();
      // Just arrived on the phone by QR: the best moment to add it to the Home Screen.
      if (needsHomeScreen()) setTimeout(function () { setup.showHomeScreen(ev); }, 600);
    });
  };

  if (dd.diag) dd.diag.addSection("Setup", function () {
    if (!program) return ["-"];
    var st = state();
    return [setup.steps.map(function (s) { return s.title + ": " + (s.done() ? "done" : "not yet"); }).join(" · "),
            "Wizards in progress: " + (Object.keys(st.wizards).map(function (k) { return k + " at screen " + (st.wizards[k].at + 1); }).join(", ") || "none")];
  });
})();
