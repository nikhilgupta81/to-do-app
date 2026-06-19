/* =============================================================================
   app.js — View + Controller layer
   -----------------------------------------------------------------------------
   Subscribes to the store and re-renders declaratively. We render with template
   strings + targeted DOM updates rather than a vDOM: for an app this size it's
   fast, transparent, and dependency-free, while the store keeps data flow
   unidirectional. Event handling uses delegation so dynamically-rendered nodes
   need no re-binding.
   ========================================================================== */
(function () {
  "use strict";
  const { $, $$, escapeHTML, formatDue, formatLongDate, greeting, debounce } = window.Utils;
  const { getState, subscribe, actions, selectors, CATEGORIES, categoryColor } = window.Store;
  const I = window.Icons;

  /* ---- Accent palette (theme customization) ------------------------------ */
  const ACCENTS = {
    indigo: ["#6366f1", "#8b5cf6", "#ec4899"],
    ocean:  ["#0ea5e9", "#06b6d4", "#3b82f6"],
    sunset: ["#f59e0b", "#ef4444", "#ec4899"],
    forest: ["#10b981", "#14b8a6", "#84cc16"],
    grape:  ["#a855f7", "#8b5cf6", "#d946ef"],
  };

  /* =========================================================================
     RENDER FUNCTIONS — each returns markup or paints into a container
     ====================================================================== */

  /** Animated check control inside a task. */
  const checkboxHTML = (on) =>
    `<button class="check ${on ? "is-on" : ""}" data-act="toggle" aria-label="Toggle complete" role="checkbox" aria-checked="${on}">${I.check(14)}</button>`;

  /** A single task row. */
  function taskHTML(t, idx) {
    const due = formatDue(t.due);
    const dueTag = due
      ? `<span class="tag tag--due ${due.overdue && !t.completed ? "overdue" : ""}">${I.clock(12)} ${due.label}</span>`
      : "";
    return `
      <li class="task ${t.completed ? "is-completed" : ""}" data-id="${t.id}" draggable="true" style="animation-delay:${idx * 40}ms" tabindex="0">
        <span class="task__handle" data-handle aria-hidden="true">${I.grip(16)}</span>
        ${checkboxHTML(t.completed)}
        <div class="task__body">
          <div class="task__title">${escapeHTML(t.title)}</div>
          ${t.notes ? `<div class="task__notes">${escapeHTML(t.notes)}</div>` : ""}
          <div class="task__meta">
            <span class="tag tag--priority tag--${t.priority}">${t.priority}</span>
            <span class="tag"><span class="chip__dot" style="background:${categoryColor(t.category)}"></span>${escapeHTML(t.category)}</span>
            ${dueTag}
          </div>
        </div>
        <div class="task__actions">
          <button class="task__btn" data-act="edit" aria-label="Edit task">${I.edit(16)}</button>
          <button class="task__btn danger" data-act="delete" aria-label="Delete task">${I.trash(16)}</button>
        </div>
      </li>`;
  }

  /** Empty state when no tasks match. */
  function emptyHTML(filtered) {
    return `
      <div class="empty">
        <div class="empty__art">${filtered ? I.search(48) : I.inbox(48)}</div>
        <h3>${filtered ? "No matching tasks" : "All clear — you're on top of it"}</h3>
        <p>${filtered ? "Try adjusting your search or filters." : "Add your first task to start building momentum. Press ‘N’ anytime to create one."}</p>
        <button class="btn btn--primary" data-open-add style="margin-top:18px">${I.plus(16)} Add a task</button>
      </div>`;
  }

  /** Stat cards. */
  function renderStats() {
    const s = selectors.stats();
    const cards = [
      { label: "Total tasks", value: s.total, icon: I.list(20), accent: "linear-gradient(135deg,#6366f1,#8b5cf6)" },
      { label: "Completed", value: s.completed, icon: I.check(20), accent: "linear-gradient(135deg,#10b981,#14b8a6)" },
      { label: "Pending", value: s.pending, icon: I.clock(20), accent: "linear-gradient(135deg,#f59e0b,#ef4444)" },
      { label: "Productivity score", value: s.score, icon: I.zap(20), accent: "linear-gradient(135deg,#ec4899,#8b5cf6)", suffix: "" },
    ];
    $("#stats").innerHTML = cards.map((c) => `
      <div class="stat" style="--accent:${c.accent}">
        <div class="stat__icon" style="background:${c.accent}">${c.icon}</div>
        <div class="stat__value">${c.value}${c.suffix || ""}</div>
        <div class="stat__label">${c.label}</div>
      </div>`).join("");
  }

  /** Progress card (ring + bar). */
  function renderProgress() {
    const s = selectors.stats();
    const C = 2 * Math.PI * 52; // circumference for r=52
    $("#progress").innerHTML = `
      <div class="progress-card">
        <div class="ring" style="--val:${s.pct}">
          <svg width="116" height="116">
            <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="var(--brand-1)"/><stop offset="100%" stop-color="var(--brand-3)"/>
            </linearGradient></defs>
            <circle class="ring__track" cx="58" cy="58" r="52"/>
            <circle class="ring__fill" cx="58" cy="58" r="52"
              stroke-dasharray="${C}" stroke-dashoffset="${C - (C * s.pct) / 100}"/>
          </svg>
          <span class="ring__pct">${s.pct}%</span>
        </div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:var(--fs-lg)">Daily progress</div>
          <p style="color:var(--text-3);font-size:var(--fs-sm);margin:4px 0 14px">
            ${s.completed} of ${s.total} tasks done${s.pct === 100 && s.total ? " — perfect day! 🎉" : ""}
          </p>
          <div class="bar"><div class="bar__fill" style="width:${s.pct}%"></div></div>
        </div>
      </div>`;
  }

  /** Filter chips (status + categories). */
  function renderFilters() {
    const f = getState().filters;
    const status = [
      { id: "all", label: "All" },
      { id: "active", label: "Active" },
      { id: "completed", label: "Completed" },
    ];
    const statusChips = status.map((x) =>
      `<button class="chip ${f.status === x.id ? "is-active" : ""}" data-status="${x.id}">${x.label}</button>`).join("");
    const catChips = CATEGORIES.map((c) =>
      `<button class="chip ${f.category === c.id ? "is-active" : ""}" data-cat="${c.id}">
        <span class="chip__dot" style="background:${c.color}"></span>${c.id}</button>`).join("");
    const allCat = `<button class="chip ${f.category === "all" ? "is-active" : ""}" data-cat="all">All categories</button>`;
    $("#filters").innerHTML = statusChips + `<span style="width:1px;background:var(--border);margin:0 4px"></span>` + allCat + catChips;
  }

  /** Task list with progressive entrance animation. */
  function renderTasks() {
    const list = selectors.visibleTasks();
    const el = $("#taskList");
    const f = getState().filters;
    const isFiltered = f.search || f.category !== "all" || f.priority !== "all" || f.status !== "all";
    if (!list.length) { el.innerHTML = emptyHTML(isFiltered); return; }
    el.innerHTML = list.map((t, i) => taskHTML(t, i)).join("");
  }

  /** Dashboard view (charts + breakdowns). */
  function renderDashboard() {
    const s = selectors.stats();
    const weekly = selectors.weekly();
    const cats = selectors.byCategory();
    const streak = selectors.streak();
    const max = Math.max(1, ...weekly.map((d) => d.value));

    $("#dashboard").innerHTML = `
      <div class="stats-grid">
        ${[
          { l: "Completion", v: s.pct + "%", i: I.target(20), a: "linear-gradient(135deg,#6366f1,#8b5cf6)" },
          { l: "Current streak", v: streak + "d", i: I.flame(20), a: "linear-gradient(135deg,#f59e0b,#ef4444)" },
          { l: "Tasks completed", v: s.completed, i: I.trophy(20), a: "linear-gradient(135deg,#10b981,#14b8a6)" },
          { l: "Productivity", v: s.score, i: I.zap(20), a: "linear-gradient(135deg,#ec4899,#8b5cf6)" },
        ].map((c) => `
          <div class="stat" style="--accent:${c.a}">
            <div class="stat__icon" style="background:${c.a}">${c.i}</div>
            <div class="stat__value">${c.v}</div>
            <div class="stat__label">${c.l}</div>
          </div>`).join("")}
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="section-head" style="margin:0 0 6px"><h2>Weekly progress</h2><span class="muted">Completed per day</span></div>
          <div class="bars">
            ${weekly.map((d) => `
              <div class="bars__col ${d.today ? "today" : ""}">
                <div class="bars__bar" data-val="${d.value} done" data-h="${Math.round((d.value / max) * 100)}"></div>
                <div class="bars__label">${d.label}</div>
              </div>`).join("")}
          </div>
        </div>

        <div class="card">
          <div class="section-head" style="margin:0 0 12px"><h2>By category</h2></div>
          ${cats.length ? cats.map((c) => {
            const pct = Math.round((c.done / c.total) * 100);
            return `<div style="margin-bottom:14px">
              <div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);font-weight:600;margin-bottom:6px">
                <span><span class="chip__dot" style="display:inline-block;background:${c.color}"></span> ${c.id}</span>
                <span style="color:var(--text-3)">${c.done}/${c.total}</span>
              </div>
              <div class="bar"><div class="bar__fill" style="width:${pct}%;background:${c.color}"></div></div>
            </div>`;
          }).join("") : `<p style="color:var(--text-3)">No tasks yet.</p>`}
        </div>
      </div>

      <div class="card ai-card" style="margin-top:16px">
        <div class="section-head" style="margin:0 0 8px"><h2>${I.sparkles(18)} Smart suggestions</h2><span class="muted">AI-ranked focus for today</span></div>
        ${renderSuggestions()}
      </div>`;

    // Animate bars after paint.
    requestAnimationFrame(() => {
      $$("#dashboard .bars__bar").forEach((b) => { b.style.height = b.dataset.h + "%"; });
    });
  }

  /** Smart suggestion rows (used in dashboard + command palette context). */
  function renderSuggestions() {
    const sug = selectors.suggestions();
    if (!sug.length) return `<p style="color:var(--text-3);padding:8px 12px">Nothing pending — enjoy the calm. ✨</p>`;
    const reason = (sc) => sc >= 160 ? "Overdue & high priority" : sc >= 110 ? "Due today" : sc >= 80 ? "High priority" : "Recommended next";
    return sug.map(({ task, score }) => `
      <div class="ai-item" data-suggest="${task.id}">
        <div class="ai-item__icon">${I.target(16)}</div>
        <div class="ai-item__txt"><b>${escapeHTML(task.title)}</b><span>${reason(score)} · ${escapeHTML(task.category)}</span></div>
        <button class="btn btn--ghost" data-act="toggle" data-id="${task.id}" style="padding:7px 12px">Done</button>
      </div>`).join("");
  }

  /** Sidebar nav active state + counts. */
  function renderNav() {
    const v = getState().view;
    $$(".nav__item[data-view]").forEach((b) => b.classList.toggle("is-active", b.dataset.view === v));
    const s = selectors.stats();
    $("#count-today").textContent = selectors.visibleTasks({ ...getState(), view: "today", filters: { ...getState().filters, status: "active" } }).length;
    $("#count-all").textContent = s.total;
    // Streak pill
    const streak = selectors.streak();
    $("#streakNum").textContent = streak;
    $("#streakTxt").textContent = streak === 1 ? "day streak" : "day streak";
  }

  /* =========================================================================
     THEME
     ====================================================================== */
  function applyTheme() {
    const { theme, accent } = getState();
    document.documentElement.setAttribute("data-theme", theme);
    const [a, b, c] = ACCENTS[accent] || ACCENTS.indigo;
    const r = document.documentElement.style;
    r.setProperty("--brand-1", a); r.setProperty("--brand-2", b); r.setProperty("--brand-3", c);
    $("#themeIcon").innerHTML = theme === "dark" ? I.sun(20) : I.moon(20);
    $$(".palette__swatch").forEach((sw) => sw.classList.toggle("is-on", sw.dataset.accent === accent));
  }

  /* =========================================================================
     MASTER RENDER — called on every state change
     ====================================================================== */
  function render() {
    const view = getState().view;
    applyTheme();
    renderNav();

    $$(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.viewpane === (view === "dashboard" ? "dashboard" : "tasks")));

    if (view === "dashboard") {
      renderDashboard();
    } else {
      renderStats();
      renderProgress();
      renderFilters();
      renderTasks();
      $("#listTitle").textContent = view === "today" ? "Today" : "All tasks";
    }
  }

  /* =========================================================================
     MODAL — add / edit task
     ====================================================================== */
  let editingId = null;
  const modal = $("#taskModal");

  function openTaskModal(task = null) {
    editingId = task ? task.id : null;
    $("#modalTitle").textContent = task ? "Edit task" : "New task";
    $("#f-title").value = task ? task.title : "";
    $("#f-notes").value = task ? task.notes : "";
    $("#f-category").value = task ? task.category : "Work";
    $("#f-due").value = task ? (task.due ? task.due.slice(0, 10) : "") : new Date().toISOString().slice(0, 10);
    setPriority(task ? task.priority : "medium");
    modal.classList.add("is-open");
    setTimeout(() => $("#f-title").focus(), 60);
  }
  function closeTaskModal() { modal.classList.remove("is-open"); editingId = null; }

  let currentPriority = "medium";
  function setPriority(p) {
    currentPriority = p;
    $$("#prioritySeg .seg__opt").forEach((o) => o.classList.toggle("is-on", o.dataset.p === p));
  }

  function submitTask(e) {
    e.preventDefault();
    const title = $("#f-title").value.trim();
    if (!title) { $("#f-title").focus(); return; }
    const payload = {
      title, notes: $("#f-notes").value, category: $("#f-category").value,
      priority: currentPriority, due: $("#f-due").value ? new Date($("#f-due").value).toISOString() : null,
    };
    if (editingId) { actions.updateTask(editingId, payload); toast("Task updated", "info"); }
    else { actions.addTask(payload); toast("Task added", "success"); }
    closeTaskModal();
  }

  /* =========================================================================
     CONFIRM MODAL
     ====================================================================== */
  let confirmCb = null;
  const confirmEl = $("#confirmModal");
  function confirm(message, cb) {
    $("#confirmMsg").textContent = message;
    confirmCb = cb;
    confirmEl.classList.add("is-open");
  }
  function closeConfirm() { confirmEl.classList.remove("is-open"); confirmCb = null; }

  /* =========================================================================
     TOASTS + SUCCESS BURST (micro-interactions)
     ====================================================================== */
  function toast(msg, type = "success") {
    const icons = { success: I.check(14), info: I.info(14), warn: I.info(14) };
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span class="toast__ico ${type}">${icons[type] || icons.info}</span>${escapeHTML(msg)}`;
    $("#toasts").appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, 2400);
  }

  function burst(x, y) {
    const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b"];
    const wrap = document.createElement("div");
    wrap.className = "burst"; wrap.style.left = x + "px"; wrap.style.top = y + "px";
    for (let i = 0; i < 14; i++) {
      const p = document.createElement("span");
      const ang = (Math.PI * 2 * i) / 14, dist = 40 + Math.random() * 40;
      p.style.background = colors[i % colors.length];
      p.style.setProperty("--bx", Math.cos(ang) * dist + "px");
      p.style.setProperty("--by", Math.sin(ang) * dist + "px");
      wrap.appendChild(p);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 800);
  }

  /* =========================================================================
     COMMAND PALETTE (⌘K)
     ====================================================================== */
  const cmdk = $("#cmdk");
  let cmdItems = [], cmdActive = 0;

  function baseCommands() {
    return [
      { group: "Actions", label: "New task", icon: I.plus(16), kbd: "N", run: () => openTaskModal() },
      { group: "Actions", label: "Clear completed tasks", icon: I.trash(16), run: () => askClearCompleted() },
      { group: "Navigate", label: "Go to Today", icon: I.list(16), run: () => actions.setView("today") },
      { group: "Navigate", label: "Go to All tasks", icon: I.inbox(16), run: () => actions.setView("all") },
      { group: "Navigate", label: "Go to Dashboard", icon: I.chart(16), run: () => actions.setView("dashboard") },
      { group: "Preferences", label: "Toggle dark / light theme", icon: I.moon(16), kbd: "T", run: toggleTheme },
    ];
  }

  function openCmdk() {
    cmdk.classList.add("is-open");
    $("#cmdkInput").value = ""; cmdActive = 0;
    filterCmdk("");
    setTimeout(() => $("#cmdkInput").focus(), 50);
  }
  function closeCmdk() { cmdk.classList.remove("is-open"); }

  function filterCmdk(q) {
    const query = q.toLowerCase().trim();
    const cmds = baseCommands();
    // Also surface matching tasks to jump-complete.
    const taskMatches = query
      ? getState().tasks.filter((t) => !t.completed && t.title.toLowerCase().includes(query)).slice(0, 5)
        .map((t) => ({ group: "Tasks", label: t.title, icon: I.check(16), run: () => completeWithFx(t.id) }))
      : [];
    cmdItems = [...cmds.filter((c) => c.label.toLowerCase().includes(query)), ...taskMatches];
    cmdActive = 0;
    paintCmdk();
  }

  function paintCmdk() {
    const list = $("#cmdkList");
    if (!cmdItems.length) { list.innerHTML = `<div class="cmdk__empty">No results</div>`; return; }
    let html = "", lastGroup = "";
    cmdItems.forEach((c, i) => {
      if (c.group !== lastGroup) { html += `<div class="cmdk__group-label">${c.group}</div>`; lastGroup = c.group; }
      html += `<div class="cmdk__item ${i === cmdActive ? "is-active" : ""}" data-i="${i}">
        <span class="ico">${c.icon}</span>${escapeHTML(c.label)}${c.kbd ? `<kbd>${c.kbd}</kbd>` : ""}</div>`;
    });
    list.innerHTML = html;
  }

  function runCmd(i) { const c = cmdItems[i]; if (!c) return; closeCmdk(); setTimeout(c.run, 80); }

  /* =========================================================================
     HELPERS that combine action + feedback
     ====================================================================== */
  function completeWithFx(id, originEl) {
    const wasCompleted = getState().tasks.find((t) => t.id === id)?.completed;
    actions.toggleComplete(id);
    if (!wasCompleted) {
      if (originEl) { const r = originEl.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2); }
      const s = selectors.stats();
      if (s.pct === 100 && s.total) toast("Perfect day — all tasks done! 🎉", "success");
    }
  }

  function askDelete(id) {
    const t = getState().tasks.find((x) => x.id === id);
    confirm(`Delete “${t ? t.title : "this task"}”? This can't be undone.`, () => {
      actions.deleteTask(id); toast("Task deleted", "info");
    });
  }
  function askClearCompleted() {
    const n = getState().tasks.filter((t) => t.completed).length;
    if (!n) { toast("No completed tasks to clear", "info"); return; }
    confirm(`Clear ${n} completed task${n > 1 ? "s" : ""}?`, () => { actions.clearCompleted(); toast("Completed tasks cleared", "info"); });
  }

  function toggleTheme() { actions.setTheme(getState().theme === "dark" ? "light" : "dark"); }

  /* =========================================================================
     EVENT WIRING (delegation)
     ====================================================================== */
  function wire() {
    // Add buttons
    $$("[data-open-add], #addBtn").forEach((b) => b.addEventListener("click", () => openTaskModal()));
    document.body.addEventListener("click", (e) => {
      if (e.target.closest("[data-open-add]")) openTaskModal();
    });

    // Sidebar nav
    $$(".nav__item[data-view]").forEach((b) =>
      b.addEventListener("click", () => { actions.setView(b.dataset.view); closeSidebar(); }));

    // Task list delegation (toggle / edit / delete)
    $("#taskList").addEventListener("click", (e) => {
      const row = e.target.closest(".task"); if (!row) return;
      const id = row.dataset.id;
      const btn = e.target.closest("[data-act]"); if (!btn) return;
      const act = btn.dataset.act;
      if (act === "toggle") completeWithFx(id, btn);
      else if (act === "edit") openTaskModal(getState().tasks.find((t) => t.id === id));
      else if (act === "delete") askDelete(id);
    });

    // Dashboard delegation (suggestion "Done" buttons)
    $("#dashboard").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act='toggle']");
      if (btn) completeWithFx(btn.dataset.id, btn);
    });

    // Filters delegation
    $("#filters").addEventListener("click", (e) => {
      const s = e.target.closest("[data-status]"); if (s) return actions.setFilter({ status: s.dataset.status });
      const c = e.target.closest("[data-cat]"); if (c) return actions.setFilter({ category: c.dataset.cat });
    });

    // Search (debounced)
    $("#searchInput").addEventListener("input", debounce((e) => actions.setFilter({ search: e.target.value }), 180));

    // Theme + accent
    $("#themeBtn").addEventListener("click", toggleTheme);
    $("#paletteBtn").addEventListener("click", (e) => { e.stopPropagation(); $("#palettePop").classList.toggle("is-open"); });
    $("#palettePop").addEventListener("click", (e) => {
      const sw = e.target.closest(".palette__swatch"); if (sw) { actions.setAccent(sw.dataset.accent); }
    });
    document.addEventListener("click", () => $("#palettePop").classList.remove("is-open"));

    // Clear completed
    $("#clearBtn").addEventListener("click", askClearCompleted);

    // Modal
    $("#taskForm").addEventListener("submit", submitTask);
    $("#modalClose").addEventListener("click", closeTaskModal);
    $("#modalCancel").addEventListener("click", closeTaskModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeTaskModal(); });
    $("#prioritySeg").addEventListener("click", (e) => { const o = e.target.closest(".seg__opt"); if (o) setPriority(o.dataset.p); });

    // Confirm modal
    $("#confirmOk").addEventListener("click", () => { const cb = confirmCb; closeConfirm(); cb && cb(); });
    $("#confirmCancel").addEventListener("click", closeConfirm);
    confirmEl.addEventListener("click", (e) => { if (e.target === confirmEl) closeConfirm(); });

    // Command palette
    $("#cmdkBtn").addEventListener("click", openCmdk);
    $("#cmdkInput").addEventListener("input", (e) => filterCmdk(e.target.value));
    cmdk.addEventListener("click", (e) => { if (e.target === cmdk) closeCmdk(); const it = e.target.closest(".cmdk__item"); if (it) runCmd(+it.dataset.i); });

    // Mobile sidebar
    $("#menuBtn").addEventListener("click", openSidebar);
    $("#scrim").addEventListener("click", closeSidebar);

    // Drag & drop reordering
    wireDnd();

    // Keyboard shortcuts
    document.addEventListener("keydown", onKeydown);
  }

  function openSidebar() { $("#sidebar").classList.add("is-open"); $("#scrim").classList.add("is-open"); }
  function closeSidebar() { $("#sidebar").classList.remove("is-open"); $("#scrim").classList.remove("is-open"); }

  /* ---- Drag & drop ------------------------------------------------------- */
  let dragId = null;
  function wireDnd() {
    const el = $("#taskList");
    el.addEventListener("dragstart", (e) => {
      const row = e.target.closest(".task"); if (!row) return;
      dragId = row.dataset.id; row.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    el.addEventListener("dragend", (e) => {
      const row = e.target.closest(".task"); row && row.classList.remove("is-dragging");
      $$(".task.drag-over").forEach((r) => r.classList.remove("drag-over"));
      dragId = null;
    });
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      const row = e.target.closest(".task"); if (!row || row.dataset.id === dragId) return;
      $$(".task.drag-over").forEach((r) => r.classList.remove("drag-over"));
      row.classList.add("drag-over");
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      const row = e.target.closest(".task"); if (!row || !dragId) return;
      actions.reorder(dragId, row.dataset.id);
    });
  }

  /* ---- Keyboard shortcuts ------------------------------------------------ */
  function onKeydown(e) {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

    // ⌘K / Ctrl+K — command palette
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); cmdk.classList.contains("is-open") ? closeCmdk() : openCmdk(); return; }

    // Command palette navigation
    if (cmdk.classList.contains("is-open")) {
      if (e.key === "ArrowDown") { e.preventDefault(); cmdActive = Math.min(cmdActive + 1, cmdItems.length - 1); paintCmdk(); scrollCmdActive(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); cmdActive = Math.max(cmdActive - 1, 0); paintCmdk(); scrollCmdActive(); }
      else if (e.key === "Enter") { e.preventDefault(); runCmd(cmdActive); }
      else if (e.key === "Escape") closeCmdk();
      return;
    }

    // Escape closes any open modal
    if (e.key === "Escape") { closeTaskModal(); closeConfirm(); $("#palettePop").classList.remove("is-open"); return; }

    if (typing) return; // don't hijack typing

    if (e.key === "n" || e.key === "N") { e.preventDefault(); openTaskModal(); }
    else if (e.key === "/") { e.preventDefault(); $("#searchInput").focus(); }
    else if (e.key === "t" || e.key === "T") { toggleTheme(); }
    else if (e.key === "1") actions.setView("today");
    else if (e.key === "2") actions.setView("all");
    else if (e.key === "3") actions.setView("dashboard");
  }
  function scrollCmdActive() { const a = $(".cmdk__item.is-active"); a && a.scrollIntoView({ block: "nearest" }); }

  /* =========================================================================
     BOOT
     ====================================================================== */
  function boot() {
    // Header
    $("#greeting").innerHTML = `${greeting()}, <span>Nikhil</span>`;
    $("#todayDate").textContent = formatLongDate();
    // Build accent swatches
    $("#palettePop").innerHTML = `<div class="palette">${Object.entries(ACCENTS).map(([k, v]) =>
      `<span class="palette__swatch" data-accent="${k}" title="${k}" style="background:linear-gradient(135deg,${v[0]},${v[2]})"></span>`).join("")}</div>`;

    wire();
    subscribe(render);

    // Simulated initial load shimmer → then first paint (perceived performance polish).
    setTimeout(() => { $("#loader").classList.add("hide"); $("#app").classList.remove("hide"); render(); }, 450);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
