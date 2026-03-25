import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import runService from '../services/runService';
import './TestExecutionPage.css';

const STATUSES = ['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'];
const STATUS_ICONS = {
  Passed:   '\u2714',
  Failed:   '\u2716',
  Blocked:  '\u26D4',
  Retest:   '\u21BB',
  Untested: '\u2013',
};

/* ── Status dropdown pill ── */
function StatusDropdown({ status, onChangeStatus, locked, saving }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className={`exec-status-dropdown ${locked ? 'exec-status-dropdown--locked' : ''}`} ref={ref}>
      <button
        className="exec-status-trigger"
        style={{
          color: `var(--status-${status.toLowerCase()})`,
          backgroundColor: `var(--status-${status.toLowerCase()}-bg)`,
        }}
        onClick={() => !locked && !saving && setOpen(!open)}
        disabled={locked || saving}
        title={locked ? 'Locked - edits not allowed after 24 hours' : undefined}
      >
        <span className="exec-status-icon">{STATUS_ICONS[status]}</span>
        {status}
        {locked ? (
          <svg className="exec-status-lock" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        ) : (
          <svg className="exec-status-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        )}
      </button>
      {open && !locked && (
        <div className="exec-status-menu">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`exec-status-option ${s === status ? 'selected' : ''}`}
              onClick={() => { onChangeStatus(s); setOpen(false); }}
            >
              <span className="exec-status-dot" style={{ backgroundColor: `var(--status-${s.toLowerCase()})` }} />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TestExecutionPage() {
  const { runId, resultId } = useParams();
  const navigate = useNavigate();

  const [result, setResult] = useState(null);
  const [allResults, setAllResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState('Untested');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      const [res, all, hist] = await Promise.all([
        runService.getResult(resultId),
        runService.getResults(runId),
        runService.getResultHistory(resultId),
      ]);
      setResult(res);
      setAllResults(all);
      setHistory(hist);
      setStatus(res.status);
    } catch {
      navigate(`/runs/${runId}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); fetchData(); }, [resultId]);

  const handleStatusChange = async (newStatus) => {
    const previousStatus = status;
    setStatus(newStatus);
    setSaving(true);
    try {
      await runService.updateResult(resultId, { status: newStatus });
      const hist = await runService.getResultHistory(resultId);
      setHistory(hist);
    } catch (error) {
      // Revert to previous status if update fails (e.g., locked result)
      setStatus(previousStatus);
    } finally {
      setSaving(false);
    }
  };

  const currentIndex = allResults.findIndex((r) => r.id === parseInt(resultId));

  if (loading) return <><Header breadcrumbs={[{ label: 'Guardian', path: '/' }]} /><LoadingSpinner /></>;

  const tc = result?.test_case || {};

  // Get current error/artifacts from result (not history)
  const currentError = result?.error_message;
  // Sort artifacts: first attempt first, then retries (attempt 2, 3, etc.)
  const currentArtifacts = [...(result?.artifacts || [])].sort((a, b) => {
    const nameA = a.name || a.path || '';
    const nameB = b.name || b.path || '';
    const hasAttemptA = nameA.includes('(attempt');
    const hasAttemptB = nameB.includes('(attempt');
    // First attempts (no "attempt" in name) come first
    if (!hasAttemptA && hasAttemptB) return -1;
    if (hasAttemptA && !hasAttemptB) return 1;
    // Both have attempts, sort by attempt number
    return nameA.localeCompare(nameB);
  });

  return (
    <div>
      <Header breadcrumbs={[
        { label: 'Guardian', path: '/' },
        { label: result?.run_name || 'Run', path: `/runs/${runId}` },
        { label: tc.title || 'Execute' },
      ]} />
      <div className="page-content">
        <div className="exec-nav">
          <button
            className="btn btn-secondary"
            onClick={() => {
              sessionStorage.setItem('highlightResult', resultId);
              window.history.back();
            }}
          >
            &larr; Back
          </button>
          <span className="exec-position">{currentIndex + 1} of {allResults.length}</span>
        </div>

        <div className="exec-layout">
          <div className="exec-case card">
            <h3>{tc.title}</h3>
            <div className="exec-meta">
              <span>Section: {tc.section_name}</span>
              <span>Priority: {tc.priority}</span>
              <span>Type: {tc.case_type}</span>
            </div>

            {tc.preconditions && (
              <div className="exec-section">
                <h4>Preconditions</h4>
                <pre className="exec-text-content">{tc.preconditions}</pre>
              </div>
            )}

            {tc.steps && tc.steps.length > 0 && (
              <div className="exec-section">
                <h4>Steps</h4>
                <table className="data-table steps-table">
                  <thead>
                    <tr><th>#</th><th>Action</th><th>Expected</th></tr>
                  </thead>
                  <tbody>
                    {tc.steps.map((step, i) => (
                      <tr key={i}>
                        <td className="step-number">{i + 1}</td>
                        <td>{step.action}</td>
                        <td>{step.expected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tc.expected_result && (
              <div className="exec-section">
                <h4>Expected Result</h4>
                <pre className="exec-text-content">{tc.expected_result}</pre>
              </div>
            )}

            {/* CircleCI Error below test case */}
            {currentError && (
              <div className="exec-error-section">
                <div className="exec-error-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  CircleCI Error
                </div>
                <pre className="exec-error-message">{currentError}</pre>
              </div>
            )}

            {/* Artifacts below error */}
            {currentArtifacts.length > 0 && (
              <div className="exec-artifacts-section">
                <div className="exec-artifacts-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Screenshots
                </div>
                <div className="exec-artifacts-list">
                  {currentArtifacts.map((artifact, i) => (
                    <a
                      key={i}
                      href={artifact.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="exec-artifact-link"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      {artifact.name || artifact.path?.split('/').pop() || `Screenshot ${i + 1}`}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="exec-panel card">
            <div className="exec-panel-header">
              <h3>Status</h3>
              {result?.is_locked && (
                <div className="exec-locked-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Locked
                </div>
              )}
            </div>

            {/* Status dropdown pill */}
            <div className="exec-status-section">
              <StatusDropdown
                status={status}
                onChangeStatus={handleStatusChange}
                locked={result?.is_locked}
                saving={saving}
              />
            </div>

            {history.length > 0 && (
              <div className="exec-history">
                <h4>History</h4>
                {history.map((h) => (
                  <div key={h.id} className="history-entry">
                    <div className="history-header">
                      <StatusBadge status={h.status} size="sm" />
                      <span className="history-user">{h.changed_by_name || 'Automation'}</span>
                      <span className="history-date">{new Date(h.changed_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
