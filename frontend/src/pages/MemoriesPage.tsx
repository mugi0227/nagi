import { useEffect, useMemo, useState } from 'react';
import { memoriesApi } from '../api/memories';
import { projectsApi } from '../api/projects';
import type { Memory, MemoryScope, MemoryType, Project, MemorySearchResult } from '../api/types';
import { useTimezone } from '../hooks/useTimezone';
import { formatDate as formatDateValue } from '../utils/dateTime';
import './MemoriesPage.css';

type MemoryListItem = Memory & { relevance_score?: number };

const LIST_LIMIT = 200;
const SEARCH_LIMIT = 50;

const scopeOptions: Array<{ value: 'all' | MemoryScope; label: string }> = [
  { value: 'all', label: 'All scopes' },
  { value: 'USER', label: 'User' },
  { value: 'PROJECT', label: 'Project' },
  { value: 'WORK', label: 'Skills' },
];

const typeOptions: Array<{ value: 'all' | MemoryType; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'FACT', label: 'Fact' },
  { value: 'PREFERENCE', label: 'Preference' },
  { value: 'PATTERN', label: 'Pattern' },
  { value: 'RULE', label: 'Rule' },
];

const formatDate = (value: string | undefined, timezone: string) => {
  if (!value) return '-';
  return formatDateValue(
    value,
    { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    timezone,
  );
};

const formatScope = (value: MemoryScope) => {
  if (value === 'WORK') {
    return 'SKILLS';
  }
  return value;
};

export function MemoriesPage() {
  const timezone = useTimezone();
  const [memories, setMemories] = useState<MemoryListItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'all' | MemoryScope>('all');
  const [memoryType, setMemoryType] = useState<'all' | MemoryType>('all');
  const [projectId, setProjectId] = useState('');
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const projectMap = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project.name]));
  }, [projects]);

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

  useEffect(() => {
    if (scope !== 'PROJECT' && projectId) {
      setProjectId('');
    }
  }, [scope, projectId]);

  useEffect(() => {
    let isActive = true;
    const loadMemories = async () => {
      setIsLoading(true);
      setError(null);
      const trimmedQuery = query.trim();
      try {
        if (trimmedQuery) {
          const results = await memoriesApi.search({
            query: trimmedQuery,
            scope: scope === 'all' ? undefined : scope,
            project_id: projectId || undefined,
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
            scope: scope === 'all' ? undefined : scope,
            memory_type: memoryType === 'all' ? undefined : memoryType,
            project_id: projectId || undefined,
            limit: LIST_LIMIT,
          });
          if (isActive) {
            setMemories(data);
          }
        }
      } catch (err) {
        console.error('Failed to load memories:', err);
        if (isActive) {
          setError('Failed to load memories.');
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
  }, [scope, memoryType, projectId, query]);

  if (error) {
    return (
      <div className="memories-page">
        <div className="error-state">{error}</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="memories-page">
        <div className="loading-state">Loading memories...</div>
      </div>
    );
  }

  return (
    <div className="memories-page">
      <div className="page-header">
        <h2 className="page-title">Memories</h2>
        <div className="header-actions">
          <span className="memory-total">{memories.length} items</span>
        </div>
      </div>

      <div className="memories-filters">
        <div className="filter-group">
          <label className="filter-label" htmlFor="memory-search">
            Search
          </label>
          <input
            id="memory-search"
            className="filter-input"
            type="search"
            placeholder="Search memories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="memory-scope">
            Scope
          </label>
          <select
            id="memory-scope"
            className="filter-select"
            value={scope}
            onChange={(e) => setScope(e.target.value as 'all' | MemoryScope)}
          >
            {scopeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="memory-type">
            Type
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
        <div className="filter-group">
          <label className="filter-label" htmlFor="memory-project">
            Project
          </label>
          <select
            id="memory-project"
            className="filter-select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={scope !== 'PROJECT' || isLoadingProjects}
          >
            <option value="">{isLoadingProjects ? 'Loading...' : 'All projects'}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="memories-list">
        {memories.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">No memories found.</p>
            <p className="empty-hint">Try adjusting the filters or search term.</p>
          </div>
        ) : (
          memories.map((memory) => (
            <div key={memory.id} className="memory-card">
              <div className="memory-header">
                <div className="memory-badges">
                  <span className={`memory-badge scope-${memory.scope.toLowerCase()}`}>
                    {formatScope(memory.scope)}
                  </span>
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
                    onClick={async () => {
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
                    }}
                    disabled={Boolean(deletingId)}
                  >
                    {deletingId === memory.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
              <p className="memory-content">{memory.content}</p>
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
    </div>
  );
}
