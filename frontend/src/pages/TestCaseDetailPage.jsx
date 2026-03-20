import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import PriorityBadge from '../components/PriorityBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import caseService from '../services/caseService';
import stripTestRailId from '../utils/stripTestRailId';
import './TestCaseDetailPage.css';

export default function TestCaseDetailPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [tc, setTc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    caseService.getById(caseId)
      .then(setTc)
      .catch(() => navigate('/'))
      .finally(() => setLoading(false));
  }, [caseId]);

  const handleDelete = async () => {
    await caseService.delete(caseId);
    // Navigate back to the suite page
    if (tc?.project_id && tc?.suite_id) {
      navigate(`/projects/${tc.project_id}/suites/${tc.suite_id}`);
    } else {
      navigate('/');
    }
  };

  if (loading) return <><Header breadcrumbs={[{ label: 'Dashboard', path: '/' }]} /><LoadingSpinner /></>;

  const editPath = tc?.project_id && tc?.suite_id
    ? `/projects/${tc.project_id}/suites/${tc.suite_id}/cases/${tc.id}/edit`
    : null;

  return (
    <div>
      <Header breadcrumbs={[
        { label: 'Dashboard', path: '/' },
        ...(tc.project_name && tc.suite_name && tc.project_name !== tc.suite_name ? [{ label: tc.project_name, path: `/projects/${tc.project_id}` }] : []),
        ...(tc.suite_name && tc.project_id && tc.suite_id ? [{ label: tc.suite_name, path: `/projects/${tc.project_id}/suites/${tc.suite_id}` }] : []),
        { label: stripTestRailId(tc.title) },
      ]} />
      <div className="page-content">
        <div className="case-detail">
          <div className="case-detail-top">
            <div className="case-detail-actions">
              {editPath && (
                <button className="btn btn-secondary" onClick={() => navigate(editPath)}>Edit</button>
              )}
              <button className="btn btn-danger" onClick={() => setShowDelete(true)}>Delete</button>
            </div>
          </div>

          <h1 className="case-detail-title">{stripTestRailId(tc.title)}</h1>

          <div className="case-meta-grid">
            <div className="case-meta-item">
              <span className="meta-label">Category</span>
              <span className="meta-value">{tc.section_name || 'Uncategorized'}</span>
            </div>
            <div className="case-meta-item">
              <span className="meta-label">Type</span>
              <span className="meta-value">{tc.case_type}</span>
            </div>
            <div className="case-meta-item">
              <span className="meta-label">Priority</span>
              <span className="meta-value"><PriorityBadge priority={tc.priority} /></span>
            </div>
            <div className="case-meta-item">
              <span className="meta-label">Author</span>
              <span className="meta-value">{tc.author_name || '—'}</span>
            </div>
            <div className="case-meta-item">
              <span className="meta-label">Created</span>
              <span className="meta-value">{tc.created_at ? new Date(tc.created_at).toLocaleDateString() : '—'}</span>
            </div>
            <div className="case-meta-item">
              <span className="meta-label">Last Modified</span>
              <span className="meta-value">{tc.updated_at ? new Date(tc.updated_at).toLocaleDateString() : '—'}</span>
            </div>
          </div>

          {tc.preconditions && (
            <div className="case-section">
              <h3>Preconditions</h3>
              <div className="case-section-body">{tc.preconditions}</div>
            </div>
          )}

          {tc.steps && tc.steps.length > 0 && (
            <div className="case-section">
              <h3>Steps</h3>
              <table className="data-table steps-table">
                <thead>
                  <tr><th>#</th><th>Action</th><th>Expected Result</th></tr>
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
            <div className="case-section">
              <h3>Expected Result</h3>
              <div className="case-section-body">{tc.expected_result}</div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Test Case"
        message={`"${stripTestRailId(tc.title)}" will be permanently deleted. This cannot be undone.`}
        requireSafeguard
      />
    </div>
  );
}
