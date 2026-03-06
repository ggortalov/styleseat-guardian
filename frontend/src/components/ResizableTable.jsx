import { useState, useRef, useCallback, useEffect } from 'react';
import './ResizableTable.css';

export default function ResizableTable({ children, className = '', storageKey }) {
  const tableRef = useRef(null);
  const [colPcts, setColPcts] = useState(null);
  const dragging = useRef(null);

  // Load saved percentages from localStorage
  useEffect(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`table-cols-${storageKey}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Only use if percentages (values < 100); discard old pixel-based values
          if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((v) => v < 100)) {
            setColPcts(parsed);
          } else {
            localStorage.removeItem(`table-cols-${storageKey}`);
          }
        } catch { /* ignore */ }
      }
    }
  }, [storageKey]);

  // Initialize column percentages from rendered table
  useEffect(() => {
    if (colPcts || !tableRef.current) return;
    const ths = tableRef.current.querySelectorAll('thead th');
    if (ths.length === 0) return;
    const tableWidth = tableRef.current.offsetWidth;
    if (tableWidth === 0) return;
    const pcts = Array.from(ths).map((th) => (th.offsetWidth / tableWidth) * 100);
    setColPcts(pcts);
  }, [children, colPcts]);

  const saveWidths = useCallback((pcts) => {
    if (storageKey) {
      localStorage.setItem(`table-cols-${storageKey}`, JSON.stringify(pcts));
    }
  }, [storageKey]);

  const onMouseDown = useCallback((e, colIndex) => {
    e.preventDefault();
    if (!tableRef.current) return;

    const startX = e.clientX;
    const tableWidth = tableRef.current.offsetWidth;
    const startPcts = [...colPcts];

    dragging.current = { colIndex, startX, tableWidth, startPcts };

    const onMouseMove = (moveEvent) => {
      const { colIndex: ci, startX: sx, tableWidth: tw, startPcts: sp } = dragging.current;
      const diffPx = moveEvent.clientX - sx;
      const diffPct = (diffPx / tw) * 100;

      const nextIndex = ci + 1;
      const minPct = 4; // minimum 4% per column

      let newLeft = sp[ci] + diffPct;
      let newRight = sp[nextIndex] - diffPct;

      // Enforce minimums
      if (newLeft < minPct) {
        newRight = newRight - (minPct - newLeft);
        newLeft = minPct;
      }
      if (newRight < minPct) {
        newLeft = newLeft - (minPct - newRight);
        newRight = minPct;
      }

      setColPcts((prev) => {
        const updated = [...prev];
        updated[ci] = Math.max(minPct, newLeft);
        updated[nextIndex] = Math.max(minPct, newRight);
        return updated;
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setColPcts((prev) => {
        saveWidths(prev);
        return prev;
      });
      dragging.current = null;
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [colPcts, saveWidths]);

  // Build colgroup from percentages
  const colgroup = colPcts ? (
    <colgroup>
      {colPcts.map((pct, i) => (
        <col key={i} style={{ width: `${pct}%` }} />
      ))}
    </colgroup>
  ) : null;

  // Clone the table's thead to inject resize handles
  const enhanceChildren = (kids) => {
    return Array.isArray(kids) ? kids.map(enhanceChild) : enhanceChild(kids);
  };

  const enhanceChild = (child) => {
    if (!child || !child.props) return child;

    if (child.type === 'thead') {
      const theadChildren = enhanceChildren(child.props.children);
      return { ...child, props: { ...child.props, children: theadChildren } };
    }

    if (child.type === 'tr' && child.props.children) {
      const ths = Array.isArray(child.props.children) ? child.props.children : [child.props.children];
      const enhanced = ths.map((th, i) => {
        if (!th || th.type !== 'th') return th;
        const isLast = i === ths.length - 1;
        return {
          ...th,
          props: {
            ...th.props,
            className: `${th.props.className || ''} resizable-th`.trim(),
            children: (
              <>
                {th.props.children}
                {!isLast && colPcts && (
                  <span
                    className="col-resize-handle"
                    onMouseDown={(e) => onMouseDown(e, i)}
                  />
                )}
              </>
            ),
          },
        };
      });
      return { ...child, props: { ...child.props, children: enhanced } };
    }

    return child;
  };

  return (
    <table ref={tableRef} className={`${className} resizable-table`} style={{ tableLayout: colPcts ? 'fixed' : 'auto', width: '100%' }}>
      {colgroup}
      {colPcts ? enhanceChildren(children) : children}
    </table>
  );
}
