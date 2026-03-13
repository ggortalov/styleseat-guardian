import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import suiteService from '../services/suiteService';
import sectionService from '../services/sectionService';
import caseService from '../services/caseService';
import projectService from '../services/projectService';
import { playConfirmation } from '../services/soundService';
import './TestSuitePage.css';

function SectionNode({ sec, depth, grouped, collapsed, toggleCategory, selectionMode, selectedCases, toggleAllCases, toggleCase, navigate, projectId, suiteId, setSectionParentId, setEditSection, setSectionName, setSectionDescription, setShowSectionModal, setDeleteSection }) {
  const group = grouped.map[sec.id];
  const children = grouped.childrenMap[sec.id] || [];
  const totalCases = grouped.totalCasesFor(sec.id);
  const collapseKey = depth === 0 ? sec.id : `sub-${sec.id}`;
  const isCollapsed = !!collapsed[collapseKey];
  const isRoot = depth === 0;

  const wrapperClass = isRoot ? 'category-group' : 'subcategory-group';
  const headerClass = isRoot ? 'category-header' : 'subcategory-header';
  const nameClass = isRoot ? 'category-header-name' : 'subcategory-header-name';
  const chevronSize = isRoot ? '16' : '14';
  const casesClass = isRoot ? 'category-cases' : 'category-cases subcategory-cases';
  const selectAllClass = isRoot ? 'category-select-all' : 'category-select-all subcategory-select-all';

  return (
    <div id={`category-${sec.id}`} className={wrapperClass}>
      <div className={headerClass} onClick={() => toggleCategory(collapseKey)}>
        <svg className={`category-chevron ${isCollapsed ? '' : 'open'}`} width={chevronSize} height={chevronSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <div className="category-header-info">
          <div className="category-header-top">
            <span className={nameClass}>{sec.name}</span>
            <span className="category-header-count">{totalCases}</span>
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
            <div className={selectAllClass} onClick={(e) => toggleAllCases(group.cases, e)}>
              <input type="checkbox" checked={group.cases.every(c => selectedCases.has(c.id))} readOnly className="case-checkbox" />
              <span className="select-all-label">Select All</span>
            </div>
          )}
          <div className={casesClass}>
            {group.cases.length > 0 ? group.cases.map((c) => (
              <div key={c.id} id={`case-row-${c.id}`} className={`case-row ${selectedCases.has(c.id) ? 'case-row--selected' : ''}`} onClick={() => { if (window.getSelection().toString()) return; navigate(`/cases/${c.id}`); }}>
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
          {children.map((child) => (
            <SectionNode
              key={child.id}
              sec={child}
              depth={depth + 1}
              grouped={grouped}
              collapsed={collapsed}
              toggleCategory={toggleCategory}
              selectionMode={selectionMode}
              selectedCases={selectedCases}
              toggleAllCases={toggleAllCases}
              toggleCase={toggleCase}
              navigate={navigate}
              projectId={projectId}
              suiteId={suiteId}
              setSectionParentId={setSectionParentId}
              setEditSection={setEditSection}
              setSectionName={setSectionName}
              setSectionDescription={setSectionDescription}
              setShowSectionModal={setShowSectionModal}
              setDeleteSection={setDeleteSection}
            />
          ))}
        </>
      )}
    </div>
  );
}

export default function TestSuitePage() {
  const { projectId, suiteId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterCategoryId = searchParams.get('categoryId') ? parseInt(searchParams.get('categoryId')) : null;
  const newCaseId = searchParams.get('newCaseId') ? parseInt(searchParams.get('newCaseId')) : null;
  const scrolledRef = useRef(false);

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

  // Delete suite
  const [showDeleteSuite, setShowDeleteSuite] = useState(false);

  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCases, setSelectedCases] = useState(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const fetchData = async () => {
    try {
      const [p, s, secs] = await Promise.all([
        projectService.getById(projectId),
        suiteService.getById(suiteId),
        sectionService.getBySuite(suiteId),
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
    caseService.getBySuite(suiteId).then(setCases).catch(() => setCases([]));
  };

  const handleDeleteSuite = async () => {
    await suiteService.delete(suiteId);
    if (window.__refreshSidebarProjects) window.__refreshSidebarProjects();
    navigate(`/projects/${projectId}`);
  };

  useEffect(() => { fetchData(); }, [projectId, suiteId]);
  useEffect(() => { fetchCases(); }, [suiteId]);

  // Scroll to newly created case
  useEffect(() => {
    if (newCaseId && cases.length > 0 && !scrolledRef.current) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`case-row-${newCaseId}`);
        if (el) {
          scrolledRef.current = true;
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('case-row--highlight');
          playConfirmation();
          setTimeout(() => el.classList.remove('case-row--highlight'), 2500);
        }
      });
    }
  }, [newCaseId, cases]);

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
    // Recursive total case count for a section and all its descendants
    const totalCasesFor = (sectionId) => {
      const own = map[sectionId]?.cases.length || 0;
      const kids = childrenMap[sectionId] || [];
      return own + kids.reduce((sum, sub) => sum + totalCasesFor(sub.id), 0);
    };
    // Recursive collection of all descendant cases
    const allCasesUnder = (sectionId) => {
      const own = map[sectionId]?.cases || [];
      const kids = childrenMap[sectionId] || [];
      return [...own, ...kids.flatMap(sub => allCasesUnder(sub.id))];
    };
    return { map, uncategorized, roots, childrenMap, totalCasesFor, allCasesUnder };
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
    window.__refreshSidebarProjects?.();
  };

  const handleDeleteSection = async () => {
    if (deleteSection) {
      const deletedId = deleteSection.id;
      await sectionService.delete(deletedId);
      setDeleteSection(null);
      fetchData();
      fetchCases();
      window.__refreshSidebarProjects?.();
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
      window.__refreshSidebarProjects?.();
    } catch {
      setShowBulkDelete(false);
    }
  };

  if (loading) return <><Header breadcrumbs={[{ label: 'Dashboard', path: '/' }]} /><LoadingSpinner /></>;

  const hasCases = cases.length > 0;
  const hasCategories = sections.length > 0;

  // When filtering by a single category — include subcategory cases too
  const filterSection = filterCategoryId ? sections.find(s => s.id === filterCategoryId) : null;
  const filterCases = filterSection ? grouped.allCasesUnder(filterSection.id) : [];
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
                <button className="btn btn-secondary" onClick={() => {
                  setSectionParentId(filterSection.id);
                  setEditSection(null);
                  setSectionName('');
                  setSectionDescription('');
                  setShowSectionModal(true);
                }}>+ Subcategory</button>
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
                    <div key={c.id} id={`case-row-${c.id}`} className={`case-row ${selectedCases.has(c.id) ? 'case-row--selected' : ''}`} onClick={() => { if (window.getSelection().toString()) return; navigate(`/cases/${c.id}`); }}>
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
                <button className="btn btn-danger" onClick={() => setShowDeleteSuite(true)}>Delete Suite</button>
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
                {grouped.roots.map((sec) => (
                  <SectionNode
                    key={sec.id}
                    sec={sec}
                    depth={0}
                    grouped={grouped}
                    collapsed={collapsed}
                    toggleCategory={toggleCategory}
                    selectionMode={selectionMode}
                    selectedCases={selectedCases}
                    toggleAllCases={toggleAllCases}
                    toggleCase={toggleCase}
                    navigate={navigate}
                    projectId={projectId}
                    suiteId={suiteId}
                    setSectionParentId={setSectionParentId}
                    setEditSection={setEditSection}
                    setSectionName={setSectionName}
                    setSectionDescription={setSectionDescription}
                    setShowSectionModal={setShowSectionModal}
                    setDeleteSection={setDeleteSection}
                  />
                ))}

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
                          <div key={c.id} id={`case-row-${c.id}`} className={`case-row ${selectedCases.has(c.id) ? 'case-row--selected' : ''}`} onClick={() => { if (window.getSelection().toString()) return; navigate(`/cases/${c.id}`); }}>
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
          const total = grouped.totalCasesFor(deleteSection.id);
          const subCount = (grouped.childrenMap[deleteSection.id] || []).length;
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

      <ConfirmDialog
        isOpen={showDeleteSuite}
        onClose={() => setShowDeleteSuite(false)}
        onConfirm={handleDeleteSuite}
        title="Delete Suite"
        message={`"${suite?.name}" (${cases.length} test case${cases.length !== 1 ? 's' : ''}, ${sections.length} section${sections.length !== 1 ? 's' : ''}) will be permanently deleted.`}
        requireSafeguard
      />
    </div>
  );
}
