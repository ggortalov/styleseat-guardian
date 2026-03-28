# Frontend Patterns Reference — Design System & Accessibility

Guardian's established design system rules. Every finding should be checked against these patterns.

## Color Palette (Non-Negotiable)

| Token | Hex | Usage |
|-------|-----|-------|
| `--sidebar-bg` | `#1a3a2a` | Primary buttons, focus rings, tabs, accents |
| `--sidebar-hover` | `#244734` | Button hover, active sidebar items |
| `--primary-light` | `#e8f5e9` | Expanded rows, selected states |
| `--bg-main` | `#e0ede4` | Page background |
| `--bg-white` | `#ffffff` | Cards, panels, tables |
| `--text-primary` | `#1a2b23` | Headings |
| `--text-secondary` | `#5f6d64` | Body text |
| `--text-muted` | `#8d9e94` | Labels, timestamps |
| `--border` | `#d4ddd7` | Input borders |
| `--border-light` | `#e8eeea` | Card borders |

**Rule**: All interactive elements use the green palette. No blue, no purple, no generic gray buttons.

**Accent Rule — Unified Primary Green**: Decorative accents on structural UI (stat tiles, KPI cards, section icons, card borders) must all use the **same primary green palette** (`--sidebar-bg` / `--primary-light`). Never assign per-element accent colors for decoration — status colors are reserved **strictly for data meaning**. No rainbow accent bars, no per-tile color theming.

**Status colors**: Passed=#2e7d32, Failed=#c62828, Blocked=#e65100, Retest=#00695c, Untested=#78909c

## Typography

- Body: DM Sans, 400-600, 13-14px
- Headings: DM Sans, 700, 18-28px
- Monospace: JetBrains Mono, 400, 12px
- Labels: DM Sans, 600-700, 10-11px, uppercase, letter-spacing: 0.3px
- No other fonts allowed

## Component Patterns to Validate

### Buttons
- Primary: `var(--sidebar-bg)` bg, white text, pill radius
- Secondary: white bg, green border, fills green on hover
- Active: `scale(0.97)` press effect
- Every button must be a `<button>` element, not a `<div>` with onClick

### Cards & Stat Tiles
- Cards use uniform `border: 1px solid var(--border-light)` — no per-card colored accent borders
- Stat tile icon circles: `background: var(--primary-light); color: var(--sidebar-bg)` — same for all tiles
- Flag as a bug: per-element colored `border-left`, `border-top`, or `::before` accent bars that vary color across tiles/cards

### Status Badges (Tinted Pills)
- Colored text on matching light background
- `border-radius: var(--radius-full)`
- Font: 11px, weight 600

### Sortable Table Headers
- `font-size: 11px`, weight 700, uppercase, `letter-spacing: 0.3px`
- `cursor: pointer`, `user-select: none`
- Hover: color shifts to `var(--sidebar-bg)`
- Must have `aria-sort` attribute

### Expandable Rows
- Expanded: `background: var(--primary-light)`
- Must have `aria-expanded` attribute
- Smooth transition or immediate (no janky animation)

### Empty States
- Centered icon in tinted circular background
- Title: 18-20px bold
- Description: 14px secondary, max-width 480px
- Optional action button

## Icons

- **Inline SVG only** — no icon libraries (Lucide, Heroicons, FontAwesome)
- Use `currentColor` for stroke/fill
- Size: 16-20px inline, 24px nav
- strokeWidth: 1.5-2
- Build from simple elements (`<circle>`, `<line>`, `<polyline>`, `<rect>`, `<path>`)
- Do NOT use complex single `<path d="">` for multi-element drawings

## CSS Rules

- Prefix all classes with 2-3 letter component prefix (e.g., `th-`, `ov-`)
- Use CSS custom properties from `variables.css`
- Never hardcode colors that exist as tokens
- Component-scoped CSS (each page has its own `.css` file)
- Transitions: `0.15s` micro, `0.25s` layout, `0.3s` entrance
- No `color-mix()` or other CSS functions with spotty browser support

## Responsive Breakpoints (Required)

Every component must have rules for all three tiers:

### 1024px (mid-range)
- Hide secondary columns
- Shrink fixed-width columns
- Reduce gaps/padding
- 4-col grids -> 2-col

### 768px (mobile)
- Stack toolbars vertically
- Single-column layouts
- Hide trend visualizations, sparklines
- Tile grids -> 2-col

### 640px (small mobile)
- Further column hiding
- Smaller font sizes
- Compact padding

### Critical CSS Rules
```css
/* ALWAYS on flex children with dynamic content */
.flex-child { min-width: 0; }

/* ALWAYS on content containers */
.content { overflow-x: hidden; }

/* Text truncation */
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

## WCAG 2.2 AA Checklist

### Perceivable
- [ ] Color contrast: 4.5:1 text, 3:1 UI components
- [ ] Status conveyed by text + color (never color alone)
- [ ] Images have alt text (decorative: `alt=""`)
- [ ] Videos have captions (if applicable)

### Operable
- [ ] All interactive elements keyboard-accessible (Tab, Enter, Space, Escape)
- [ ] Focus indicator visible: `box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.15)`
- [ ] No keyboard traps (modals have Escape to close)
- [ ] Touch targets >= 24x24px
- [ ] `prefers-reduced-motion` respected on all animations

### Understandable
- [ ] Form inputs have linked `<label>` elements
- [ ] Error messages use `aria-describedby` + `aria-invalid`
- [ ] Navigation is consistent across pages
- [ ] Language declared on `<html>` element

### Robust
- [ ] Semantic HTML: `<button>`, `<nav>`, `<table>`, `<form>`, `<main>`
- [ ] `aria-label` on icon-only buttons
- [ ] `aria-expanded` on collapsible elements
- [ ] `aria-sort` on sortable table headers
- [ ] `aria-live="polite"` on dynamic content regions
- [ ] Valid HTML (no duplicate IDs, proper nesting)

## Motion & Animation

### Entrance
- Page: `animation: slideUp 0.3s ease both`
- Cards: stagger with `animation-delay: calc(var(--i) * 50ms)`
- Modals: `animation: scaleIn 0.2s ease`

### Hover
- Cards: `translateY(-1px)` + `box-shadow: var(--shadow-md)`
- Buttons: background transition, `scale(0.97)` on `:active`
- Table rows: `background: var(--bg-hover, #f8f9fa)`

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Service Layer Pattern

All API calls go through `src/services/*.js`:
```js
export default {
  getAll: (projectId) => api.get(`/projects/${projectId}/runs`).then(r => r.data),
};
```
- Axios instance in `api.js` with JWT interceptor
- Base URL: `http://localhost:5001/api`
- 401 response clears token, redirects to `/login`