import { useEffect, useMemo, useState } from 'react';
import { FaPlus, FaPen, FaTrash } from 'react-icons/fa6';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memoriesApi } from '../api/memories';
import type { Memory, MemoryCreate, MemoryUpdate } from '../api/types';
import './SkillsPage.css';

interface SkillFormState {
  title: string;
  body: string;
  tags: string;
}

const LIST_LIMIT = 200;
const SEARCH_LIMIT = 50;

const extractTitleAndBody = (content: string): SkillFormState => {
  const trimmed = content.trim();
  if (!trimmed) {
    return { title: '', body: '', tags: '' };
  }
  const lines = trimmed.split(/\r?\n/);
  if (lines[0].startsWith('# ')) {
    const title = lines[0].slice(2).trim();
    const body = lines.slice(1).join('\n').replace(/^\s+/, '');
    return { title, body, tags: '' };
  }
  return { title: '', body: trimmed, tags: '' };
};

const buildContent = (title: string, body: string) => {
  const normalizedBody = body.trim();
  if (title.trim()) {
    if (normalizedBody) {
      return `# ${title.trim()}\n\n${normalizedBody}`;
    }
    return `# ${title.trim()}`;
  }
  return normalizedBody;
};

const summarizeContent = (content: string) => {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) {
    return { title: 'Untitled', body: '' };
  }
  let title = lines[0];
  let body = '';
  if (title.startsWith('# ')) {
    title = title.slice(2).trim();
    // タイトル行を除いた残りをbodyとして保持
    body = content.split(/\r?\n/).slice(1).join('\n').trim();
  } else {
    body = content;
  }
  return {
    title: title || 'Untitled',
    body,
  };
};

export function SkillsPage() {
  const [skills, setSkills] = useState<Memory[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Memory | null>(null);
  const [formState, setFormState] = useState<SkillFormState>({
    title: '',
    body: '',
    tags: '',
  });

  const loadSkills = async () => {
    setIsLoading(true);
    setError(null);
    const trimmedQuery = query.trim();
    try {
      if (trimmedQuery) {
        const results = await memoriesApi.search({
          query: trimmedQuery,
          scope: 'WORK',
          limit: SEARCH_LIMIT,
        });
        setSkills(results.map((result) => result.memory));
      } else {
        const data = await memoriesApi.list({
          scope: 'WORK',
          memory_type: 'RULE',
          limit: LIST_LIMIT,
        });
        setSkills(data);
      }
    } catch (err) {
      console.error('Failed to load skills:', err);
    setError('スキルの読み込みに失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, [query]);

  const skillsView = useMemo(() => {
    return skills.map((skill) => ({
      ...skill,
      summary: summarizeContent(skill.content),
    }));
  }, [skills]);

  const openEditor = (skill?: Memory) => {
    if (skill) {
      const parsed = extractTitleAndBody(skill.content);
      setEditingSkill(skill);
      setFormState({
        ...parsed,
        tags: skill.tags.join(', '),
      });
    } else {
      setEditingSkill(null);
      setFormState({ title: '', body: '', tags: '' });
    }
    setIsEditorOpen(true);
  };

  const handleSave = async () => {
    if (isSaving) return;
    const content = buildContent(formState.title, formState.body);
    if (!content.trim()) {
      alert('スキルの内容を入力してください。');
      return;
    }
    setIsSaving(true);
    const tags = formState.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    try {
      if (editingSkill) {
        const payload: MemoryUpdate = {
          content,
          tags,
        };
        await memoriesApi.update(editingSkill.id, payload);
      } else {
        const payload: MemoryCreate = {
          content,
          scope: 'WORK',
          memory_type: 'RULE',
          tags,
        };
        await memoriesApi.create(payload);
      }
      setIsEditorOpen(false);
      setEditingSkill(null);
      await loadSkills();
    } catch (err) {
      console.error('Failed to save skill:', err);
      alert('スキルの保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (skill: Memory) => {
    const confirmed = window.confirm('このスキルを削除しますか？');
    if (!confirmed) return;
    try {
      await memoriesApi.delete(skill.id);
      setSkills((prev) => prev.filter((item) => item.id !== skill.id));
    } catch (err) {
      console.error('Failed to delete skill:', err);
      alert('スキルの削除に失敗しました。');
    }
  };

  if (error) {
    return (
      <div className="skills-page">
        <div className="error-state">{error}</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="skills-page">
        <div className="loading-state">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="skills-page">
      <div className="page-header">
        <h2 className="page-title">Skills</h2>
        <div className="header-actions">
          <span className="skill-total">{skills.length} 件</span>
          <button className="button button-primary" onClick={() => openEditor()}>
            <FaPlus /> 新規スキル
          </button>
        </div>
      </div>

      <div className="skills-toolbar">
        <div className="filter-group">
          <label className="filter-label" htmlFor="skills-search">
            検索
          </label>
          <input
            id="skills-search"
            className="filter-input"
            type="search"
            placeholder="スキルを検索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="skills-list">
        {skillsView.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">スキルがまだありません。</p>
            <p className="empty-hint">よく使う手順をスキルとして登録しましょう。</p>
          </div>
        ) : (
          skillsView.map((skill) => (
            <div key={skill.id} className="skill-card">
              <div className="skill-header">
                <div>
                  <h3 className="skill-title">{skill.summary.title}</h3>
                  {skill.summary.body && (
                    <div className="skill-body markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {skill.summary.body}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
                <div className="skill-actions">
                  <button
                    className="skill-action-btn"
                    type="button"
                    onClick={() => openEditor(skill)}
                    title="編集"
                  >
                    <FaPen />
                  </button>
                  <button
                    className="skill-action-btn danger"
                    type="button"
                    onClick={() => handleDelete(skill)}
                    title="削除"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
              {skill.tags.length > 0 && (
                <div className="skill-tags">
                  {skill.tags.map((tag) => (
                    <span key={tag} className="skill-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {isEditorOpen && (
        <div className="skills-modal-overlay" onClick={() => setIsEditorOpen(false)}>
          <div className="skills-modal" onClick={(e) => e.stopPropagation()}>
            <div className="skills-modal-header">
              <h3>{editingSkill ? 'スキルを編集' : '新規スキル'}</h3>
              <button
                className="skills-modal-close"
                type="button"
                onClick={() => setIsEditorOpen(false)}
              >
                閉じる
              </button>
            </div>
            <div className="skills-modal-body">
              <label className="field-label" htmlFor="skill-title">
                タイトル
              </label>
              <input
                id="skill-title"
                className="text-input"
                type="text"
                value={formState.title}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="例: 経費精算の手順"
              />
              <label className="field-label" htmlFor="skill-body">
                内容
              </label>
              <textarea
                id="skill-body"
                className="text-area"
                rows={10}
                value={formState.body}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, body: e.target.value }))
                }
                placeholder="Markdownで手順を記述してください..."
              />
              <label className="field-label" htmlFor="skill-tags">
                タグ
              </label>
              <input
                id="skill-tags"
                className="text-input"
                type="text"
                value={formState.tags}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, tags: e.target.value }))
                }
                placeholder="カンマ区切り"
              />
            </div>
            <div className="skills-modal-footer">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setIsEditorOpen(false)}
              >
                キャンセル
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
