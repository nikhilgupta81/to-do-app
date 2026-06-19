# Dayflow — Daily To-Do

A premium, production-minded daily to-do application with a dashboard, analytics,
command palette, and full theming. Built **framework-free** (vanilla JS + a CSS
design system) so it runs by opening one file — yet architected like a real
product: unidirectional data flow, a single source of truth, reusable render
functions, and clean layer separation.

> Think Linear's polish, Notion's calm, Stripe's gradients — in ~1,500 lines, no build step.

---

## Quick start

```bash
# Option A — just open it
open index.html            # works directly via file:// (scripts use plain <script> tags)

# Option B — serve it (recommended; matches production)
node server.js             # → http://localhost:4321
# or
python3 -m http.server 4321
```

No `npm install`, no bundler, no dependencies.

---

## 1. Design concept

| Principle | How it shows up |
|-----------|-----------------|
| **Calm, focused surface** | Generous whitespace, one accent gradient, muted secondary text, restrained shadows. |
| **Depth via glass** | `backdrop-filter` glassmorphism on the sidebar, cards, search, and modals — layered over a soft radial brand gradient. |
| **Motion with meaning** | Entrance stagger on tasks, animated progress ring/bars, spring-eased modals, a confetti burst on completion. Never decorative-only. |
| **One source of truth for color** | Everything themes off CSS custom properties; dark/light is a single `data-theme` flip, and the accent palette rewrites three brand variables live. |
| **Premium typography** | Inter, tight tracking on headings (`-0.03em`), a deliberate type scale. |

---

## 2. Folder structure

```
TO-DO_LIST/
├── index.html              # App shell + all static markup (semantic, a11y-first)
├── server.js               # Zero-dependency static server for local preview
├── README.md
└── src/
    ├── css/
    │   └── styles.css      # Design system: tokens → reset → layout → components → motion → responsive
    └── js/
        ├── utils.js        # Pure, testable helpers (dates, debounce, escapeHTML)   → window.Utils
        ├── icons.js        # Inline SVG icon set (currentColor, crisp at any DPI)    → window.Icons
        ├── store.js        # State container: actions, selectors, persistence        → window.Store
        └── app.js          # View + controller: render fns, events, modals, palette  → (boot)
```

**Load order matters** (declared in `index.html`): `utils → icons → store → app`.

---

## 3. Component hierarchy

```
App
├── Loader (perceived-performance shimmer)
├── Sidebar
│   ├── Brand
│   ├── Nav (Today · All · Dashboard · Command palette)
│   └── StreakPill
├── Main
│   ├── Topbar (Greeting · Search · ThemePalette · ThemeToggle · AddButton)
│   ├── View: Tasks
│   │   ├── StatCard ×4
│   │   ├── ProgressCard (Ring + Bar)
│   │   ├── FilterChips (status + categories)
│   │   └── TaskList → TaskItem (Checkbox · Body · Tags · Actions)  |  EmptyState
│   └── View: Dashboard
│       ├── StatCard ×4 (completion · streak · completed · productivity)
│       ├── WeeklyChart  ·  CategoryBreakdown
│       └── SmartSuggestions (AI-ranked)
├── TaskModal (add / edit)
├── ConfirmModal
├── CommandPalette (⌘K)
└── Toasts + SuccessBurst
```

Even though it's vanilla, each piece is an isolated **render function** that takes
state and returns markup — the same mental model as a React component, which keeps
the door open to porting it to React/Vue later with near-zero logic changes.

---

## 4. Architecture & data flow

Unidirectional, Redux-style, in ~40 lines (`store.js`):

```
UI event ──▶ Store.actions.x() ──▶ commit(producer)
                                      │
                                      ├─▶ persist to localStorage
                                      └─▶ notify subscribers ──▶ render()
```

- **The view never mutates state.** It dispatches actions; the store is the only
  writer. This makes behavior predictable and trivially debuggable.
- **Selectors** (`visibleTasks`, `stats`, `weekly`, `streak`, `suggestions`) are
  pure derivations over state — no duplicated/denormalized data to keep in sync.
- **Persistence is automatic**: every `commit` writes to `localStorage`, wrapped in
  try/catch and merged with defaults on load (forward-compatible across versions).

---

## 5. Feature checklist

**Core** — add · edit · delete · complete · categories · priorities (Low/Med/High)
· due dates · search · filters (status + category) · drag-and-drop reordering ·
localStorage persistence · confirmation modals · beautiful empty states.

**Dashboard** — total/completed/pending · completion % · productivity score ·
weekly bar chart · per-category breakdown · streak counter.

**Senior-level / interview features**
1. **Command palette (⌘K)** — fuzzy command + task search with full keyboard nav.
2. **Smart suggestions** — a transparent heuristic that ranks open tasks by
   priority × due-date urgency (an honest "AI prioritization" mockup, no black box).
3. **Productivity score** — completion weighted by the priority of finished tasks,
   so clearing a High counts more than a Low.
4. **Theme customization** — dark/light + a live 5-way accent palette that rewrites
   brand CSS variables at runtime.
5. **Micro-interactions** — animated checkbox draw, confetti burst, toasts,
   staggered list entrance, animated ring/bars.

---

## 6. Keyboard shortcuts

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| `⌘/Ctrl + K` | Command palette | `N` | New task |
| `/` | Focus search | `T` | Toggle theme |
| `1` `2` `3` | Today / All / Dashboard | `Esc` | Close any overlay |
| `↑ ↓ Enter` | Navigate palette | | |

---

## 7. Performance optimizations

- **Zero dependencies, zero build** → instant load, no hydration cost.
- **CSS-variable theming** → theme switches are a single attribute change; no
  re-layout, no re-paint of styles per element.
- **Debounced search** (180 ms) avoids re-render thrash while typing.
- **Event delegation** — one listener per list instead of one per row; dynamically
  rendered tasks need no re-binding.
- **GPU-friendly animations** — transforms/opacity only; `requestAnimationFrame`
  drives the chart fill after paint.
- **`prefers-reduced-motion`** disables animation for users who ask for it.
- **XSS-safe rendering** — all user text passes through `escapeHTML` before
  `innerHTML`.

---

## 8. Accessibility

- Semantic landmarks (`aside`, `main`, `header`, `nav`), `aria-label`s on icon
  buttons, `role="dialog"`/`alertdialog"` with `aria-modal` on overlays.
- Checkbox uses `role="checkbox"` + `aria-checked`; the task list is `aria-live`.
- Visible, consistent `:focus-visible` ring; full keyboard operability (palette,
  shortcuts, Esc-to-close).
- Color is never the only signal — priority/category also carry text labels.
- Respects `prefers-reduced-motion` and `prefers-color-scheme` on first run.

---

## 9. Interview talking points (why each choice)

- **"Why no framework?"** To prove I understand what frameworks do *for* me — I
  rebuilt a tiny unidirectional store, a render loop, and component boundaries by
  hand. The structure ports to React with the logic untouched.
- **Single source of truth + selectors** — the same pattern as Redux/Zustand: state
  is normalized, everything else is derived, so the UI can never drift from data.
- **Design tokens** — theming, dark mode, and accent customization all fall out of
  one variable layer for free. That's a scalability and design-system story.
- **Smart suggestions are a *transparent* heuristic, not fake magic** — I can
  explain exactly how the ranking score is computed, which is the honest way to
  ship an "AI" feature.
- **Accessibility & reduced-motion were designed in, not bolted on** — signals
  production maturity.
- **Perceived performance** — the loader shimmer and staggered entrance make the
  app *feel* fast, which matters as much as raw speed.

---

## 10. Roadmap (how it scales)

Recurring tasks · subtasks/checklists · calendar view · cloud sync (swap the
localStorage adapter behind the same `persist`/`load` interface) · multi-list
workspaces · export/import JSON. The store/selector boundary means each is an
additive change, not a rewrite.
