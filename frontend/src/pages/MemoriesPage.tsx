import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaPlus, FaPen, FaTrash, FaUser, FaFolderOpen, FaLightbulb } from 'react-icons/fa6';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memoriesApi } from '../api/memories';
import { projectsApi } from '../api/projects';
import type { Memory, MemoryType, Project, MemorySearchResult, MemoryCreate, MemoryUpdate } from '../api/types';
import { useTimezone } from '../hooks/useTimezone';
import { formatDate as formatDateValue } from '../utils/dateTime';
import { usePageTour } from '../hooks/usePageTour';
import { PageTour } from '../components/onboarding/PageTour';
import { TourHelpButton } from '../components/onboarding/TourHelpButton';
import './MemoriesPage.css';

type MemoryTabId = 'user' | 'project' | 'skills';
type MemoryListItem = Memory & { relevance_score?: number };

interface SkillFormState {
  title: string;
  body: string;
  tags: string;
}

const VALID_TABS: MemoryTabId[] = ['skills', 'user', 'project'];
const TAB_LABELS: Record<MemoryTabId, string> = {
  skills: 'スキルズ',
  user: '個人メモリ',
  project: 'プロジェクトメモリ',
};
const TAB_ICONS: Record<MemoryTabId, React.ReactNode> = {
  skills: <FaLightbulb />,
  user: <FaUser />,
  project: <FaFolderOpen />,
};

const LIST_LIMIT = 200;
const SEARCH_LIMIT = 50;

const typeOptions: Array<{ value: 'all' | MemoryType; label: string }> = [
  { value: 'all', label: 'すべてのタイプ' },
  { value: 'FACT', label: '事実' },
  { value: 'PREFERENCE', label: '好み' },
  { value: 'PATTERN', label: 'パターン' },
  { value: 'RULE', label: 'ルール' },
];

const formatDate = (value: string | undefined, timezone: string) => {
  if (!value) return '-';
  return formatDateValue(
    value,
    { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    timezone,
  );
};

// Skills helper functions
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
    body = content.split(/\r?\n/).slice(1).join('\n').trim();
  } else {
    body = content;
  }
  return {
    title: title || 'Untitled',
    body,
  };
};

export function MemoriesPage() {
  const timezone = useTimezone();
  const [searchParams, setSearchParams] = useSearchParams();
  const tour = usePageTour('memories');

  // Tab state
  const getInitialTab = (): MemoryTabId => {
    const tabParam = searchParams.get('tab');
    if (tabParam && VALID_TABS.includes(tabParam as MemoryTabId)) {
      return tabParam as MemoryTabId;
    }
    return 'skills'; // デフォルトはスキルズ
  };
  const [activeTab, setActiveTab] = useState<MemoryTabId>(getInitialTab);

  // Common state
  const [memories, setMemories] = useState<MemoryListItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memoryType, setMemoryType] = useState<'all' | MemoryType>('all');
  const [projectId, setProjectId] = useState('');
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Skills-specific state
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Memory | null>(null);
  const [formState, setFormState] = useState<SkillFormState>({
    title: '',
    body: '',
    tags: '',
  });

  const projectMap = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project.name]));
  }, [projects]);

  // Update URL when tab changes
  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab !== activeTab) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  // Sync tab from URL
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && VALID_TABS.includes(tabParam as MemoryTabId)) {
      setActiveTab(tabParam as MemoryTabId);
    }
  }, [searchParams]);

  // Load projects
  useEffect(() => {
    let isActive = true;
    const loadProjects = async () => {
      setIsLoadingProjects(true);
      try {
        const data = await projectsApi.getAll();
        if (isActive) {
          setProjects(data);
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
      } finally {
        if (isActive) {
          setIsLoadingProjects(false);
        }
      }
    };
    loadProjects();
    return () => {
      isActive = false;
    };
  }, []);

  // Reset filters when tab changes
  useEffect(() => {
    setQuery('');
    setMemoryType('all');
    setProjectId('');
  }, [activeTab]);

  // Load memories based on active tab
  useEffect(() => {
    let isActive = true;
    const loadMemories = async () => {
      setIsLoading(true);
      setError(null);
      const trimmedQuery = query.trim();

      // Determine scope based on tab
      const scopeMap: Record<MemoryTabId, 'USER' | 'PROJECT' | 'WORK'> = {
        user: 'USER',
        project: 'PROJECT',
        skills: 'WORK',
      };
      const currentScope = scopeMap[activeTab];

      try {
        if (trimmedQuery) {
          const results = await memoriesApi.search({
            query: trimmedQuery,
            scope: currentScope,
            project_id: activeTab === 'project' && projectId ? projectId : undefined,
            limit: SEARCH_LIMIT,
          });
          let items: MemoryListItem[] = results.map((result: MemorySearchResult) => ({
            ...result.memory,
            relevance_score: result.relevance_score,
          }));
          if (memoryType !== 'all') {
            items = items.filter((item) => item.memory_type === memoryType);
          }
          if (isActive) {
            setMemories(items);
          }
        } else {
          const data = await memoriesApi.list({
            scope: currentScope,
            memory_type: activeTab === 'skills' ? 'RULE' : (memoryType === 'all' ? undefined : memoryType),
            project_id: activeTab === 'project' && projectId ? projectId : undefined,
            limit: LIST_LIMIT,
          });
          if (isActive) {
            setMemories(data);
          }
        }
      } catch (err) {
        console.error('Failed to load memories:', err);
        if (isActive) {
          setError('メモリの読み込みに失敗しました。');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadMemories();
    return () => {
      isActive = false;
    };
  }, [activeTab, memoryType, projectId, query]);

  // Skills helper functions
  const skillsView = useMemo(() => {
    return memories.map((memory) => ({
      ...memory,
      summary: summarizeContent(memory.content),
    }));
  }, [memories]);

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

  const handleSaveSkill = async () => {
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
      // Reload memories
      const data = await memoriesApi.list({
        scope: 'WORK',
        memory_type: 'RULE',
        limit: LIST_LIMIT,
      });
      setMemories(data);
    } catch (err) {
      console.error('Failed to save skill:', err);
      alert('スキルの保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSkill = async (skill: Memory) => {
    const confirmed = window.confirm('このスキルを削除しますか？');
    if (!confirmed) return;
    try {
      await memoriesApi.delete(skill.id);
      setMemories((prev) => prev.filter((item) => item.id !== skill.id));
    } catch (err) {
      console.error('Failed to delete skill:', err);
      alert('スキルの削除に失敗しました。');
    }
  };

  const handleDeleteMemory = async (memory: Memory) => {
    if (deletingId || isLoading) return;
    const confirmed = window.confirm('このメモリを削除しますか？');
    if (!confirmed) return;
    setDeletingId(memory.id);
    try {
      await memoriesApi.delete(memory.id);
      setMemories((prev) => prev.filter((item) => item.id !== memory.id));
    } catch (err) {
      console.error('Failed to delete memory:', err);
      alert('メモリの削除に失敗しました。');
    } finally {
      setDeletingId(null);
    }
  };

  // Render tab content
  const renderTabContent = () => {
    if (error) {
      return <div className="error-state">{error}</div>;
    }

    if (isLoading) {
      return <div className="loading-state">読み込み中...</div>;
    }

    // Skills tab
    if (activeTab === 'skills') {
      return (
        <>
          <div className="memories-toolbar">
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
            <div className="toolbar-actions">
              <span className="memory-total">{memories.length} 件</span>
              <button className="button button-primary" onClick={() => openEditor()}>
                <FaPlus /> 新規スキル
              </button>
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
                <div
                  key={skill.id}
                  className="skill-card"
                  onClick={() =>
                    setExpandedSkills((prev) => {
                      const next = new Set(prev);
                      if (next.has(skill.id)) {
                        next.delete(skill.id);
                      } else {
                        next.add(skill.id);
                      }
                      return next;
                    })
                  }
                >
                  <div className="skill-header">
                    <div>
                      <h3 className="skill-title">{skill.summary.title}</h3>
                      {skill.summary.body && (
                        <div className={`skill-body markdown-content${expandedSkills.has(skill.id) ? ' is-expanded' : ''}`}>
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
                        onClick={(e) => { e.stopPropagation(); openEditor(skill); }}
                        title="編集"
                      >
                        <FaPen />
                      </button>
                      <button
                        className="skill-action-btn danger"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteSkill(skill); }}
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
        </>
      );
    }

    // User/Project memory tabs
    return (
      <>
        <div className="memories-filters">
          <div className="filter-group">
            <label className="filter-label" htmlFor="memory-search">
              検索
            </label>
            <input
              id="memory-search"
              className="filter-input"
              type="search"
              placeholder="メモリを検索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label className="filter-label" htmlFor="memory-type">
              タイプ
            </label>
            <select
              id="memory-type"
              className="filter-select"
              value={memoryType}
              onChange={(e) => setMemoryType(e.target.value as 'all' | MemoryType)}
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {activeTab === 'project' && (
            <div className="filter-group">
              <label className="filter-label" htmlFor="memory-project">
                プロジェクト
              </label>
              <select
                id="memory-project"
                className="filter-select"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={isLoadingProjects}
              >
                <option value="">{isLoadingProjects ? '読み込み中...' : 'すべてのプロジェクト'}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="filter-group">
            <span className="memory-total">{memories.length} 件</span>
          </div>
        </div>

        <div className="memories-list">
          {memories.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">メモリが見つかりません。</p>
              <p className="empty-hint">フィルターや検索条件を調整してみてください。</p>
            </div>
          ) : (
            memories.map((memory) => (
              <div key={memory.id} className="memory-card">
                <div className="memory-header">
                  <div className="memory-badges">
                    <span className="memory-badge type">{memory.memory_type}</span>
                    {memory.relevance_score !== undefined && (
                      <span className="memory-badge score">
                        {(memory.relevance_score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div className="memory-header-actions">
                    <span className="memory-date">{formatDate(memory.created_at, timezone)}</span>
                    <button
                      className="memory-delete-btn"
                      type="button"
                      onClick={() => handleDeleteMemory(memory)}
                      disabled={Boolean(deletingId)}
                    >
                      {deletingId === memory.id ? '削除中...' : '削除'}
                    </button>
                  </div>
                </div>
                <div className="memory-content markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {memory.content}
                  </ReactMarkdown>
                </div>
                <div className="memory-meta">
                  {memory.project_id && (
                    <span className="memory-project">
                      {projectMap.get(memory.project_id) || memory.project_id}
                    </span>
                  )}
                  {memory.tags.length > 0 && (
                    <div className="memory-tags">
                      {memory.tags.map((tag) => (
                        <span key={tag} className="memory-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="memory-source">{memory.source}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </>
    );
  };

  return (
    <div className="memories-page">
      <div className="page-header">
        <h2 className="page-title">メモリー</h2>
        <div className="header-actions">
          <TourHelpButton onClick={tour.startTour} />
        </div>
      </div>

      <nav className="memories-tabs">
        {VALID_TABS.map((tabId) => (
          <button
            key={tabId}
            type="button"
            className={`memories-tab ${activeTab === tabId ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tabId)}
          >
            <span className="memories-tab-icon">{TAB_ICONS[tabId]}</span>
            <span>{TAB_LABELS[tabId]}</span>
          </button>
        ))}
      </nav>

      <div className="memories-panel">
        {renderTabContent()}
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
                onClick={handleSaveSkill}
                disabled={isSaving}
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
      <PageTour
        run={tour.run}
        steps={tour.steps}
        stepIndex={tour.stepIndex}
        onCallback={tour.handleCallback}
      />
    </div>
  );
}
