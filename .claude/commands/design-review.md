# StyleSeat Guardian Design Review & Implementation Skill

When applying design changes or building new UI components for this project, follow these established design principles and patterns.

## Color Palette

- **Primary dark**: `var(--sidebar-bg)` / `#1a3a2a` (dark forest green) — sidebar, primary buttons, auth page accents
- **Primary accent**: `#CDF545` (lime green) — user badge, highlight accents on dark backgrounds
- **Text on dark**: `#fff` for primary, `rgba(255, 255, 255, 0.7)` for secondary
- **Text on light**: `var(--text-primary)` for headings, `var(--text-muted)` for secondary
- **Never use blue** for interactive elements — all focus rings, buttons, and accents use the green palette

## Button Patterns

- **Primary buttons**: `background: var(--sidebar-bg)`, `color: #fff`, green hover glow
- **Secondary buttons**: White background, green border (`var(--sidebar-bg)`), fills green on hover with white text
- **Danger buttons**: White background, red border, fills red on hover with white text
- **Auth page buttons**: Same as primary but with `height: 44px`, `border-radius: var(--radius-md)`
- **Input focus**: Green border + green glow, never blue: `border-color: var(--sidebar-bg)`, `box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.1)`

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
- Footer link (login/register switch) uses `var(--sidebar-bg)` green

### Auth Page Entrance Animation (AuthPages.css)

The login/signup card uses a multi-stage cinematic entrance:

1. **Bloom** (`authCardBloom`, 0.4s `ease-out`): Card starts as invisible point (`scale(0)`, `border-radius: 200px`), expands to full size (`scale(1)`, `border-radius: 16px`). Uses all `px` border-radius values so CSS can interpolate smoothly (never mix `%` and `px`). Glow grows proportionally with scale at each keyframe step (25%, 50%, 75%, 100%).

2. **Boom burst** (`auraBoom`, 0.5s, starts at 0.35s): Fires when bloom completes — a massive light shockwave flaring to 1100px with high opacity (0.9) across aurora colors (lime → teal → cyan → purple), then settling to the resting glow.

3. **Aurora glow** (`auroraGlow`, 6s infinite, starts at 0.9s): Continuous polar-light color cycling on the resting card — 3-stop loop shifting between lime (`#CDF545`), teal (`rgb(100, 220, 180)`), and blue/purple (`rgb(120, 100, 220)`). Uses 7 layered `box-shadow` values spreading up to 650px.

4. **Halo layers**: `::before` (600px) and `::after` (900px) radial gradient pseudo-elements behind the card. Fade in via `haloAppear`, then pulse via `haloBreath` (4s infinite).

5. **Content reveal** (`authContentReveal`, 0.3s, delayed 0.25s): Card children start `opacity: 0` and slide up 8px. Card blooms first as a solid glowing shape, then content fades in — like a flower opening to reveal its center.

### Animation implementation rules
- **Always use `px` for border-radius** in keyframes — CSS cannot smoothly interpolate between `%` and `px` units
- **Glow must grow with scale** — match box-shadow spread to transform scale at each keyframe step
- **Boom fires after bloom** — use `animation-delay` equal to bloom duration minus small overlap
- **Aurora is infinite** — starts after boom settles, loops forever
- **Content children hidden initially** — `.auth-card > *` has `opacity: 0` with delayed animation

## CSS Architecture

- Design tokens in `styles/variables.css`
- Component-scoped CSS files (e.g., `Sidebar.css`, `AuthPages.css`)
- Global styles in `index.css` (buttons, forms, tables, layout)
- Use CSS custom properties for all shared values
- Inline SVG icons with `currentColor` for theme-aware rendering
- Transitions use `var(--transition)` for consistency

## Checklist for New Components

When building or reviewing a new UI component:

- [ ] Uses green palette, no blue anywhere
- [ ] Buttons follow outlined/filled pattern above
- [ ] Input focus uses green ring
- [ ] Hover effects on all clickable elements
- [ ] Consistent border-radius using CSS variables
- [ ] Responsive: works at mobile breakpoints
- [ ] Sidebar integration: add nav link if needed, refresh sidebar if data changes
- [ ] Follows existing service layer pattern for API calls
- [ ] No icon libraries — use inline SVG with `currentColor`
