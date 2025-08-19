// Weekly Planner — Vanilla JS
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const DEFAULTS = {
  startHour: 0,
  endHour: 24,
  workTarget: 38.5,
  minutePx: 2,
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

let MINUTE_PX = 2;

let state = loadState();
MINUTE_PX = state.minutePx || MINUTE_PX;
init();

function init() {
  renderTimeColumn();
  renderDays();
  setupModals();
  force24HourTimeInputs();
  syncSettingsUI();
  updateSummary();
  renderBlocks();
  bindControls();
}

function force24HourTimeInputs() {
  const test = document.createElement('input');
  test.type = 'time';
  test.value = '24:00';
  if (test.value !== '24:00') {
    $$('#blockForm input[type="time"]').forEach(inp => {
      inp.type = 'text';
      inp.placeholder = 'HH:MM';
      inp.pattern = '((?:[01]\\d|2[0-3]):[0-5]\\d|24:00)';
      inp.setAttribute('inputmode', 'numeric');
    });
  }
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
      blocks: parsed.blocks || [],
      minutePx: parsed.minutePx || DEFAULTS.minutePx
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
  $("#zoomRange").value = MINUTE_PX;
  $("#zoomRange").addEventListener("input", (e) => {
    MINUTE_PX = state.minutePx = Number(e.target.value);
    saveState();
    renderTimeColumn();
    renderDays();
    renderBlocks();
  });
  $("#fitDayBtn").addEventListener("click", () => {
    const body = $("#calendar");
    const totalMinutes = (state.endHour - state.startHour) * 60;
    const fitPx = body.clientHeight / totalMinutes;
    MINUTE_PX = state.minutePx = fitPx;
    $("#zoomRange").value = MINUTE_PX;
    saveState();
    renderTimeColumn();
    renderDays();
    renderBlocks();
  });

  // Click to add block with prefilled day/time
  $$(".dayCol.day").forEach(col => {
    col.addEventListener("click", (e) => {
      const rect = col.getBoundingClientRect();
      const y = e.clientY - rect.top + col.scrollTop;
      const minutesFromStart = Math.round(y / MINUTE_PX); // MINUTE_PX px per minute
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
    d.style.height = (60 * MINUTE_PX) + "px";
    d.textContent = `${String(h).padStart(2,"0")}:00`;
    timeCol.appendChild(d);
  }
}

function renderDays() {
  // Set min-height based on hours
  const body = $("#calendar");
  const totalMinutes = (state.endHour - state.startHour) * 60;
  const px = totalMinutes * MINUTE_PX; // MINUTE_PX px per minute
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

function openBlockModal(prefill = null, blockId = null, groupId = null) {
  const modal = $("#blockModal");
  $("#modalTitle").textContent = blockId ? "Edit Block" : "Add Block";
  $("#deleteBlock").classList.toggle("hidden", !blockId);
  modal.dataset.editId = blockId || "";
  modal.dataset.groupId = groupId || "";

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
  if (prefill?.days) {
    prefill.days.forEach(d => {
      const cb = $$("input[name='days']").find(c => Number(c.value) === d);
      if (cb) cb.checked = true;
    });
  } else if (prefill?.day != null) {
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
  const modal = $("#blockModal");
  const form = $("#blockForm");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const editId = modal.dataset.editId;
  const groupId = modal.dataset.groupId || editId || cryptoId();
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
  const startMin = hhmmToMinutes(start);
  const endMin = hhmmToMinutes(end);
  if (!(startMin >= 0 && endMin <= 1440 && startMin < endMin)) {
    alert("Start and end must be within 00:00-24:00 and end after start.");
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
    id: cryptoId(),
    group: groupId,
    title, category, day: d, start, end, coreWork, altFocus
  }));

  state.blocks = state.blocks.filter(b => (b.group || b.id) !== groupId);
  state.blocks.push(...objs);

  saveState();
  hide(modal);
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
  const dayStartMin = state.startHour * 60;
  const byDay = Array.from({ length: 7 }, () => []);
  state.blocks.forEach(b => { if (byDay[b.day]) byDay[b.day].push(b); });

  byDay.forEach((blocks, day) => {
    const col = $(`.dayCol.day[data-day="${day}"]`);
    if (!col) return;
    const groups = groupOverlaps(blocks);
    groups.forEach(group => {
      group.sort((a,b)=>hhmmToMinutes(a.start)-hhmmToMinutes(b.start));
      const cols = [];
      group.forEach(b => {
        const startM = hhmmToMinutes(b.start);
        let i = 0;
        while (cols[i] > startM) i++;
        b._col = i;
        cols[i] = hhmmToMinutes(b.end);
      });
      const maxCols = cols.length;
      group.forEach(b => {
        const startM = hhmmToMinutes(b.start);
        const endM = hhmmToMinutes(b.end);
        const top = (startM - dayStartMin) * MINUTE_PX;
        const height = Math.max(10, (endM - startM) * MINUTE_PX);
        const div = document.createElement("div");
        div.className = "block";
        const cat = state.categories.find(c => c.name === b.category);
        div.style.background = (cat?.color || "#ddd");
        div.style.top = `${top}px`;
        div.style.height = `${height}px`;
        div.style.left = `calc(${(100 / maxCols) * b._col}% + 6px)`;
        div.style.width = `calc(${100 / maxCols}% - 12px)`;
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
    });
  });
}

function openEditBlock(b) {
  const group = b.group || b.id;
  const groupBlocks = state.blocks.filter(bl => (bl.group || bl.id) === group);
  const days = groupBlocks.map(gb => gb.day);
  openBlockModal({
    title: b.title,
    category: b.category,
    days,
    start: b.start,
    end: b.end,
    coreWork: b.coreWork,
    altFocus: b.altFocus
  }, b.id, group);
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

  const totalsDiv = document.createElement("div");
  totalsDiv.className = "groupTotals";
  cats.forEach(cat => {
    const mins = minsByCatDay[cat].reduce((a,b)=>a+b,0);
    const row = document.createElement("div");
    row.innerHTML = `<span>${escapeHtml(cat)}</span><span>${(mins/60).toFixed(1)} h</span>`;
    totalsDiv.appendChild(row);
  });
  wrap.appendChild(totalsDiv);

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

function groupOverlaps(blocks) {
  const remaining = blocks.slice();
  const groups = [];
  while (remaining.length) {
    const first = remaining.shift();
    const group = [first];
    let added = true;
    while (added) {
      added = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (group.some(g => intervalsOverlap(g, remaining[i]))) {
          group.push(remaining.splice(i,1)[0]);
          added = true;
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

function intervalsOverlap(a, b) {
  const aStart = hhmmToMinutes(a.start);
  const aEnd = hhmmToMinutes(a.end);
  const bStart = hhmmToMinutes(b.start);
  const bEnd = hhmmToMinutes(b.end);
  return aStart < bEnd && bStart < aEnd;
}

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }
function hhmmToMinutes(hhmm) {
  const [h,m] = hhmm.split(":").map(Number);
  if (h === 24 && m === 0) return 1440;
  return h*60+m;
}
function minutesToHHMM(mins) {
  mins = Math.min(1440, Math.max(0, mins));
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
