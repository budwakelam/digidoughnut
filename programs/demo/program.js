/* ===== PROGRAM-SPECIFIC: Demo List =====
   A deliberately tiny program that exercises the platform: first-run example data, saving,
   a schema upgrade (v1 stored plain strings, v2 stores objects), and the friendly confirm.
   Copy this folder to start a new program. Everything not in this object comes from the platform. */
const DD_PROGRAM = {
  id: "demo",                       // lowercase letters/digits; becomes dd_demo_data_v1
  name: "Demo List",
  tagline: "A platform test program",
  version: "0.1.7",
  schemaVersion: 2,
  accent: "#2563eb",
  dataLabel: "list",                // how the QR screen names this program's data ("your list")
  exampleNotice: "You're looking at an example list so you can try things out.",

  // The program's own menu items, shown at the top of the menu (the platform's are under Settings).
  menu: [
    { id: "clear", icon: "🧹", label: "Clear the list", run: () => document.getElementById("demoClear").click() },
    { id: "print", icon: "🖨️", label: "Print my list", run: () => window.print() }
  ],

  emptyData() { return { items: [] }; },

  exampleData() {
    return { items: [
      { id: "ex1", text: "Buy flour", done: false },
      { id: "ex2", text: "Book the market table", done: true },
      { id: "ex3", text: "Print price tags", done: false }
    ] };
  },

  // Called before any saved data is used. Return false and the platform keeps a recovery copy.
  validateData(d) {
    return !!d && Array.isArray(d.items) && d.items.every((i) =>
      i && typeof i.id === "string" && typeof i.text === "string" && typeof i.done === "boolean");
  },

  // Bring data from any older schema up to this one. fromVersion 0 = saved before envelopes existed.
  migrate(d, fromVersion) {
    let out = d || { items: [] };
    if (fromVersion < 2) {
      out = { items: (out.items || []).map((t, n) => typeof t === "string"
        ? { id: "m" + n + "_" + Date.now().toString(36), text: t, done: false } : t) };
    }
    return out;
  },

  // Runs once, after the platform frame is ready. Wire up static buttons here.
  mount(ctx) {
    const $ = ctx.ui.$;
    const add = () => {
      const box = $("demoNew"), text = box.value.trim();
      if (!text) { ctx.ui.status("demoStatus", "warn", "Type something first."); return; }
      ctx.update((d) => { d.items.push({ id: ctx.ui.uid("i"), text: text.slice(0, 120), done: false }); });
      box.value = ""; ctx.ui.clearStatus("demoStatus");
    };
    $("demoAdd").addEventListener("click", add);
    $("demoNew").addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
    $("demoPhone").addEventListener("click", () => dd.pair.open());
    $("demoClear").addEventListener("click", async () => {
      const yes = await ctx.ui.confirm("Clear the whole list?", "This removes every item. You can't undo it.", "Yes, clear it", "No, keep it", true);
      if (yes) dd.replaceData(DD_PROGRAM.emptyData(), { example: false, source: "clear" });
    });
  },

  // Draws the screen from ctx.data. Called after every change.
  render(ctx) {
    const list = ctx.ui.$("demoList"), esc = ctx.ui.esc;
    const items = ctx.data.items;
    ctx.ui.$("demoCount").textContent = items.filter((i) => !i.done).length + " to do";
    list.innerHTML = items.length ? "" : '<p class="dd-note">Nothing here yet. Add your first item above.</p>';
    items.forEach((item) => {
      const row = document.createElement("label");
      row.className = "demo-row" + (item.done ? " done" : "");
      row.innerHTML = '<input type="checkbox"' + (item.done ? " checked" : "") + '> <span>' + esc(item.text) +
                      '</span><button class="demo-x" aria-label="Remove ' + esc(item.text) + '">×</button>';
      row.querySelector("input").addEventListener("change", (e) =>
        ctx.update((d) => { d.items.find((i) => i.id === item.id).done = e.target.checked; }));
      row.querySelector(".demo-x").addEventListener("click", (e) => {
        e.preventDefault();
        ctx.update((d) => { d.items = d.items.filter((i) => i.id !== item.id); });
      });
      list.appendChild(row);
    });
  },

  // Phase 4: the helper. Where she sits, her name, and what she can do in THIS program.
  helper: {
    name: "Penny", face: "🪙", role: "your list helper",
    greeting: "Hi, I'm Penny! Tell me what to add, tick off or remove, and I'll do it for you. You can undo anything I change.",
    place: { computer: "side", phone: "inline" },   // "side" | "inline" | "bubble" | "none"
    slot: "demoHelper"                               // where the on-page card goes
  },
  knowledge: "A simple to-do list. Each item has some text and can be ticked off when it's done. 'Clear the list' removes everything. 'Send to my phone' moves the list to a phone by scanning a code.",
  summarizeForAI(ctx) {
    const items = ctx.data.items;
    if (!items.length) return "The list is empty.";
    return items.length + " items:\n" + items.map((i) => "- " + i.text + (i.done ? " (done)" : "")).join("\n");
  },
  suggestions: ["Add milk and eggs", "Tick off the first thing", "What's left to do?"],
  tools: [
    { name: "add_item", description: "Add one item to the list. Call once per item.",
      params: { text: { type: "string", description: "The item, a few words" } },
      run(args, ctx) {
        const text = String(args.text || "").trim().slice(0, 120);
        if (!text) return { ok: false, message: "No item text was given." };
        ctx.update((d) => { d.items.push({ id: ctx.ui.uid("i"), text, done: false }); });
        return { ok: true, message: "Added '" + text + "'. The list has " + ctx.data.items.length + " items now." };
      } },
    { name: "set_done", description: "Tick an item off as done, or un-tick it. Give the item's id (best), or words from its text.",
      params: { id: { type: "string", description: "The item's id, from the data", optional: true },
                text: { type: "string", description: "Words from the item's text, if you don't have the id", optional: true },
                done: { type: "boolean", description: "true = done, false = not done yet", optional: true } },
      run(args, ctx) {
        const { item, problem } = pick(ctx.data.items, args);
        if (!item) return { ok: false, message: problem };
        const done = args.done !== false;
        ctx.update((d) => { d.items.find((i) => i.id === item.id).done = done; });
        return { ok: true, message: (done ? "Ticked off '" : "Un-ticked '") + item.text + "'." };
      } },
    { name: "remove_item", description: "Remove one item from the list. Give the item's id (best), or words from its text.",
      params: { id: { type: "string", description: "The item's id, from the data", optional: true },
                text: { type: "string", description: "Words from the item's text, if you don't have the id", optional: true } },
      run(args, ctx) {
        const { item, problem } = pick(ctx.data.items, args);
        if (!item) return { ok: false, message: problem };
        ctx.update((d) => { d.items = d.items.filter((i) => i.id !== item.id); });
        return { ok: true, message: "Removed '" + item.text + "'." };
      } },
    { name: "clear_list", description: "Remove every item from the list. The person is asked to confirm first.",
      params: {},
      confirm: (args, ctx) => { const n = ctx.data.items.length; return n ? (n === 1 ? "Clear the 1 item from your list?" : "Clear all " + n + " items from your list?") : null; },
      yesLabel: "Yes, clear it",
      run(args, ctx) {
        const n = ctx.data.items.length;
        dd.replaceData(DD_PROGRAM.emptyData(), { example: false, source: "helper" });
        return { ok: true, message: "Cleared the list (" + n + " items)." };
      } }
  ]
};

/* The item an instruction means: by id if given; else exact text; else words it contains, but only
   when exactly one item matches (two "Milk" items -> ask which, never guess). */
function pick(items, args) {
  const list = () => items.map((i) => "'" + i.text + "' (id " + i.id + ")").join(", ");
  if (args.id) {
    const item = items.find((i) => i.id === String(args.id));
    return item ? { item } : { problem: "No item has the id '" + args.id + "'. Items: " + list() };
  }
  const w = String(args.text || "").trim().toLowerCase();
  if (!w) return { problem: "Say which item: give its id or words from its text. Items: " + list() };
  const exact = items.filter((i) => i.text.toLowerCase() === w);
  if (exact.length === 1) return { item: exact[0] };
  const near = exact.length ? exact : items.filter((i) => i.text.toLowerCase().includes(w) || w.includes(i.text.toLowerCase()));
  if (near.length === 1) return { item: near[0] };
  if (!near.length) return { problem: "No item matches '" + args.text + "'. Items: " + list() };
  return { problem: "More than one item matches '" + args.text + "': " + near.map((i) => "'" + i.text + "' (id " + i.id + ")").join(", ") + ". Use the id, or ask the person which one." };
}
