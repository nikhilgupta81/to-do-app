/* =============================================================================
   store.js — State container (the single source of truth)
   -----------------------------------------------------------------------------
   A minimal Redux-style store: immutable-ish updates flow through `commit`,
   which persists to localStorage and notifies subscribers. The view layer
   (app.js) never mutates state directly — it dispatches actions. This keeps data
   flow unidirectional and predictable, exactly like a production React/Redux app
   but with zero dependencies.
   ========================================================================== */
(function () {
  "use strict";
  const { uid, startOfDay, isSameDay, lastNDays } = window.Utils;

  const STORAGE_KEY = "dayflow.todo.v1";
  const LEGACY_KEY = "zenith.todo.v1"; // pre-rename key — migrated on first load

  /* ---- Seed data (first-run only) — shows the app populated & alive ------- */
  const seed = () => {
    const today = new Date().toISOString();
    const tmrw = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString(); })();
    return [
      { id: uid(), title: "Finalize Q3 product roadmap", notes: "Align with design + eng leads before standup", category: "Work", priority: "high", due: today, completed: false, createdAt: today, completedAt: null, order: 0 },
      { id: uid(), title: "Review pull requests", notes: "", category: "Work", priority: "medium", due: today, completed: true, createdAt: today, completedAt: today, order: 1 },
      { id: uid(), title: "30-minute morning run", notes: "Zone 2 cardio", category: "Health", priority: "low", due: today, completed: true, createdAt: today, completedAt: today, order: 2 },
      { id: uid(), title: "Book flights for offsite", notes: "Check refundable fares", category: "Personal", priority: "medium", due: tmrw, completed: false, createdAt: today, completedAt: null, order: 3 },
      { id: uid(), title: "Read 20 pages — 'Shape Up'", notes: "", category: "Learning", priority: "low", due: tmrw, completed: false, createdAt: today, completedAt: null, order: 4 },
    ];
  };

  const defaultState = () => ({
    tasks: seed(),
    theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    accent: "indigo",
    filters: { search: "", category: "all", priority: "all", status: "all" },
    view: "today",            // today | all | dashboard
    history: {},              // { 'YYYY-MM-DD': completedCount } for streak/chart
    lastActive: null,
  });

  /* ---- Persistence ------------------------------------------------------- */
  function load() {
    try {
      // One-time migration from the legacy storage key so existing tasks survive the rename.
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) { localStorage.setItem(STORAGE_KEY, legacy); localStorage.removeItem(LEGACY_KEY); raw = legacy; }
      }
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      // Merge to be forward-compatible if new keys are added between versions.
      return { ...defaultState(), ...parsed, filters: { ...defaultState().filters, ...(parsed.filters || {}) } };
    } catch (e) {
      console.warn("State load failed, resetting.", e);
      return defaultState();
    }
  }

  function persist(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn("Persist failed (storage full / blocked).", e); }
  }

  /* ---- Store core -------------------------------------------------------- */
  let state = load();
  const subscribers = new Set();

  const getState = () => state;
  const subscribe = (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); };
  function commit(producer) {
    state = producer({ ...state });
    persist(state);
    subscribers.forEach((fn) => fn(state));
  }

  /* ---- Categories -------------------------------------------------------- */
  const CATEGORIES = [
    { id: "Work", color: "#6366f1" },
    { id: "Personal", color: "#ec4899" },
    { id: "Health", color: "#10b981" },
    { id: "Learning", color: "#f59e0b" },
    { id: "Errands", color: "#06b6d4" },
  ];
  const categoryColor = (id) => (CATEGORIES.find((c) => c.id === id) || {}).color || "#8b5cf6";

  /* ---- Actions (the only way to change data) ----------------------------- */
  const actions = {
    addTask(payload) {
      commit((s) => {
        const order = s.tasks.length ? Math.min(...s.tasks.map((t) => t.order)) - 1 : 0;
        const task = {
          id: uid(), title: payload.title.trim(), notes: (payload.notes || "").trim(),
          category: payload.category || "Work", priority: payload.priority || "medium",
          due: payload.due || null, completed: false,
          createdAt: new Date().toISOString(), completedAt: null, order,
        };
        return { ...s, tasks: [task, ...s.tasks] };
      });
    },

    updateTask(id, patch) {
      commit((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
    },

    deleteTask(id) {
      commit((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
    },

    toggleComplete(id) {
      commit((s) => {
        const tasks = s.tasks.map((t) => {
          if (t.id !== id) return t;
          const completed = !t.completed;
          return { ...t, completed, completedAt: completed ? new Date().toISOString() : null };
        });
        return recomputeHistory({ ...s, tasks });
      });
    },

    clearCompleted() {
      commit((s) => ({ ...s, tasks: s.tasks.filter((t) => !t.completed) }));
    },

    reorder(draggedId, targetId) {
      commit((s) => {
        const list = [...s.tasks].sort((a, b) => a.order - b.order);
        const from = list.findIndex((t) => t.id === draggedId);
        const to = list.findIndex((t) => t.id === targetId);
        if (from === -1 || to === -1) return s;
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        const tasks = list.map((t, i) => ({ ...t, order: i }));
        return { ...s, tasks };
      });
    },

    setFilter(patch) { commit((s) => ({ ...s, filters: { ...s.filters, ...patch } })); },
    setView(view) { commit((s) => ({ ...s, view })); },
    setTheme(theme) { commit((s) => ({ ...s, theme })); },
    setAccent(accent) { commit((s) => ({ ...s, accent })); },
    resetAll() { commit(() => defaultState()); },
  };

  /* ---- Derived: rebuild the per-day completion history -------------------- */
  function recomputeHistory(s) {
    const history = {};
    s.tasks.forEach((t) => {
      if (t.completed && t.completedAt) {
        const key = startOfDay(new Date(t.completedAt)).toISOString().slice(0, 10);
        history[key] = (history[key] || 0) + 1;
      }
    });
    return { ...s, history };
  }

  /* ---- Selectors (pure views over state) --------------------------------- */
  const selectors = {
    /** Tasks after search + filters are applied, sorted by manual order. */
    visibleTasks(s = state) {
      const { search, category, priority, status } = s.filters;
      const q = search.trim().toLowerCase();
      let list = [...s.tasks];

      if (s.view === "today") {
        list = list.filter((t) => !t.due || isSameDay(new Date(t.due), new Date()) || (!t.completed && new Date(t.due) < new Date()));
      }
      if (category !== "all") list = list.filter((t) => t.category === category);
      if (priority !== "all") list = list.filter((t) => t.priority === priority);
      if (status === "active") list = list.filter((t) => !t.completed);
      if (status === "completed") list = list.filter((t) => t.completed);
      if (q) list = list.filter((t) => (t.title + " " + t.notes + " " + t.category).toLowerCase().includes(q));

      return list.sort((a, b) => a.order - b.order);
    },

    /** Headline stats for cards + progress ring. */
    stats(s = state) {
      const total = s.tasks.length;
      const completed = s.tasks.filter((t) => t.completed).length;
      const pending = total - completed;
      const pct = total ? Math.round((completed / total) * 100) : 0;

      // Productivity score: completion weighted by priority of finished tasks.
      const weight = { high: 3, medium: 2, low: 1 };
      const earned = s.tasks.filter((t) => t.completed).reduce((a, t) => a + weight[t.priority], 0);
      const possible = s.tasks.reduce((a, t) => a + weight[t.priority], 0);
      const score = possible ? Math.round((earned / possible) * 100) : 0;

      return { total, completed, pending, pct, score };
    },

    /** Per-category counts for the dashboard breakdown. */
    byCategory(s = state) {
      return CATEGORIES.map((c) => ({
        ...c,
        total: s.tasks.filter((t) => t.category === c.id).length,
        done: s.tasks.filter((t) => t.category === c.id && t.completed).length,
      })).filter((c) => c.total > 0);
    },

    /** Completions per day for the last 7 days (weekly chart). */
    weekly(s = state) {
      return lastNDays(7).map((d) => {
        const key = d.toISOString().slice(0, 10);
        return {
          date: d,
          label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1),
          value: s.history[key] || 0,
          today: isSameDay(d, new Date()),
        };
      });
    },

    /** Consecutive-day completion streak ending today (or yesterday). */
    streak(s = state) {
      let streak = 0;
      const cursor = startOfDay(new Date());
      // Allow today to be "in progress": start from today if done, else yesterday.
      if (!s.history[cursor.toISOString().slice(0, 10)]) cursor.setDate(cursor.getDate() - 1);
      while (s.history[cursor.toISOString().slice(0, 10)]) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }
      return streak;
    },

    /** Heuristic "AI" suggestions — ranks the most urgent open work. */
    suggestions(s = state) {
      const open = s.tasks.filter((t) => !t.completed);
      const score = (t) => {
        let v = { high: 100, medium: 50, low: 20 }[t.priority];
        if (t.due) {
          const days = Math.round((startOfDay(new Date(t.due)) - startOfDay(new Date())) / 86400000);
          if (days < 0) v += 80;          // overdue → top priority
          else if (days === 0) v += 60;   // due today
          else if (days === 1) v += 30;   // due tomorrow
        }
        return v;
      };
      return open.map((t) => ({ task: t, score: score(t) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    },
  };

  // Ensure history is consistent with seeded/loaded completions on boot.
  state = recomputeHistory(state);

  window.Store = { getState, subscribe, actions, selectors, CATEGORIES, categoryColor, STORAGE_KEY };
})();
