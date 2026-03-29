import { useState, useEffect, useMemo, useRef } from 'react';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

export default function DateRangePicker({ startDate, endDate, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = startDate || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [picking, setPicking] = useState(null); // null | Date (first click stored)
  const wrapRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Build calendar grid for current viewMonth
  const calendarDays = useMemo(() => {
    const { year, month } = viewMonth;
    const firstDay = new Date(year, month, 1);
    // Monday=0 offset
    let startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days = [];
    // Previous month trailing days
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthDays - i), outside: true });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(year, month, d), outside: false });
    }
    // Next month leading days to fill 6 rows
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      days.push({ date: new Date(year, month + 1, d), outside: true });
    }
    return days;
  }, [viewMonth]);

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const isSameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const isInRange = (date) => {
    if (!startDate || !endDate) return false;
    return date >= startDate && date <= endDate;
  };

  const handleDayClick = (date) => {
    if (!picking) {
      // First click: set start
      setPicking(date);
    } else {
      // Second click: determine range order and apply
      let s = picking, e = date;
      if (s > e) { [s, e] = [e, s]; }
      setPicking(null);
      onChange(s, e);
      setOpen(false);
    }
  };

  const handleClear = () => {
    setPicking(null);
    onChange(null, null);
    setOpen(false);
  };

  const prevMonth = () => setViewMonth(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 });
  const nextMonth = () => setViewMonth(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 });

  const formatLabel = () => {
    if (!startDate && !endDate) return 'All dates';
    if (startDate && endDate) {
      const s = `${SHORT_MONTHS[startDate.getMonth()]} ${startDate.getDate()}`;
      const e = `${SHORT_MONTHS[endDate.getMonth()]} ${endDate.getDate()}`;
      if (startDate.getFullYear() !== endDate.getFullYear()) {
        return `${s}, ${startDate.getFullYear()} – ${e}, ${endDate.getFullYear()}`;
      }
      return `${s} – ${e}`;
    }
    if (startDate) return `From ${SHORT_MONTHS[startDate.getMonth()]} ${startDate.getDate()}`;
    return `Until ${SHORT_MONTHS[endDate.getMonth()]} ${endDate.getDate()}`;
  };

  return (
    <div className="drp-wrap" ref={wrapRef}>
      <button
        className="drp-btn"
        onClick={() => { setOpen(o => !o); if (!open) setPicking(null); }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="drp-label">{formatLabel()}</span>
        <svg className={`drp-chevron${open ? ' open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="drp-panel" role="dialog" aria-label="Date range picker">
          <div className="drp-month-nav">
            <button className="drp-nav-arrow" onClick={prevMonth} aria-label="Previous month">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="drp-month-label">{MONTH_NAMES[viewMonth.month]} {viewMonth.year}</span>
            <button className="drp-nav-arrow" onClick={nextMonth} aria-label="Next month">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <div className="drp-weekdays">
            {DAY_LABELS.map(d => <span key={d} className="drp-weekday">{d}</span>)}
          </div>
          <div className="drp-grid">
            {calendarDays.map(({ date, outside }, i) => {
              const isToday = isSameDay(date, today);
              const isSelected = isSameDay(date, startDate) || isSameDay(date, endDate);
              const isPicking = isSameDay(date, picking);
              const inRange = isInRange(date);
              return (
                <button
                  key={i}
                  className={[
                    'drp-day',
                    outside && 'drp-day--outside',
                    isToday && 'drp-day--today',
                    (isSelected || isPicking) && 'drp-day--selected',
                    inRange && !isSelected && 'drp-day--in-range',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleDayClick(date)}
                  aria-label={`${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="drp-footer">
            <button className="drp-clear" onClick={handleClear}>Clear</button>
            {picking && <span className="drp-hint">Select end date</span>}
          </div>
        </div>
      )}
    </div>
  );
}
