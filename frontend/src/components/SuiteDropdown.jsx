import { useState, useEffect, useRef } from 'react';

export default function SuiteDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusIdx, setFocusIdx] = useState(-1);
  const ref = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);

  const filtered = search.trim()
    ? options.filter(n => n.toLowerCase().includes(search.toLowerCase()))
    : options;
  const allOptions = ['', ...filtered];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(''); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch('');
      setFocusIdx(-1);
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (open && listRef.current && focusIdx >= 0) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      if (items[focusIdx]) items[focusIdx].scrollIntoView({ block: 'nearest' });
    }
  }, [focusIdx, open]);

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIdx(i => Math.min(i + 1, allOptions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusIdx >= 0) { onChange(allOptions[focusIdx]); setOpen(false); setSearch(''); }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setSearch('');
        break;
      default: break;
    }
  };

  const select = (val) => {
    onChange(val);
    setOpen(false);
    setSearch('');
  };

  const label = value || 'All Suites';
  const hasValue = !!value;

  return (
    <div className="suite-dd" ref={ref}>
      <button
        className={`suite-dd-trigger${hasValue ? ' suite-dd-trigger--active' : ''}`}
        onClick={() => setOpen(o => !o)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by suite"
        type="button"
      >
        <svg className="suite-dd-trigger-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span className="suite-dd-trigger-label">{label}</span>
        <svg className={`suite-dd-trigger-chevron${open ? ' open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="suite-dd-panel" onKeyDown={handleKeyDown}>
          <div className="suite-dd-search-wrap">
            <svg className="suite-dd-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              className="suite-dd-search"
              type="text"
              placeholder="Search suites..."
              value={search}
              onChange={e => { setSearch(e.target.value); setFocusIdx(-1); }}
              aria-label="Search suites"
            />
            {search && (
              <button className="suite-dd-search-clear" onClick={() => setSearch('')} aria-label="Clear search" type="button">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <ul className="suite-dd-list" role="listbox" ref={listRef} aria-label="Suite filter options">
            <li
              id="suite-opt-0"
              className={`suite-dd-item${!value ? ' suite-dd-item--active' : ''}${focusIdx === 0 ? ' suite-dd-item--focus' : ''}`}
              role="option"
              aria-selected={!value}
              onClick={() => select('')}
            >
              <svg className="suite-dd-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              <span className="suite-dd-item-label">All Suites</span>
              {!value && (
                <svg className="suite-dd-item-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </li>
            {filtered.length > 0 && <li className="suite-dd-divider" role="separator" />}
            {filtered.map((name, i) => (
              <li
                key={name}
                id={`suite-opt-${i + 1}`}
                className={`suite-dd-item${value === name ? ' suite-dd-item--active' : ''}${focusIdx === i + 1 ? ' suite-dd-item--focus' : ''}`}
                role="option"
                aria-selected={value === name}
                onClick={() => select(name)}
              >
                <svg className="suite-dd-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="suite-dd-item-label">{name}</span>
                {value === name && (
                  <svg className="suite-dd-item-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </li>
            ))}
            {search && filtered.length === 0 && (
              <li className="suite-dd-empty">No suites match "{search}"</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
