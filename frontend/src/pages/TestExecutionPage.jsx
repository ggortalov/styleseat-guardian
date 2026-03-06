import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import runService from '../services/runService';
import './TestExecutionPage.css';

const STATUSES = ['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'];

export default function TestExecutionPage() {
  const { runId, resultId } = useParams();
  const navigate = useNavigate();

  const [result, setResult] = useState(null);
  const [allResults, setAllResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState('Untested');
  const [comment, setComment] = useState('');
  const [defectId, setDefectId] = useState('');
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
      setComment(res.comment || '');
      setDefectId(res.defect_id || '');
    } catch {
      navigate(`/runs/${runId}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); fetchData(); }, [resultId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await runService.updateResult(resultId, { status, comment, defect_id: defectId });
      const hist = await runService.getResultHistory(resultId);
      setHistory(hist);
    } finally {
      setSaving(false);
    }
  };

  const currentIndex = allResults.findIndex((r) => r.id === parseInt(resultId));
  const prevResult = currentIndex > 0 ? allResults[currentIndex - 1] : null;
  const nextResult = currentIndex < allResults.length - 1 ? allResults[currentIndex + 1] : null;

  if (loading) return <><Header breadcrumbs={[{ label: 'Dashboard', path: '/' }]} /><LoadingSpinner /></>;

  const tc = result?.test_case || {};

  return (
    <div>
      <Header breadcrumbs={[
        { label: 'Dashboard', path: '/' },
        { label: result?.run_name || 'Run', path: `/runs/${runId}` },
        { label: `Execute C${String(tc.id).padStart(7, '0')}` },
      ]} />
      <div className="page-content">
        <div className="exec-nav">
          <button
            className="btn btn-secondary"
            disabled={!prevResult}
            onClick={() => navigate(`/runs/${runId}/execute/${prevResult.id}`)}
          >
            &larr; Previous
          </button>
          <span className="exec-position">{currentIndex + 1} of {allResults.length}</span>
          <button
            className="btn btn-secondary"
            disabled={!nextResult}
            onClick={() => navigate(`/runs/${runId}/execute/${nextResult.id}`)}
          >
            Next &rarr;
          </button>
        </div>

        <div className="exec-layout">
          <div className="exec-case card">
            <h3>C{tc.id} - {tc.title}</h3>
            <div className="exec-meta">
              <span>Section: {tc.section_name}</span>
              <span>Priority: {tc.priority}</span>
              <span>Type: {tc.case_type}</span>
            </div>

            {tc.preconditions && (
              <div className="exec-section">
                <h4>Preconditions</h4>
                <p>{tc.preconditions}</p>
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
                <p>{tc.expected_result}</p>
              </div>
            )}
          </div>

          <div className="exec-panel card">
            <h3>Set Result</h3>

            <div className="status-buttons">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  className={`status-btn ${status === s ? 'active' : ''}`}
                  style={{
                    '--btn-color': `var(--status-${s.toLowerCase()})`,
                  }}
                  onClick={() => setStatus(s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="form-group">
              <label>Comment</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                placeholder="Add a comment about the test result..."
              />
            </div>

            <div className="form-group">
              <label>Defect ID</label>
              <input
                type="text"
                value={defectId}
                onChange={(e) => setDefectId(e.target.value)}
                placeholder="e.g. BUG-123"
              />
            </div>

            <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Result'}
            </button>

            {history.length > 0 && (
              <div className="exec-history">
                <h4>History</h4>
                {history.map((h) => (
                  <div key={h.id} className="history-entry">
                    <div className="history-header">
                      <StatusBadge status={h.status} size="sm" />
                      <span className="history-date">{new Date(h.changed_at).toLocaleString()}</span>
                    </div>
                    {h.comment && <p className="history-comment">{h.comment}</p>}
                    {h.defect_id && <p className="history-defect">Defect: {h.defect_id}</p>}
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
