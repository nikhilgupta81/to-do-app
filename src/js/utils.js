/* =============================================================================
   utils.js — Pure, dependency-free helpers
   -----------------------------------------------------------------------------
   Everything here is side-effect free and unit-testable. Exposed on a single
   global namespace (window.Utils) to keep the no-build setup tidy while still
   demonstrating clear module boundaries.
   ========================================================================== */
(function () {
  "use strict";

  /** Tiny query helpers */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** Collision-resistant id (timestamp + random) — good enough for local data. */
  const uid = () => `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  /** Clamp a number into [min,max]. */
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  /** Debounce — used for search input to avoid re-render thrash. */
  function debounce(fn, wait = 200) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /** Escape user text before injecting into innerHTML (XSS-safe rendering). */
  function escapeHTML(str = "") {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---- Date helpers ------------------------------------------------------ */
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const isSameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

  /** Human-friendly relative due date ("Today", "Tomorrow", "3d overdue"…). */
  function formatDue(iso) {
    if (!iso) return null;
    const today = startOfDay(new Date());
    const due = startOfDay(new Date(iso));
    const diff = daysBetween(today, due);
    if (diff === 0) return { label: "Today", overdue: false };
    if (diff === 1) return { label: "Tomorrow", overdue: false };
    if (diff === -1) return { label: "Yesterday", overdue: true };
    if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, overdue: true };
    if (diff <= 6) return { label: `In ${diff} days`, overdue: false };
    return { label: due.toLocaleDateString(undefined, { month: "short", day: "numeric" }), overdue: false };
  }

  /** Long, friendly date for the header. */
  const formatLongDate = (d = new Date()) =>
    d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  /** Greeting based on hour of day. */
  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  /** Last 7 day buckets (oldest → today) for the weekly chart. */
  function lastNDays(n = 7) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = startOfDay(new Date());
      d.setDate(d.getDate() - i);
      out.push(d);
    }
    return out;
  }

  window.Utils = {
    $, $$, uid, clamp, debounce, escapeHTML,
    startOfDay, isSameDay, daysBetween,
    formatDue, formatLongDate, greeting, lastNDays,
  };
})();
