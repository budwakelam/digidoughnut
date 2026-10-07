/* ===== PROGRAM-SPECIFIC: Demo List =====
   A deliberately tiny program that exercises the platform: first-run example data, saving,
   a schema upgrade (v1 stored plain strings, v2 stores objects), and the friendly confirm.
   Copy this folder to start a new program. Everything not in this object comes from the platform. */
const DD_PROGRAM = {
  id: "demo",                       // lowercase letters/digits; becomes dd_demo_data_v1
  name: "Demo List",
  tagline: "A platform test program",
  version: "0.1.0",
  schemaVersion: 2,
  accent: "#2563eb",
  exampleNotice: "You're looking at an example list so you can try things out.",

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

  // Phase 4 (Penny): what the AI sees each turn, and the tools she can use. Not used yet.
  summarizeForAI(ctx) { return ctx.data.items.map((i) => `${i.id}: ${i.text}${i.done ? " (done)" : ""}`).join("\n"); },
  tools: [],
  knowledge: "",
  suggestions: []
};
