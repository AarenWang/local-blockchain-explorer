import { useState, useEffect } from 'react';

interface Tag {
  id: string;
  type: 'address' | 'tx';
  target: string;
  label: string;
  note?: string;
  color: string;
}

interface TagManagerProps {
  type: 'address' | 'tx';
  target: string;
}

const COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
];

const TagManager = ({ type, target }: TagManagerProps) => {
  const [tag, setTag] = useState<Tag | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTag();
  }, [type, target]);

  const loadTag = async () => {
    try {
      const apiBase = import.meta.env.VITE_INDEXER_API ?? 'http://localhost:7070';
      const response = await fetch(`${apiBase}/tags/${type}/${target}`);
      if (response.ok) {
        const data = await response.json();
        setTag(data);
        setLabel(data.label);
        setNote(data.note || '');
        setColor(data.color);
      } else {
        setTag(null);
      }
    } catch (err) {
      console.error('Failed to load tag:', err);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const apiBase = import.meta.env.VITE_INDEXER_API ?? 'http://localhost:7070';
      const response = await fetch(`${apiBase}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, target, label, note, color })
      });

      if (response.ok) {
        const data = await response.json();
        setTag(data);
        setIsOpen(false);
      }
    } catch (err) {
      console.error('Failed to save tag:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this tag?')) return;

    setLoading(true);
    try {
      const apiBase = import.meta.env.VITE_INDEXER_API ?? 'http://localhost:7070';
      await fetch(`${apiBase}/tags/${type}/${target}`, {
        method: 'DELETE'
      });
      setTag(null);
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to delete tag:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="tag-manager">
        {tag ? (
          <span
            className="tag-badge"
            style={{ backgroundColor: tag.color + '20', color: tag.color, border: `1px solid ${tag.color}40` }}
            onClick={() => setIsOpen(true)}
            title={tag.note || tag.label}
          >
            {tag.label}
          </span>
        ) : (
          <button
            type="button"
            className="tag-add-btn"
            onClick={() => setIsOpen(true)}
            title="Add tag"
          >
            + Tag
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="tag-modal">
      <div className="tag-modal-content">
        <h4>{tag ? 'Edit Tag' : 'Add Tag'}</h4>

        <label>
          Label
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g., My Wallet, Exchange, Contract"
            maxLength={50}
          />
        </label>

        <label>
          Note (optional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Additional notes..."
            rows={3}
            maxLength={200}
          />
        </label>

        <label>
          Color
          <div className="color-picker">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-option ${color === c ? 'selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </label>

        <div className="tag-modal-actions">
          {tag && (
            <button
              type="button"
              className="danger"
              onClick={handleDelete}
              disabled={loading}
            >
              Delete
            </button>
          )}
          <div className="tag-modal-actions-right">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (tag) {
                  setLabel(tag.label);
                  setNote(tag.note || '');
                  setColor(tag.color);
                }
              }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={handleSave}
              disabled={loading || !label.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TagManager;
