// Weekly Planner — Vanilla JS
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const DEFAULTS = {
  startHour: 6,
  endHour: 22,
  workTarget: 38.5,
  categories: [
    { name: "Sleep", color: "#bef264" },
    { name: "Children", color: "#fca5a5" },
    { name: "Commute", color: "#a5b4fc" },
    { name: "Work", color: "#60a5fa" },
    { name: "Training", color: "#fbbf24" },
    { name: "Meals", color: "#34d399" },
    { name: "Focus (Thesis/Business)", color: "#f472b6" }
  ],
  blocks: []
};

let state = loadState();
init();

function init() {
  renderTimeColumn();
  renderDays();
  setupModals();
  syncSettingsUI();
  updateSummary();
  renderBlocks();
  bindControls();
}

function loadState() {
  const raw = localStorage.getItem("weekly-planner-state-v1");
  if (!raw) return structuredClone(DEFAULTS);
  try {
    const parsed = JSON.parse(raw);
    // if missing keys, merge defaults
    return {
      ...structuredClone(DEFAULTS),
      ...parsed,
      categories: parsed.categories || DEFAULTS.categories,
      blocks: parsed.blocks || []
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function saveState() {
  localStorage.setItem("weekly-planner-state-v1", JSON.stringify(state));
}

function bindControls() {
  $("#addBlockBtn").addEventListener("click", () => openBlockModal());
  $("#categoriesBtn").addEventListener("click", () => openCategoriesModal());
  $("#settingsBtn").addEventListener("click", () => openSettingsModal());
  $("#exportBtn").addEventListener("click", exportJSON);
  $("#importInput").addEventListener("change", importJSON);
  $("#clearBtn").addEventListener("click", () => {
    if (confirm("Clear all blocks?")) {
      state.blocks = [];
      saveState();
      renderBlocks();
      updateSummary();
    }
  });

  // Click to add block with prefilled day/time
  $$(".dayCol.day").forEach(col => {
    col.addEventListener("click", (e) => {
      const rect = col.getBoundingClientRect();
      const y = e.clientY - rect.top + col.scrollTop;
      const minutesFromStart = Math.round(y / 2); // 2px per minute (60px per hour -> 1px per min would be 60px; we use 2px/min)
      const startMin = Math.max(0, minutesFromStart - 30); // prefill 30 min earlier
      const startTime = minutesToHHMM(state.startHour * 60 + startMin);
      const endTime = minutesToHHMM(state.startHour * 60 + startMin + 60);
      openBlockModal({
        day: Number(col.dataset.day),
        start: startTime,
        end: endTime
      });
    });
  });
}

function renderTimeColumn() {
  const timeCol = $("#timeColumn");
  timeCol.innerHTML = "";
  const totalHours = state.endHour - state.startHour;
  for (let h = state.startHour; h < state.endHour; h++) {
    const d = document.createElement("div");
    d.className = "timeLabel";
    d.style.height = "60px"; // 60px per hour -> 1px per min, grid background is every 30px
    d.textContent = `${String(h).padStart(2,"0")}:00`;
    timeCol.appendChild(d);
  }
}

function renderDays() {
  // Set min-height based on hours
  const body = $("#calendar");
  const totalMinutes = (state.endHour - state.startHour) * 60;
  const px = totalMinutes * 2; // 2px per minute
  $$(".dayCol.day", body).forEach(col => {
    col.style.minHeight = px + "px";
  });
}

function setupModals() {
  // Block modal
  const modal = $("#blockModal");
  const form = $("#blockForm");
  $("#cancelBlock").onclick = () => hide(modal);
  form.addEventListener("submit", onSaveBlock);
  $("#deleteBlock").onclick = onDeleteBlock;

  // Categories modal
  $("#closeCategories").onclick = () => hide($("#categoriesModal"));

  // Settings modal
  $("#cancelSettings").onclick = () => hide($("#settingsModal"));
  $("#saveSettings").onclick = saveSettingsFromUI;
}

function openBlockModal(prefill = null, blockId = null) {
  const modal = $("#blockModal");
  $("#modalTitle").textContent = blockId ? "Edit Block" : "Add Block";
  $("#deleteBlock").classList.toggle("hidden", !blockId);
  modal.dataset.editId = blockId || "";

  // Populate categories select
  const sel = $("#categorySelect");
  sel.innerHTML = "";
  state.categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });

  // Defaults
  $("#titleInput").value = prefill?.title || (prefill?.category || "");
  $("#categorySelect").value = prefill?.category || state.categories[0]?.name || "Work";
  $("#newCategory").value = "";
  $("#newCategoryColor").value = "#3b82f6";
  // days
  $$("input[name='days']").forEach(cb => cb.checked = false);
  if (prefill?.day != null) {
    $$("input[name='days']").find(cb => Number(cb.value) === prefill.day).checked = true;
  }
  $("#startInput").value = prefill?.start || "09:00";
  $("#endInput").value = prefill?.end || "10:00";
  $("#coreWork").checked = !!prefill?.coreWork;
  $("#altFocus").checked = !!prefill?.altFocus;

  show(modal);
}

function onSaveBlock(e) {
  e.preventDefault();
  const editId = $("#blockModal").dataset.editId;
  const title = $("#titleInput").value.trim();
  let category = $("#categorySelect").value;
  const newCat = $("#newCategory").value.trim();
  const newCatColor = $("#newCategoryColor").value;
  const start = $("#startInput").value;
  const end = $("#endInput").value;
  const coreWork = $("#coreWork").checked;
  const altFocus = $("#altFocus").checked;
  const days = $$("input[name='days']:checked").map(cb => Number(cb.value));

  if (!title || !start || !end || days.length === 0) {
    alert("Please fill title, pick at least one day, start and end time.");
    return;
  }
  // Optional new category
  if (newCat) {
    // Only add if unique
    if (!state.categories.find(c => c.name.toLowerCase() === newCat.toLowerCase())) {
      state.categories.push({ name: newCat, color: newCatColor });
    }
    category = newCat;
  }

  const objs = days.map(d => ({
    id: editId || cryptoId(),
    title, category, day: d, start, end, coreWork, altFocus
  }));

  if (editId) {
    // Replace the matching id, but only one day; for multi-day edit, create separate?
    const idx = state.blocks.findIndex(b => b.id === editId);
    if (idx >= 0) state.blocks.splice(idx, 1);
    // When editing, if multiple days selected, create multiple new blocks (cloned)
  } 
  // Remove any duplicates with same id (if edit produced multiple days)
  state.blocks = state.blocks.filter(b => b.id !== (editId || ""));
  state.blocks.push(...objs.map((o,i)=> ({...o, id: editId ? (i===0? editId : cryptoId()) : o.id })));

  saveState();
  hide($("#blockModal"));
  renderBlocks();
  updateSummary();
  openCategoriesModal(true); // refresh list silently
}

function onDeleteBlock() {
  const editId = $("#blockModal").dataset.editId;
  if (!editId) return;
  if (!confirm("Delete this block?")) return;
  state.blocks = state.blocks.filter(b => b.id !== editId);
  saveState();
  hide($("#blockModal"));
  renderBlocks();
  updateSummary();
}

function openCategoriesModal(silent=false) {
  const modal = $("#categoriesModal");
  const list = $("#categoryList");
  list.innerHTML = "";
  state.categories.forEach((c, idx) => {
    const row = document.createElement("div");
    row.className = "catItem";
    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = c.color;
    const name = document.createElement("div");
    name.textContent = c.name;
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = c.color;
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.className = "danger";
    delBtn.onclick = () => {
      if (!confirm(`Delete category '${c.name}'? Blocks keep their label but color may reset.`)) return;
      state.categories.splice(idx, 1);
      saveState();
      openCategoriesModal(true);
      renderBlocks();
      updateSummary();
    };
    colorInput.oninput = () => {
      c.color = colorInput.value;
      saveState();
      renderBlocks();
      updateSummary();
    };
    row.append(sw, name, colorInput, delBtn);
    list.appendChild(row);
  });
  if (!silent) show(modal);
}

function openSettingsModal() {
  $("#startHour").value = state.startHour;
  $("#endHour").value = state.endHour;
  $("#workTarget").value = state.workTarget;
  show($("#settingsModal"));
}

function saveSettingsFromUI() {
  const sh = Number($("#startHour").value);
  const eh = Number($("#endHour").value);
  const wt = Number($("#workTarget").value);
  if (!(sh>=0 && sh<24 && eh>0 && eh<=24 && eh>sh)) {
    alert("Please set valid day start/end hours.");
    return;
  }
  state.startHour = sh;
  state.endHour = eh;
  state.workTarget = wt || 38.5;
  saveState();
  hide($("#settingsModal"));
  renderTimeColumn();
  renderDays();
  renderBlocks();
  updateSummary();
  syncSettingsUI();
}

function syncSettingsUI() {
  $("#workTargetLabel").textContent = `${state.workTarget.toFixed(1)} h`;
}

function renderBlocks() {
  $$(".dayCol.day").forEach(col => col.innerHTML = "");
  const minutePx = 2;
  const dayStartMin = state.startHour * 60;
  state.blocks.forEach(b => {
    const col = $(`.dayCol.day[data-day="${b.day}"]`);
    if (!col) return;
    const startM = hhmmToMinutes(b.start);
    const endM = hhmmToMinutes(b.end);
    const top = (startM - dayStartMin) * minutePx;
    const height = Math.max(10, (endM - startM) * minutePx);
    const div = document.createElement("div");
    div.className = "block";
    const cat = state.categories.find(c => c.name === b.category);
    div.style.background = (cat?.color || "#ddd");
    div.style.top = `${top}px`;
    div.style.height = `${height}px`;
    div.dataset.id = b.id;
    div.innerHTML = `
      <div class="title">${escapeHtml(b.title || b.category)}</div>
      <div class="meta">${b.start}–${b.end} • ${escapeHtml(b.category)}${b.coreWork ? " • core" : ""}${b.altFocus ? " • alt" : ""}</div>
    `;
    div.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditBlock(b);
    });
    col.appendChild(div);
  });
}

function openEditBlock(b) {
  openBlockModal({
    title: b.title,
    category: b.category,
    day: b.day,
    start: b.start,
    end: b.end,
    coreWork: b.coreWork,
    altFocus: b.altFocus
  }, b.id);
  // Check appropriate day
  $$("input[name='days']").forEach(cb => cb.checked = (Number(cb.value) === b.day));
}

function updateSummary() {
  const minsByCatDay = {}; // {cat: [d0..d6]}
  const workCoreAlt = { core: 0, alt: 0 };
  for (const b of state.blocks) {
    const dur = hhmmToMinutes(b.end) - hhmmToMinutes(b.start);
    if (!minsByCatDay[b.category]) minsByCatDay[b.category] = [0,0,0,0,0,0,0];
    minsByCatDay[b.category][b.day] += Math.max(0, dur);
    if (b.category.toLowerCase() === "work") {
      if (b.coreWork) workCoreAlt.core += Math.max(0, dur);
      if (b.altFocus) workCoreAlt.alt += Math.max(0, dur);
    }
  }
  const cats = Object.keys(minsByCatDay).sort();
  // Build table
  const wrap = $("#summary");
  wrap.innerHTML = "";
  const table = document.createElement("table");
  table.className = "sumTable";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Category</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th><th>Week</th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  let totalWork = 0;
  cats.forEach(cat => {
    const tr = document.createElement("tr");
    const mins = minsByCatDay[cat];
    const week = mins.reduce((a,b)=>a+b,0);
    if (cat.toLowerCase() === "work") totalWork = week;
    tr.innerHTML = `<td>${escapeHtml(cat)}</td>` + mins.map(m => `<td>${(m/60).toFixed(1)}</td>`).join("") + `<td>${(week/60).toFixed(1)}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  // Work progress
  const pct = Math.min(100, (totalWork/60) / state.workTarget * 100);
  $("#workProgress").style.width = pct + "%";
  $("#coreWorkSum").textContent = (workCoreAlt.core/60).toFixed(1) + " h";
  $("#altFocusSum").textContent = (workCoreAlt.alt/60).toFixed(1) + " h";
}

function exportJSON() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "weekly-planner.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      // basic shape check
      if (!("categories" in obj) || !("blocks" in obj)) throw new Error("Invalid file");
      state = { ...structuredClone(DEFAULTS), ...obj };
      saveState();
      renderTimeColumn(); renderDays(); renderBlocks(); updateSummary(); syncSettingsUI();
      alert("Imported!");
    } catch (err) {
      alert("Import failed: " + err.message);
    }
  };
  reader.readAsText(file);
}

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }
function hhmmToMinutes(hhmm) {
  const [h,m] = hhmm.split(":").map(Number);
  return h*60+m;
}
function minutesToHHMM(mins) {
  mins = Math.max(0, mins);
  const h = Math.floor(mins/60);
  const m = mins%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function cryptoId() {
  // simple id
  return "b_" + Math.random().toString(36).slice(2,9);
}
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
