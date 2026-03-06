import './CategoryList.css';

export default function CategoryList({ sections, selectedId, onSelect, onEdit, onDelete }) {
  return (
    <div className="category-list">
      {sections.map((section) => (
        <div
          key={section.id}
          className={`category-row ${selectedId === section.id ? 'selected' : ''}`}
          onClick={() => onSelect(section.id)}
        >
          <span className="category-name">{section.name}</span>
          <span className="category-count">{section.case_count || 0}</span>
          <div className="category-actions">
            <button title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(section); }}>&#9998;</button>
            <button title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(section); }}>&times;</button>
          </div>
        </div>
      ))}
      {sections.length === 0 && (
        <div className="category-empty">No categories yet</div>
      )}
    </div>
  );
}
