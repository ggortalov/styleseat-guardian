---
name: frontend-design
description: Build production-grade frontend components and pages for the StyleSeat Guardian app. Applies the project's established design system (forest green palette, DM Sans typography, 3-tier responsive breakpoints) while producing distinctive, polished UI that avoids generic AI aesthetics. Use when creating new pages, components, tabs, modals, or redesigning existing UI.
---

# StyleSeat Guardian — Frontend Design Skill

You are building UI for **StyleSeat Guardian**, a test management application with a React 19 + Vite frontend. Every component you create must feel like it belongs in this app — same palette, same typography, same interaction patterns — while being visually distinctive and polished.

## Design System — Non-Negotiable Foundation

Before writing any code, internalize these constraints. They are not suggestions.

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--sidebar-bg` | `#1a3a2a` | Primary buttons, focus rings, tabs, accents — NEVER blue |
| `--sidebar-hover` | `#244734` | Button hover, active sidebar items |
| `--primary-light` | `#e8f5e9` | Expanded rows, selected states, subtle highlights |
| `--bg-main` | `#e0ede4` | Page background |
| `--bg-white` | `#ffffff` | Cards, panels, table backgrounds |
| `--bg-subtle` | `#f6fbf8` | Alternating rows, secondary panels |
| `--text-primary` | `#1a2b23` | Headings, primary content |
| `--text-secondary` | `#5f6d64` | Body text, descriptions |
| `--text-muted` | `#8d9e94` | Captions, timestamps, labels |
| `--border` | `#d4ddd7` | Input borders, dividers |
| `--border-light` | `#e8eeea` | Card borders, table lines |
| Lime accent | `#CDF545` | Auth pages, dark-bg highlights only |

**Status colors** (use via CSS vars): Passed=#2e7d32, Failed=#c62828, Blocked=#e65100, Retest=#00695c, Untested=#78909c

**Rule**: All interactive elements use the green palette. No blue anywhere. No purple. No generic gray buttons.

### Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Body | `var(--font-sans)` = DM Sans | 400–600 | 13–14px |
| Headings | DM Sans | 700 | 18–28px |
| Sidebar brand | DM Sans | 600 "StyleSeat" + 300 "Guardian" |  |
| Monospace | `var(--font-mono)` = JetBrains Mono | 400 | 12px |
| Labels/caps | DM Sans | 600–700 | 10–11px, uppercase, letter-spacing: 0.3px |

Do NOT introduce new fonts. DM Sans is the app font. Work within its weight range (300–700) to create hierarchy.

### Spacing & Radius

- Page padding: 28px (20px at 1024px, 16px mobile)
- Card padding: 12–16px
- Border radius: `--radius-sm` (6px), `--radius-md` (10px), `--radius-lg` (14px), `--radius-full` (pill)
- Shadows: `--shadow-xs` through `--shadow-xl` — use progressively for elevation

### Icons

- **Inline SVG only** — no icon libraries (no Lucide, no Heroicons, no FontAwesome imports)
- Use `currentColor` for stroke/fill so icons inherit text color
- Standard size: 16–20px for inline, 24px for nav
- strokeWidth: 1.5–2 for thin/medium, 2–2.5 for emphasis

## Design Thinking — Within Constraints

The generic Anthropic frontend-design skill tells you to "make bold choices." Here, **bold means distinctive execution within the established system**, not inventing a new palette or font stack.

Before coding, answer:
1. **What state does the user see most?** Design for that state first (empty state, loaded state, error state).
2. **What's the information hierarchy?** What should the eye hit first, second, third?
3. **What interaction pattern exists nearby?** Match the existing page's patterns (tabs, pills, expand/collapse, cards).
4. **What's the one visual detail that elevates this?** A well-placed animation, a smart use of the status colors, a satisfying expand transition.

### What "Distinctive" Means Here

- **Purposeful whitespace** — let content breathe, don't cram
- **Status-aware color** — use the status palette semantically (green = good, red = bad, orange = warning, purple = special)
- **Layered elevation** — cards on panels, expanded rows with subtle background shifts, shadow-on-hover for interactivity cues
- **Micro-interactions** — hover lifts (`translateY(-1px) + shadow`), press compression (`scale(0.97)`), smooth expand/collapse
- **Tinted pill badges** — colored text on matching light background (e.g., `color: #d32f2f; background: #ffebee`)
- **Data visualization** — colored dots, mini bar charts, progress bars, stacked bars — not just numbers

### What to Avoid

- Generic gray cards with no personality
- Flat layouts with no elevation or depth
- Tables with no visual hierarchy (all columns look the same)
- Empty states that just say "No data" with no guidance
- SVGs with complex `<path d="">` that are really multi-element drawings — break them into proper `<circle>`, `<line>`, `<polyline>`, `<rect>` elements
- `color-mix()` and other CSS functions with spotty browser support — use explicit hex/rgba

## Component Patterns

### Buttons

```css
/* Primary */
.btn-primary {
  background: var(--sidebar-bg);
  color: #fff;
  border: none;
  border-radius: var(--radius-full);
  padding: 7px 18px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.btn-primary:hover { background: var(--sidebar-hover); }
.btn-primary:active { transform: scale(0.97); }

/* Secondary (outlined) */
.btn-secondary {
  background: #fff;
  color: var(--sidebar-bg);
  border: 1.5px solid var(--sidebar-bg);
  /* fills green on hover */
}
.btn-secondary:hover {
  background: var(--sidebar-bg);
  color: #fff;
}
```

### Cards

```css
.card {
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px;
  transition: box-shadow 0.15s, transform 0.15s;
}
.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}
```

### Status Badges (tinted pills)

```css
.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  /* Color set per status: */
  /* Passed: color: var(--status-passed); background: var(--status-passed-bg); */
}
```

### Sortable Table Headers

```css
th {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  cursor: pointer;
  user-select: none;
}
th:hover { color: var(--sidebar-bg); }
```

### Expandable Row Pattern

- Click row to toggle inline detail panel
- Expanded row: `background: var(--primary-light)` with `border-bottom: 2px solid var(--border-light)`
- Detail content in grid/flex layout inside the expanded `<td colSpan>`
- Smooth height transition (or immediate — no janky animation)

### Empty/Zero State

- Centered layout with icon (in a tinted circular background), title, description, and optional action
- Icon background: `#E8F5E9` for success/healthy, `#FFF3E0` for warning, `#FFEBEE` for error
- Title: 18–20px bold
- Description: 14px secondary text, max-width 480px, centered

### Filter Pills

```css
.pill {
  padding: 6px 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.pill--active {
  background: var(--sidebar-bg);
  border-color: var(--sidebar-bg);
  color: #fff;
}
```

## Responsive — 3-Tier Breakpoints (Required)

Every component MUST have responsive rules:

### 1024px (mid-range, ~750px content)
- Hide secondary table columns (dates, metadata, tertiary info)
- Shrink fixed-width columns
- Reduce gaps and padding
- 4-col grids become 2-col

### 768px (mobile)
- Stack toolbars vertically (`flex-direction: column`)
- Single-column layouts
- Hide trend visualizations, sparklines, secondary badges
- Tile grids become 2-col

### 640px (small mobile)
- Further column hiding
- Smaller font sizes on tiles
- Compact pill/button padding

### Critical CSS Rules
```css
/* ALWAYS on flex children with dynamic content */
.flex-child { min-width: 0; }

/* ALWAYS on content containers */
.content { overflow-x: hidden; }

/* Text truncation pattern */
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

## CSS Architecture Rules

- **Prefix all classes** with a 2–3 letter component prefix (e.g., `th-` for Test Health, `ov-` for Overview)
- **Use CSS custom properties** from `variables.css` — never hardcode colors that exist as tokens
- **Component-scoped CSS** — each page has its own `.css` file
- **Transitions**: Use `0.15s` for micro (hover, color), `0.25s` for layout (expand, slide), `0.3s` for entrance (fade, slide-up)
- **Animations**: `fadeIn`, `slideUp`, `scaleIn` keyframes already exist in `index.css`

## Motion & Animation

### Entrance Animations
- Page content: `animation: slideUp 0.3s ease both`
- Cards loading: stagger with `animation-delay: calc(var(--i) * 50ms)`
- Modals: `animation: scaleIn 0.2s ease`

### Hover Interactions
- Cards: `transform: translateY(-1px)` + `box-shadow: var(--shadow-md)`
- Buttons: `background` color transition, `scale(0.97)` on `:active`
- Table rows: `background: var(--bg-hover, #f8f9fa)` on hover
- Links: green underline or color shift to `var(--sidebar-bg)`

### Respect `prefers-reduced-motion`
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Accessibility (WCAG 2.2 AA)

Non-negotiable for every component:
- Semantic HTML: `<button>`, `<nav>`, `<table>`, `<form>` — not `<div>` with onClick
- Color contrast: 4.5:1 for text, 3:1 for UI components
- Keyboard navigation: all interactive elements tabbable and operable
- Focus indicator: green ring (`box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.15)`)
- `aria-label` on icon-only buttons
- `aria-expanded` on collapsible elements
- `aria-sort` on sortable table headers
- Touch targets: minimum 24x24px
- Status conveyed by text + color, never color alone

## Service Layer Pattern

All API calls go through service files in `src/services/`:
```js
// Example: src/services/runService.js
export default {
  getAll: (projectId) => api.get(`/projects/${projectId}/runs`).then(r => r.data),
  // ...
};
```
- Axios instance in `api.js` with JWT interceptor
- Base URL: `http://localhost:5001/api`
- 401 response clears token, redirects to `/login`

## File Organization

- Pages: `src/pages/PageName.jsx` + `src/pages/PageName.css`
- Components: `src/components/ComponentName.jsx` + optional `.css`
- Routes: added in `App.jsx`, wrapped with `<ProtectedRoute>` if auth required
- Sidebar: add nav link in `Sidebar.jsx` if the page needs sidebar presence

## Quality Bar

Before considering any UI work complete:
1. **Build passes** — `npx vite build` exits 0
2. **Responsive** — tested at 1024px, 768px, 640px breakpoints
3. **States covered** — loading, empty, error, loaded, zero-data
4. **Hover/active** — every clickable element has visual feedback
5. **Accessibility** — keyboard navigable, proper ARIA, contrast passes
6. **No generic aesthetics** — no purple gradients, no Inter font, no cookie-cutter cards