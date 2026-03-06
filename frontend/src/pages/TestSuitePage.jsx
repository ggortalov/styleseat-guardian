import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import suiteService from '../services/suiteService';
import sectionService from '../services/sectionService';
import caseService from '../services/caseService';
import projectService from '../services/projectService';
import './TestSuitePage.css';

export default function TestSuitePage() {
  const { projectId, suiteId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterCategoryId = searchParams.get('categoryId') ? parseInt(searchParams.get('categoryId')) : null;

  const [project, setProject] = useState(null);
  const [suite, setSuite] = useState(null);
  const [sections, setSections] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState({});

  // Category modal
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editSection, setEditSection] = useState(null);
  const [sectionName, setSectionName] = useState('');
  const [sectionDescription, setSectionDescription] = useState('');
  const [sectionParentId, setSectionParentId] = useState(null);

  // Delete confirm
  const [deleteSection, setDeleteSection] = useState(null);

  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCases, setSelectedCases] = useState(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const fetchData = async () => {
    try {
      const [p, s, secs] = await Promise.all([
        projectService.getById(projectId),
        suiteService.getById(suiteId),
        sectionService.getByProject(projectId),
      ]);
      setProject(p);
      setSuite(s);
      setSections(secs);
    } catch {
      navigate(`/projects/${projectId}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchCases = () => {
    caseService.getByProject(projectId).then(setCases).catch(() => setCases([]));
  };

  useEffect(() => { fetchData(); }, [projectId, suiteId]);
  useEffect(() => { fetchCases(); }, [projectId]);

  // Group cases by section_id + build section tree
  const grouped = useMemo(() => {
    const map = {};
    for (const sec of sections) {
      map[sec.id] = { section: sec, cases: [] };
    }
    const uncategorized = [];
    for (const c of cases) {
      if (c.section_id && map[c.section_id]) {
        map[c.section_id].cases.push(c);
      } else {
        uncategorized.push(c);
      }
    }
    // Build tree: roots + childrenMap
    const roots = [];
    const childrenMap = {};
    for (const sec of sections) {
      if (sec.parent_id === null || sec.parent_id === undefined) {
        roots.push(sec);
      } else {
        if (!childrenMap[sec.parent_id]) childrenMap[sec.parent_id] = [];
        childrenMap[sec.parent_id].push(sec);
      }
    }
    return { map, uncategorized, roots, childrenMap };
  }, [sections, cases]);

  const toggleCategory = (id) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveSection = async (e) => {
    e.preventDefault();
    if (editSection) {
      await sectionService.update(editSection.id, { name: sectionName, description: sectionDescription });
    } else {
      await sectionService.create(suiteId, { name: sectionName, description: sectionDescription, parent_id: sectionParentId });
    }
    setShowSectionModal(false);
    setSectionName('');
    setSectionDescription('');
    setEditSection(null);
    setSectionParentId(null);
    fetchData();
  };

  const handleDeleteSection = async () => {
    if (deleteSection) {
      const deletedId = deleteSection.id;
      await sectionService.delete(deletedId);
      setDeleteSection(null);
      fetchData();
      fetchCases();
      // If we're in filtered view and deleted that category, go back to all categories
      if (filterCategoryId === deletedId) {
        navigate(`/projects/${projectId}/suites/${suiteId}`);
      }
    }
  };

  // Bulk selection helpers
  const toggleSelectionMode = () => {
    setSelectionMode(prev => {
      if (prev) setSelectedCases(new Set());
      return !prev;
    });
  };

  const toggleCase = (id, e) => {
    e.stopPropagation();
    setSelectedCases(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllCases = (caseList, e) => {
    e.stopPropagation();
    setSelectedCases(prev => {
      const next = new Set(prev);
      const allSelected = caseList.every(c => prev.has(c.id));
      if (allSelected) {
        caseList.forEach(c => next.delete(c.id));
      } else {
        caseList.forEach(c => next.add(c.id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    try {
      await caseService.bulkDelete([...selectedCases]);
      setSelectedCases(new Set());
      setShowBulkDelete(false);
      fetchCases();
    } catch {
      setShowBulkDelete(false);
    }
  };

  if (loading) return <><Header breadcrumbs={[{ label: 'Dashboard', path: '/' }]} /><LoadingSpinner /></>;

  const hasCases = cases.length > 0;
  const hasCategories = sections.length > 0;

  // When filtering by a single category — include subcategory cases too
  const filterSection = filterCategoryId ? sections.find(s => s.id === filterCategoryId) : null;
  const filterCases = (() => {
    if (!filterSection) return [];
    const direct = grouped.map[filterSection.id]?.cases || [];
    // Also gather cases from child categories
    const children = grouped.childrenMap[filterSection.id] || [];
    const childCases = children.flatMap(sub => grouped.map[sub.id]?.cases || []);
    return [...direct, ...childCases];
  })();
  const suitePath = `/projects/${projectId}/suites/${suiteId}`;

  // Build breadcrumbs (skip project if same name as suite to avoid duplication)
  const breadcrumbs = [
    { label: 'Dashboard', path: '/' },
  ];
  if (project?.name !== suite?.name) {
    breadcrumbs.push({ label: project?.name, path: `/projects/${projectId}` });
  }
  breadcrumbs.push({ label: suite?.name, path: filterSection ? suitePath : undefined });
  if (filterSection) {
    breadcrumbs.push({ label: filterSection.name });
  }

  return (
    <div>
      <Header breadcrumbs={breadcrumbs} />
      <div className="page-content">
        {filterSection ? (
          /* === Single category view === */
          <>
            <div className="page-toolbar">
              <div className="page-heading-group">
                <div className="page-heading-row">
                  <h2 className="page-heading">{filterSection.name}</h2>
                  <span className="page-heading-count">{filterCases.length} test case{filterCases.length !== 1 ? 's' : ''}</span>
                </div>
                {filterSection.description && <p className="page-description">{filterSection.description}</p>}
              </div>
              <div className="toolbar-actions">
                <button className={`btn ${selectionMode ? 'btn-manage-active' : 'btn-secondary'}`} onClick={toggleSelectionMode}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                  Manage
                </button>
                <button className="btn btn-secondary" onClick={() => {
                  setEditSection(filterSection);
                  setSectionName(filterSection.name);
                  setSectionDescription(filterSection.description || '');
                  setShowSectionModal(true);
                }}>Edit</button>
                <button className="btn btn-danger" onClick={() => setDeleteSection(filterSection)}>Delete</button>
                <button className="btn btn-secondary" onClick={() => navigate(suitePath)}>
                  All Categories
                </button>
                <button className="btn btn-primary" onClick={() => {
                  navigate(`/projects/${projectId}/suites/${suiteId}/cases/new?sectionId=${filterSection.id}`);
                }}>+ Test Case</button>
              </div>
            </div>

            <div className="category-tree">
              <div className="category-group">
                {selectionMode && filterCases.length > 0 && (
                  <div className="category-select-all" onClick={(e) => toggleAllCases(filterCases, e)}>
                    <input type="checkbox" checked={filterCases.every(c => selectedCases.has(c.id))} readOnly className="case-checkbox" />
                    <span className="select-all-label">Select All</span>
                  </div>
                )}
                <div className="category-cases">
                  {filterCases.length > 0 ? filterCases.map((c) => (
                    <div key={c.id} className={`case-row ${selectedCases.has(c.id) ? 'case-row--selected' : ''}`} onClick={() => navigate(`/cases/${c.id}`)}>
                      {selectionMode && <input type="checkbox" checked={selectedCases.has(c.id)} onChange={(e) => toggleCase(c.id, e)} onClick={(e) => e.stopPropagation()} className="case-checkbox" />}
                      <span className="case-row-id">C{String(c.id).padStart(7, '0')}</span>
                      <span className="case-row-title">{c.title}</span>
                      <span className="case-row-meta">{(c.updated_at || c.created_at) ? new Date(c.updated_at || c.created_at).toLocaleDateString() : ''}</span>
                      <span className="case-row-meta">{c.author_name || ''}</span>
                    </div>
                  )) : (
                    <div className="category-empty-msg">No test cases in this category</div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* === All categories view === */
          <>
            <div className="page-toolbar">
              <h2 className="page-heading">{suite?.name}</h2>
              <div className="toolbar-actions">
                <button className={`btn ${selectionMode ? 'btn-manage-active' : 'btn-secondary'}`} onClick={toggleSelectionMode}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                  Manage
                </button>
                <button className="btn btn-secondary" onClick={() => {
                  setEditSection(null);
                  setSectionName('');
                  setSectionDescription('');
                  setSectionParentId(null);
                  setShowSectionModal(true);
                }}>+ Category</button>
                <button className="btn btn-primary" onClick={() => {
                  if (sections.length > 0) {
                    navigate(`/projects/${projectId}/suites/${suiteId}/cases/new?sectionId=${sections[0].id}`);
                  }
                }} disabled={!hasCategories}>+ Test Case</button>
              </div>
            </div>

            {hasCases || hasCategories ? (
              <div className="category-tree">
                {grouped.roots.map((sec) => {
                  const group = grouped.map[sec.id];
                  const children = grouped.childrenMap[sec.id] || [];
                  const isCollapsed = !!collapsed[sec.id];
                  return (
                    <div key={sec.id} id={`category-${sec.id}`} className="category-group">
                      <div className="category-header" onClick={() => toggleCategory(sec.id)}>
                        <svg className={`category-chevron ${isCollapsed ? '' : 'open'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <div className="category-header-info">
                          <div className="category-header-top">
                            <span className="category-header-name">{sec.name}</span>
                            <span className="category-header-count">{group.cases.length}</span>
                          </div>
                          {sec.description && <span className="category-header-desc">{sec.description}</span>}
                        </div>
                        <div className="category-header-actions">
                          <button
                            className="category-action-btn"
                            data-tooltip="Add subcategory"
                            onClick={(e) => { e.stopPropagation(); setSectionParentId(sec.id); setEditSection(null); setSectionName(''); setSectionDescription(''); setShowSectionModal(true); }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                          </button>
                          <button
                            className="category-action-btn"
                            data-tooltip="Add test case"
                            onClick={(e) => { e.stopPropagation(); navigate(`/projects/${projectId}/suites/${suiteId}/cases/new?sectionId=${sec.id}`); }}
                          >+</button>
                          <button
                            className="category-action-btn"
                            data-tooltip="Edit"
                            onClick={(e) => { e.stopPropagation(); setEditSection(sec); setSectionName(sec.name); setSectionDescription(sec.description || ''); setShowSectionModal(true); }}
                          >&#9998;</button>
                          <button
                            className="category-action-btn danger"
                            data-tooltip="Delete"
                            onClick={(e) => { e.stopPropagation(); setDeleteSection(sec); }}
                          >&times;</button>
                        </div>
                      </div>
                      {!isCollapsed && (
                        <>
                          {selectionMode && group.cases.length > 0 && (
                            <div className="category-select-all" onClick={(e) => toggleAllCases(group.cases, e)}>
                              <input type="checkbox" checked={group.cases.every(c => selectedCases.has(c.id))} readOnly className="case-checkbox" />
                              <span className="select-all-label">Select All</span>
                            </div>
                          )}
                          <div className="category-cases">
                            {group.cases.length > 0 ? group.cases.map((c) => (
                              <div key={c.id} className={`case-row ${selectedCases.has(c.id) ? 'case-row--selected' : ''}`} onClick={() => navigate(`/cases/${c.id}`)}>
                                {selectionMode && <input type="checkbox" checked={selectedCases.has(c.id)} onChange={(e) => toggleCase(c.id, e)} onClick={(e) => e.stopPropagation()} className="case-checkbox" />}
                                <span className="case-row-id">C{String(c.id).padStart(7, '0')}</span>
                                <span className="case-row-title">{c.title}</span>
                                <span className="case-row-meta">{(c.updated_at || c.created_at) ? new Date(c.updated_at || c.created_at).toLocaleDateString() : ''}</span>
                                <span className="case-row-meta">{c.author_name || ''}</span>
                              </div>
                            )) : children.length === 0 ? (
                              <div className="category-empty-msg">No test cases in this category</div>
                            ) : null}
                          </div>
                          {children.map((sub) => {
                            const subGroup = grouped.map[sub.id];
                            const isSubCollapsed = !!collapsed[`sub-${sub.id}`];
                            return (
                              <div key={sub.id} id={`category-${sub.id}`} className="subcategory-group">
                                <div className="subcategory-header" onClick={() => toggleCategory(`sub-${sub.id}`)}>
                                  <svg className={`category-chevron ${isSubCollapsed ? '' : 'open'}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6" />
                                  </svg>
                                  <div className="category-header-info">
                                    <div className="category-header-top">
                                      <span className="subcategory-header-name">{sub.name}</span>
                                      <span className="category-header-count">{subGroup.cases.length}</span>
                                    </div>
                                    {sub.description && <span className="category-header-desc">{sub.description}</span>}
                                  </div>
                                  <div className="category-header-actions">
                                    <button
                                      className="category-action-btn"
                                      data-tooltip="Add test case"
                                      onClick={(e) => { e.stopPropagation(); navigate(`/projects/${projectId}/suites/${suiteId}/cases/new?sectionId=${sub.id}`); }}
                                    >+</button>
                                    <button
                                      className="category-action-btn"
                                      data-tooltip="Edit"
                                      onClick={(e) => { e.stopPropagation(); setEditSection(sub); setSectionName(sub.name); setSectionDescription(sub.description || ''); setShowSectionModal(true); }}
                                    >&#9998;</button>
                                    <button
                                      className="category-action-btn danger"
                                      data-tooltip="Delete"
                                      onClick={(e) => { e.stopPropagation(); setDeleteSection(sub); }}
                                    >&times;</button>
                                  </div>
                                </div>
                                {!isSubCollapsed && (
                                  <>
                                  {selectionMode && subGroup.cases.length > 0 && (
                                    <div className="category-select-all subcategory-select-all" onClick={(e) => toggleAllCases(subGroup.cases, e)}>
                                      <input type="checkbox" checked={subGroup.cases.every(c => selectedCases.has(c.id))} readOnly className="case-checkbox" />
                                      <span className="select-all-label">Select All</span>
                                    </div>
                                  )}
                                  <div className="category-cases subcategory-cases">
                                    {subGroup.cases.length > 0 ? subGroup.cases.map((c) => (
                                      <div key={c.id} className={`case-row ${selectedCases.has(c.id) ? 'case-row--selected' : ''}`} onClick={() => navigate(`/cases/${c.id}`)}>
                                        {selectionMode && <input type="checkbox" checked={selectedCases.has(c.id)} onChange={(e) => toggleCase(c.id, e)} onClick={(e) => e.stopPropagation()} className="case-checkbox" />}
                                        <span className="case-row-id">C{String(c.id).padStart(7, '0')}</span>
                                        <span className="case-row-title">{c.title}</span>
                                        <span className="case-row-meta">{(c.updated_at || c.created_at) ? new Date(c.updated_at || c.created_at).toLocaleDateString() : ''}</span>
                                        <span className="case-row-meta">{c.author_name || ''}</span>
                                      </div>
                                    )) : (
                                      <div className="category-empty-msg">No test cases in this subcategory</div>
                                    )}
                                  </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  );
                })}

                {grouped.uncategorized.length > 0 && (
                  <div className="category-group">
                    <div className="category-header" onClick={() => toggleCategory('uncategorized')}>
                      <svg className={`category-chevron ${collapsed['uncategorized'] ? '' : 'open'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                      <span className="category-header-name">Uncategorized</span>
                      <span className="category-header-count">{grouped.uncategorized.length}</span>
                    </div>
                    {!collapsed['uncategorized'] && (
                      <>
                      {selectionMode && (
                        <div className="category-select-all" onClick={(e) => toggleAllCases(grouped.uncategorized, e)}>
                          <input type="checkbox" checked={grouped.uncategorized.every(c => selectedCases.has(c.id))} readOnly className="case-checkbox" />
                          <span className="select-all-label">Select All</span>
                        </div>
                      )}
                      <div className="category-cases">
                        {grouped.uncategorized.map((c) => (
                          <div key={c.id} className={`case-row ${selectedCases.has(c.id) ? 'case-row--selected' : ''}`} onClick={() => navigate(`/cases/${c.id}`)}>
                            {selectionMode && <input type="checkbox" checked={selectedCases.has(c.id)} onChange={(e) => toggleCase(c.id, e)} onClick={(e) => e.stopPropagation()} className="case-checkbox" />}
                            <span className="case-row-id">C{String(c.id).padStart(7, '0')}</span>
                            <span className="case-row-title">{c.title}</span>
                            <span className="case-row-meta">{(c.updated_at || c.created_at) ? new Date(c.updated_at || c.created_at).toLocaleDateString() : ''}</span>
                            <span className="case-row-meta">{c.author_name || ''}</span>
                          </div>
                        ))}
                      </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="suite-table-wrapper">
                <div className="empty-state">
                  <p>No categories yet. Create a category to start adding test cases.</p>
                  <button className="btn btn-secondary" onClick={() => {
                    setEditSection(null);
                    setSectionName('');
                    setSectionDescription('');
                    setSectionParentId(null);
                    setShowSectionModal(true);
                  }}>+ Category</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Modal isOpen={showSectionModal} onClose={() => { setShowSectionModal(false); setSectionParentId(null); }} title={editSection ? 'Edit Category' : (sectionParentId ? 'Add Subcategory' : 'Add Category')}>
        <form onSubmit={handleSaveSection} className="modal-form">
          <div className="form-group">
            <label>{sectionParentId && !editSection ? 'Subcategory Name' : 'Category Name'}</label>
            <input type="text" value={sectionName} onChange={(e) => setSectionName(e.target.value)} required autoFocus placeholder={sectionParentId && !editSection ? 'Enter subcategory name' : 'Enter category name'} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={sectionDescription} onChange={(e) => setSectionDescription(e.target.value)} rows={3} placeholder="Optional description for this category" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setShowSectionModal(false); setSectionParentId(null); }}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editSection ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteSection}
        onClose={() => setDeleteSection(null)}
        onConfirm={handleDeleteSection}
        title="Delete Category"
        message={(() => {
          if (!deleteSection) return '';
          const direct = grouped.map[deleteSection.id]?.cases.length || 0;
          const children = (grouped.childrenMap[deleteSection.id] || []);
          const childCases = children.reduce((sum, sub) => sum + (grouped.map[sub.id]?.cases.length || 0), 0);
          const total = direct + childCases;
          const subCount = children.length;
          const parts = [];
          if (total > 0) parts.push(`${total} test case${total !== 1 ? 's' : ''}`);
          if (subCount > 0) parts.push(`${subCount} subcategor${subCount !== 1 ? 'ies' : 'y'}`);
          return `"${deleteSection.name}"${parts.length ? ` (${parts.join(', ')})` : ''} will be permanently deleted.`;
        })()}
        requireSafeguard
      />

      {selectedCases.size > 0 && (
        <div className="bulk-action-bar">
          <span className="bulk-action-count">{selectedCases.size} test case{selectedCases.size !== 1 ? 's' : ''} selected</span>
          <div className="bulk-action-buttons">
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedCases(new Set())}>Clear</button>
            <button className="btn btn-danger btn-sm" onClick={() => setShowBulkDelete(true)}>Delete Selected</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={handleBulkDelete}
        title="Delete Test Cases"
        message={`${selectedCases.size} test case${selectedCases.size !== 1 ? 's' : ''} will be permanently deleted. This cannot be undone.`}
        requireSafeguard
      />
    </div>
  );
}
