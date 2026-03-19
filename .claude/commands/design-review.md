# StyleSeat Guardian Design Review & Implementation Skill

When applying design changes or building new UI components for this project, follow these established design principles, patterns, and standards. All work must meet **WCAG 2.2 Level AA** accessibility requirements and **Core Web Vitals** performance thresholds.

## Standards Alignment

| Standard | Version | Requirement |
|----------|---------|-------------|
| **WCAG** | 2.2 Level AA | All new components must pass — focus visibility, touch targets, color contrast, keyboard navigation |
| **Core Web Vitals** | 2026 thresholds | LCP ≤ 2.5s, INP ≤ 200ms, CLS < 0.1 |
| **CSS Baseline** | 2025+ browsers | Container queries, CSS nesting, `:has()`, `oklch()` color functions available but not yet adopted |
| **OWASP** | Top 10:2025 | Error messages must never leak security details (A07, A10) |

---

## Color Palette

- **Primary dark**: `var(--sidebar-bg)` / `#1a3a2a` (dark forest green) — sidebar, primary buttons, auth page accents
- **Primary accent**: `#CDF545` (lime green) — user badge, highlight accents on dark backgrounds
- **Text on dark**: `#fff` for primary, `rgba(255, 255, 255, 0.7)` for secondary
- **Text on light**: `var(--text-primary)` for headings, `var(--text-muted)` for secondary
- **Never use blue** for interactive elements — all focus rings, buttons, and accents use the green palette

### Color Contrast Requirements (WCAG 2.2 AA)

- **Normal text** (< 18px / < 14px bold): minimum **4.5:1** contrast ratio against background
- **Large text** (≥ 18px / ≥ 14px bold): minimum **3:1** contrast ratio
- **UI components & graphical objects**: minimum **3:1** against adjacent colors
- **Focus indicators**: minimum **3:1** contrast between focused and unfocused states (WCAG 2.4.13)
- Always verify status badge text against their tinted backgrounds (e.g., green text `#4CAF50` on `#e8f5e9`)
- Always verify `rgba()` text on dark sidebar backgrounds meets 4.5:1

## Button Patterns

- **Primary buttons**: `background: var(--sidebar-bg)`, `color: #fff`, green hover glow
- **Secondary buttons**: White background, green border (`var(--sidebar-bg)`), fills green on hover with white text
- **Danger buttons**: White background, red border, fills red on hover with white text
- **Auth page buttons**: Same as primary but with `height: 44px`, `border-radius: var(--radius-md)`
- **Input focus**: Green border + green glow, never blue: `border-color: var(--sidebar-bg)`, `box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.1)`

### Button Accessibility

- All buttons must use `<button>` elements, never `<div>` or `<span>` with click handlers
- Icon-only buttons must have `aria-label` describing the action
- Toggle buttons must use `aria-pressed` to communicate state
- Disabled buttons must use the `disabled` attribute (not just CSS opacity)
- Minimum touch target size: **24x24px** (WCAG 2.5.8 Level AA)
- Recommended touch target: **44x44px** for primary actions

## Brand Identity

- **Logo**: Lion image at `/logo.jpg` with CSS filter `hue-rotate(-65deg) saturate(0.5)` to match green palette
- **Wordmark**: "StyleSeat" (font-weight: 600) + "Guardian" (font-weight: 300, reduced opacity) — weight contrast creates hierarchy
- **Sidebar logo**: 42px with rounded corners, padding, multi-layer shadow for depth
- **Auth page logo**: 96px centered lockup with icon + wordmark + tagline, Apple-style

## Sidebar UX — Collapsed State

These are critical UX patterns established through extensive iteration:

### Click-to-expand
- **The entire collapsed sidebar is one click target** — clicking anywhere expands it
- Use `onClickCapture` on the `<aside>` element to intercept clicks before child navigation fires
- No separate expand/collapse button when collapsed — the sidebar IS the button
- When expanded, show a collapse arrow (`<`) in the header

### Icon behavior when collapsed
- **All icons same size**: 42px (logo, nav links, user avatar)
- **All icons scale identically on hover**: `transform: scale(1.12)` with `transition: 0.2s ease`
- **Individual icon hover effects only** — never highlight the whole sidebar background
- Nav link icons use 24px SVG inside the 42px container

### Layout when collapsed
- Logo at top (in header)
- Dashboard/nav icons below logo (nav section, `justify-content: flex-start`)
- User avatar pinned to bottom (footer)
- Nav section keeps `flex: 1` to push footer down
- Remove border dividers between sections when collapsed (`border: none`)

### What NOT to do
- Never place expand button in the middle of the sidebar — user has to hunt
- Never use a separate floating expand button — too easy to miss
- Never highlight the entire sidebar on hover — highlight individual icons instead
- Never use `pointer-events: none` on collapsed icons — they need hover effects
- Never use translucent/semi-transparent buttons for important actions — make them clearly visible

## Sidebar UX — Expanded State

- Project list with expandable chevrons per project showing nested suites
- Auto-expand current project based on URL path (`useLocation` + regex, not `useParams`)
- Collapse button in header, same position as logo area
- Expose `window.__refreshSidebarProjects` for cross-component updates
- Sections hidden when collapsed (`.sidebar--collapsed .sidebar-section { display: none }`)

## General UX Principles

1. **Predictable control placement**: Collapse/expand controls in consistent, expected locations
2. **Hover feedback on every interactive element**: Scale, color change, or shadow — never leave clicks without visual feedback
3. **White backgrounds + dark green accents** for interactive elements on light surfaces
4. **No over-engineering hover states**: Individual element hover, not container hover
5. **Click targets should be obvious**: If something is clickable, the cursor, hover effect, and visual affordance must all signal it
6. **Muscle memory**: Keep related actions (collapse/expand) in the same physical location
7. **Mobile-first considerations**: Sidebar transforms to overlay on mobile with close (X) button

## Auth Pages

- Full-viewport gradient background: `linear-gradient(160deg, #0a1a10 0%, #1a3a2a 40%, #244734 100%)`
- Centered white card with generous padding (48px top, 40px sides)
- Apple-style brand lockup: large icon + wordmark + tagline, all centered
- Error messages use `var(--status-failed-bg)` background with red text
- Error messages must be generic — never reveal allowed email domains, accepted file types, or which validation check failed (OWASP A07/A10)
- Footer link (login/register switch) uses `var(--sidebar-bg)` green

### Auth Page Entrance Animation (AuthPages.css)

The login/signup card uses a multi-stage cinematic entrance:

1. **Bloom** (`authCardBloom`, 0.4s `ease-out`): Card starts as invisible point (`scale(0)`, `border-radius: 200px`), expands to full size (`scale(1)`, `border-radius: 16px`). Uses all `px` border-radius values so CSS can interpolate smoothly (never mix `%` and `px`). Glow grows proportionally with scale at each keyframe step (25%, 50%, 75%, 100%).

2. **Boom burst** (`auraBoom`, 0.5s, starts at 0.35s): Fires when bloom completes — a massive light shockwave flaring to 1100px with high opacity (0.9) across aurora colors (lime -> teal -> cyan -> purple), then settling to the resting glow.

3. **Aurora glow** (`auroraGlow`, 6s infinite, starts at 0.9s): Continuous polar-light color cycling on the resting card — 3-stop loop shifting between lime (`#CDF545`), teal (`rgb(100, 220, 180)`), and blue/purple (`rgb(120, 100, 220)`). Uses 7 layered `box-shadow` values spreading up to 650px.

4. **Halo layers**: `::before` (600px) and `::after` (900px) radial gradient pseudo-elements behind the card. Fade in via `haloAppear`, then pulse via `haloBreath` (4s infinite).

5. **Content reveal** (`authContentReveal`, 0.3s, delayed 0.25s): Card children start `opacity: 0` and slide up 8px. Card blooms first as a solid glowing shape, then content fades in — like a flower opening to reveal its center.

### Animation implementation rules
- **Always use `px` for border-radius** in keyframes — CSS cannot smoothly interpolate between `%` and `px` units
- **Glow must grow with scale** — match box-shadow spread to transform scale at each keyframe step
- **Boom fires after bloom** — use `animation-delay` equal to bloom duration minus small overlap
- **Aurora is infinite** — starts after boom settles, loops forever
- **Content children hidden initially** — `.auth-card > *` has `opacity: 0` with delayed animation
- **Respect `prefers-reduced-motion`** — disable all entrance animations and aurora glow for users who prefer reduced motion (WCAG 2.3.3)

## Upload Error Feedback

Avatar uploads show errors via a red tooltip above the avatar (`.sidebar-upload-error`):
- Red background (`#d32f2f`), white text, 12px font, with downward-pointing arrow
- Positioned absolute above the `.sidebar-user` container
- Auto-dismisses after 4 seconds, click to dismiss early
- Client-side validates file size (5MB max) before uploading
- Server errors (wrong format, magic byte mismatch) displayed from backend response
- Error messages must not reveal accepted formats or internal details (OWASP A10)

## CSS Architecture

- Design tokens in `styles/variables.css`
- Component-scoped CSS files (e.g., `Sidebar.css`, `AuthPages.css`)
- Global styles in `index.css` (buttons, forms, tables, layout)
- Use CSS custom properties for all shared values
- Inline SVG icons with `currentColor` for theme-aware rendering
- Transitions use `var(--transition)` for consistency

---

## Accessibility Checklist (WCAG 2.2 Level AA)

Every new component and design change must pass these checks:

### Perceivable

- [ ] **1.1.1 Non-text content**: All images have meaningful `alt` text; decorative images use `alt=""`
- [ ] **1.3.1 Info & relationships**: Use semantic HTML (`<nav>`, `<main>`, `<section>`, `<header>`, `<footer>`, `<table>`, `<form>`)
- [ ] **1.3.2 Meaningful sequence**: DOM order matches visual order (no CSS-only reordering that breaks screen readers)
- [ ] **1.4.1 Use of color**: Information is not conveyed by color alone (status badges use text labels + color)
- [ ] **1.4.3 Contrast (minimum)**: Normal text ≥ 4.5:1, large text ≥ 3:1
- [ ] **1.4.11 Non-text contrast**: UI components and focus indicators ≥ 3:1 against adjacent colors
- [ ] **1.4.12 Text spacing**: Content adapts when users override letter/word/line spacing
- [ ] **1.4.13 Content on hover/focus**: Tooltips and popovers are dismissible, hoverable, and persistent

### Operable

- [ ] **2.1.1 Keyboard**: All functionality available via keyboard (no mouse-only interactions)
- [ ] **2.1.2 No keyboard trap**: Focus can move freely in and out of all components (except intentional modal traps with escape)
- [ ] **2.4.3 Focus order**: Tab order follows logical reading sequence
- [ ] **2.4.6 Headings & labels**: Headings describe content; form labels describe purpose
- [ ] **2.4.7 Focus visible**: Keyboard focus indicator is always visible (green ring in this app)
- [ ] **2.4.11 Focus not obscured (AA, NEW)**: Focused element is never fully hidden by sticky headers, modals, or overlays
- [ ] **2.5.8 Target size (AA, NEW)**: Interactive targets are at least 24x24px with adequate spacing

### Understandable

- [ ] **3.1.1 Language of page**: `<html lang="en">` set
- [ ] **3.2.1 On focus**: Focus alone does not trigger unexpected context changes
- [ ] **3.2.2 On input**: Changing a form input does not auto-submit or navigate without warning
- [ ] **3.3.1 Error identification**: Form errors are clearly identified and described in text
- [ ] **3.3.2 Labels/instructions**: All form inputs have visible labels (not just placeholders)
- [ ] **3.3.7 Redundant entry (AA, NEW)**: Users are not asked to re-enter information already provided in the same session
- [ ] **3.3.8 Accessible authentication (AA, NEW)**: Login does not require memorizing or transcribing information beyond username/password

### Robust

- [ ] **4.1.2 Name, role, value**: Custom components expose correct ARIA roles, states, and properties
- [ ] **4.1.3 Status messages**: Dynamic status updates use `aria-live` regions (e.g., "Run imported successfully")

---

## ARIA Patterns for App Components

### Sidebar Navigation
```
<nav aria-label="Main navigation">
  <ul role="list">
    <li><a href="/" aria-current="page">Dashboard</a></li>
    ...
  </ul>
</nav>
```
- Use `aria-current="page"` on active nav link
- Use `aria-expanded` on collapsible project/suite sections
- Use `aria-label="Main navigation"` to distinguish from other nav regions

### Modal Dialogs
```
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Confirm Delete</h2>
  ...
</div>
```
- Trap focus inside modal while open
- Return focus to trigger element on close
- Close on Escape key
- Backdrop prevents interaction with content behind

### Data Tables
```
<table>
  <caption class="sr-only">Test results for P1 Search run</caption>
  <thead>
    <tr><th scope="col">ID</th><th scope="col">Title</th>...</tr>
  </thead>
  ...
</table>
```
- Use `<th scope="col">` for column headers
- Use `<caption>` (visible or `sr-only`) to describe table purpose
- Sortable columns use `aria-sort="ascending"` / `"descending"` / `"none"`

### Status Badges
- Never convey status by color alone — always include text label
- Use `role="status"` or `aria-live="polite"` for dynamically changing status indicators

### Toast / Error Messages
- Use `role="alert"` for urgent errors (login failure, upload failure)
- Use `aria-live="polite"` for non-urgent status updates (import complete)
- Auto-dismissing messages must remain long enough to be read (minimum 4 seconds)

### Form Validation
```
<input id="email" aria-describedby="email-error" aria-invalid="true" />
<span id="email-error" role="alert">Unable to create account...</span>
```
- Link errors to inputs via `aria-describedby`
- Set `aria-invalid="true"` on fields with errors
- Use `role="alert"` so screen readers announce errors immediately

---

## Performance Checklist (Core Web Vitals)

### LCP ≤ 2.5s (Largest Contentful Paint)
- [ ] Hero images and logos use `loading="eager"` (not lazy) and `fetchpriority="high"`
- [ ] Critical CSS inlined or loaded with high priority
- [ ] Fonts use `font-display: swap` to prevent invisible text during load
- [ ] No render-blocking JavaScript in the critical path
- [ ] API calls for above-the-fold content start immediately (not after secondary renders)

### INP ≤ 200ms (Interaction to Next Paint)
- [ ] No long tasks (> 50ms) blocking the main thread during interaction
- [ ] Event handlers do not perform synchronous heavy computation
- [ ] Large list rendering uses virtualization or pagination (not rendering 1000+ DOM nodes)
- [ ] React state updates that trigger large re-renders are debounced or batched
- [ ] Avoid layout thrashing (reading then writing DOM properties in loops)

### CLS < 0.1 (Cumulative Layout Shift)
- [ ] All `<img>` and `<video>` elements have explicit `width` and `height` attributes
- [ ] Fonts loaded with `font-display: swap` — fallback font metrics match web font to minimize reflow
- [ ] Dynamic content (loading spinners, error banners, toast messages) has reserved space
- [ ] No content injected above existing content after initial render
- [ ] Sidebar collapse/expand uses `transform` or `width` transition (not reflow-triggering properties)

### General Performance
- [ ] Bundle size checked — no full-library imports (e.g., `import { Chart } from 'chart.js'` not `import Chart from 'chart.js/auto'`)
- [ ] Images in modern formats (WebP/AVIF) with appropriate srcset for responsive sizes
- [ ] Lazy load below-the-fold images and heavy components
- [ ] `prefers-reduced-motion` respected — disable non-essential animations

---

## Motion & Animation Standards

### `prefers-reduced-motion` (WCAG 2.3.3)
All animations must have a reduced-motion fallback:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```
- Auth page bloom/aurora/halo animations: disabled entirely
- Hover scale effects: reduced to opacity-only changes
- Page transition animations: instant (no slide/fade)
- Loading spinners: exempt (functional, not decorative)

### Animation Performance
- Use `transform` and `opacity` only for animations (GPU-composited, no layout/paint)
- Never animate `width`, `height`, `top`, `left`, `margin`, or `padding`
- Use `will-change` sparingly and only on elements that are about to animate
- Set `contain: layout style` on animated containers to limit browser repaint scope

---

## Responsive Layout Rules

The app uses a **3-tier responsive breakpoint system**. Every new page or component MUST follow these rules:

**Breakpoints** (all `max-width`):
- **1024px** — Mid-range screens where the 270px sidebar is still visible (~750px content area)
- **768px** — Mobile: sidebar hidden, hamburger menu, single-column layouts
- **640px** — Small mobile: further simplification

**Critical CSS rules for flex/grid layouts:**
1. **Always add `min-width: 0`** on flex children that contain dynamic content — prevents overflow
2. **Always add `overflow-x: hidden`** on content containers that should never scroll horizontally
3. **Never rely on fixed-width columns alone** — every row with fixed-width columns must have a `@media (max-width: 1024px)` rule

**1024px breakpoint checklist:**
- Reduce `page-content` padding (28px -> 20px)
- Hide secondary data columns (tested-by, meta, date)
- Shrink remaining fixed columns (90px -> 70px for IDs)
- Stack page toolbars vertically (`flex-direction: column`)
- Constrain floating bars with `max-width: calc(100% - 32px)` and `flex-wrap: wrap`
- Reduce tab padding (22px -> 14px)
- Stack form rows (`flex-direction: column`)
- Shrink grid columns (4-col -> 2-col)

**768px breakpoint checklist:**
- All of the above, plus hide sidebar, show hamburger
- Hide all secondary columns
- Stat tiles: hide pass rate tile, reduce min-width to 70px
- Stack all multi-column layouts to single column

---

## Security in UI (OWASP 2025)

### Error Message Rules (A07, A10)
- **Registration errors**: Display generic "Unable to create account. Please contact your administrator." — never reveal domain restrictions, duplicate field, or which check failed
- **Login errors**: Display "Invalid username or password" for ALL failure modes
- **Upload errors**: Display server error message as-is (backend already sanitized), never add client-side details about accepted formats
- **Form validation**: Client-side format hints (e.g., "Enter your email") are acceptable; server rejection messages must be generic

### No Sensitive Data in Frontend (A04)
- No API keys, tokens, or secrets in source code
- No hardcoded domain restrictions visible in client-side validation
- JWT stored in localStorage (acceptable for this app; note XSS risk)
- 401 interceptor clears token and redirects to `/login`

### Content Security (A05)
- No `dangerouslySetInnerHTML` with user-supplied content
- Sanitize any user-generated content before rendering
- Avatar `<img>` tags: use `src` from backend response only, never user-controlled URLs

---

## Checklist for New Components

When building or reviewing a new UI component:

### Visual & Brand
- [ ] Uses green palette, no blue anywhere
- [ ] Buttons follow outlined/filled pattern
- [ ] Input focus uses green ring
- [ ] Hover effects on all clickable elements
- [ ] Consistent border-radius using CSS variables
- [ ] No icon libraries — use inline SVG with `currentColor`

### Accessibility (WCAG 2.2 AA)
- [ ] Semantic HTML elements used (`<button>`, `<nav>`, `<table>`, `<form>`, not `<div>` with handlers)
- [ ] All interactive elements reachable and operable via keyboard
- [ ] Focus indicator visible and not obscured (WCAG 2.4.11)
- [ ] Touch targets ≥ 24x24px (WCAG 2.5.8)
- [ ] Color contrast meets minimums (4.5:1 normal text, 3:1 large text / UI components)
- [ ] `aria-label` on icon-only buttons
- [ ] `aria-expanded` on collapsible/expandable elements
- [ ] `aria-live` regions for dynamic status updates
- [ ] `aria-invalid` + `aria-describedby` for form validation errors
- [ ] `prefers-reduced-motion` respected for all animations
- [ ] Screen reader tested (or at minimum: logical DOM order, no missing labels)

### Performance
- [ ] No layout shift (explicit dimensions on images, reserved space for dynamic content)
- [ ] No long main-thread tasks in event handlers
- [ ] Large lists virtualized or paginated
- [ ] Images lazy-loaded (except LCP image)
- [ ] Animations use `transform`/`opacity` only

### Responsive
- [ ] Works at 1024px, 768px, and 640px breakpoints
- [ ] Sidebar integration: add nav link if needed, refresh sidebar if data changes
- [ ] Follows existing service layer pattern for API calls

### Security
- [ ] Error messages are generic — no internal details leaked
- [ ] No `dangerouslySetInnerHTML` with user content
- [ ] No secrets or API keys in frontend source

## References

- [WCAG 2.2 Specification](https://www.w3.org/WAI/standards-guidelines/wcag/)
- [WCAG 2.2 AA Checklist (Level Access)](https://www.levelaccess.com/blog/wcag-2-2-aa-summary-and-checklist-for-website-owners/)
- [WebAIM WCAG 2 Checklist](https://webaim.org/standards/wcag/checklist)
- [Core Web Vitals (web.dev)](https://web.dev/articles/vitals)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [React Accessibility Docs](https://legacy.reactjs.org/docs/accessibility.html)
- [Modern CSS Toolkit 2026](https://www.nickpaolini.com/blog/modern-css-toolkit-2026)
- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)