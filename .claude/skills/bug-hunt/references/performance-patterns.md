# Performance Patterns Reference

Performance anti-patterns and optimization checklist for StyleSeat Guardian.

## Backend Performance

### N+1 Query Detection

The #1 performance issue in ORM-based apps. Look for loops that trigger additional queries:

```python
# BAD: N+1 — one query per run to get results
runs = TestRun.query.filter_by(project_id=project_id).all()
for run in runs:
    results = run.results  # Each access triggers a SELECT — N queries!

# GOOD: Eager load with joinedload
from sqlalchemy.orm import joinedload
runs = TestRun.query.filter_by(project_id=project_id).options(
    joinedload(TestRun.results)
).all()

# GOOD: Batch query
run_ids = [r.id for r in runs]
results = TestResult.query.filter(TestResult.run_id.in_(run_ids)).all()
```

### Unbounded Queries

Every query that could return a large result set needs pagination or limits:

```python
# BAD: Returns all rows — could be thousands
results = TestResult.query.filter_by(run_id=run_id).all()

# GOOD: Paginated
page = request.args.get("page", 1, type=int)
per_page = min(request.args.get("per_page", 50, type=int), 200)
results = TestResult.query.filter_by(run_id=run_id).paginate(
    page=page, per_page=per_page
)
```

### Missing Indexes

Check that frequently-queried columns have indexes:

```python
# These columns should be indexed:
# - Foreign keys used in JOINs and WHERE clauses
# - Columns used in ORDER BY
# - Columns used in GROUP BY
# - Status/type columns used for filtering

# Already indexed by SQLAlchemy (primary keys, unique constraints, ForeignKey)
# May need manual index for:
test_results.status  # Filtered frequently
test_runs.project_id  # Already FK-indexed
test_runs.is_completed  # Filtered in dashboard queries
```

### Expensive Aggregations

Dashboard and statistics endpoints often compute aggregations on every request:

```python
# BAD: Recomputes on every request
@bp.route("/projects/<int:id>/stats")
def get_stats(id):
    # Counts every result row every time
    passed = TestResult.query.filter_by(status="Passed").count()

# BETTER: Cache with TTL (for frequently-accessed stats)
# Or: Precompute in background task
# Or: Use SQL aggregation instead of Python loops
stats = db.session.query(
    TestResult.status,
    db.func.count(TestResult.id)
).filter_by(run_id=run_id).group_by(TestResult.status).all()
```

### SQLite-Specific

- WAL mode should be enabled: `PRAGMA journal_mode=WAL`
- Foreign keys must be explicitly enabled: `PRAGMA foreign_keys=ON`
- Connection pooling: SQLite handles concurrent reads well in WAL mode, but writes are serialized
- Large transactions: batch commits instead of per-row commits

## Frontend Performance

### Unnecessary Re-renders

```jsx
// BAD: Object/array created every render — causes child re-renders
function Parent() {
  return <Child style={{ color: "red" }} items={[1, 2, 3]} />;
}

// GOOD: Stable references
const style = { color: "red" };
const items = [1, 2, 3];
function Parent() {
  return <Child style={style} items={items} />;
}

// GOOD: useMemo for computed values
const filteredItems = useMemo(
  () => items.filter(i => i.status === filter),
  [items, filter]
);
```

### Context Performance

```jsx
// BAD: Entire app re-renders when any auth state changes
const AuthContext = createContext({ user, token, settings, theme });

// GOOD: Split contexts by update frequency
const AuthContext = createContext({ user, token });      // Changes rarely
const SettingsContext = createContext({ settings });       // Changes sometimes
const ThemeContext = createContext({ theme });             // Changes often
```

### Large List Rendering

For lists with 100+ items, consider virtualization:

```jsx
// If the app grows to large datasets, these libraries help:
// - react-window (lightweight)
// - react-virtuoso (feature-rich)
// Current app: most lists are <100 items, virtualization not needed yet
```

### Bundle Size

- Import only what you need from libraries:
  ```jsx
  // BAD: Imports entire Chart.js
  import Chart from "chart.js/auto";

  // GOOD: Import only needed components
  import { Chart, ArcElement, Tooltip, Legend } from "chart.js";
  Chart.register(ArcElement, Tooltip, Legend);
  ```

### Abort Controllers

```jsx
// GOOD: Cancel pending requests on unmount or re-fetch
useEffect(() => {
  const controller = new AbortController();
  fetchData({ signal: controller.signal });
  return () => controller.abort();
}, [dependency]);
```

### Debounce & Throttle

- Search inputs: debounce 300ms
- Resize handlers: throttle 100ms
- Scroll handlers: throttle 16ms (60fps)
- API filter changes: debounce 250ms

## Database Query Patterns to Watch

| Pattern | Issue | Fix |
|---------|-------|-----|
| Loop with `.first()` | N+1 queries | Batch with `.in_()` |
| `.all()` without limit | Unbounded result | Add `.limit()` or paginate |
| Multiple `.count()` calls | Separate queries each | Single grouped query |
| Joining 3+ tables | Cartesian product risk | Verify JOIN conditions |
| `order_by` without index | Full table sort | Add index on sort column |
| Repeated identical query | No caching | Cache or precompute |

## Core Web Vitals Checklist

| Metric | Target | Common Violations |
|--------|--------|-------------------|
| LCP (Largest Contentful Paint) | <= 2.5s | Large unoptimized images, render-blocking JS |
| INP (Interaction to Next Paint) | <= 200ms | Long synchronous tasks in event handlers |
| CLS (Cumulative Layout Shift) | < 0.1 | Images without dimensions, dynamic content insertion |