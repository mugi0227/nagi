import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FaTrophy, FaCalendar, FaCheckCircle, FaChartLine } from 'react-icons/fa';
import { tasksApi } from '../api/tasks';
import type { Task } from '../api/types';
import { useTimezone } from '../hooks/useTimezone';
import { formatDate, nowInTimezone, toDateTime } from '../utils/dateTime';
import './AchievementPage.css';

type Period = 'H1' | 'H2';

interface PeriodOption {
  year: number;
  period: Period;
  label: string;
  startDate: string;
  endDate: string;
}

export function AchievementPage() {
  const timezone = useTimezone();
  const now = nowInTimezone(timezone);
  const currentYear = now.year;
  const currentMonth = now.month;
  const defaultPeriod: Period = currentMonth >= 4 && currentMonth <= 9 ? 'H1' : 'H2';

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>(defaultPeriod);

  // Generate period options (last 2 years)
  const periodOptions: PeriodOption[] = [];
  for (let year = currentYear; year >= currentYear - 1; year--) {
    periodOptions.push({
      year,
      period: 'H1',
      label: `${year}年 上期 (4-9月)`,
      startDate: `${year}-04-01`,
      endDate: `${year}-09-30`,
    });
    periodOptions.push({
      year,
      period: 'H2',
      label: `${year}年 下期 (10-3月)`,
      startDate: `${year}-10-01`,
      endDate: `${year + 1}-03-31`,
    });
  }

  const currentOption = periodOptions.find(
    (opt) => opt.year === selectedYear && opt.period === selectedPeriod
  );

  // Fetch completed tasks for the period
  const { data: allTasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => tasksApi.getAll(),
  });

  const completedTasks = allTasks.filter((task: Task) => {
    if (task.status !== 'DONE' || !task.updated_at) return false;
    const taskDate = toDateTime(task.updated_at, timezone);
    const start = toDateTime(currentOption?.startDate || '', timezone);
    const end = toDateTime(currentOption?.endDate || '', timezone).endOf('day');
    if (!taskDate.isValid || !start.isValid || !end.isValid) return false;
    return taskDate.toMillis() >= start.toMillis() && taskDate.toMillis() <= end.toMillis();
  });

  // Group by project
  const tasksByProject = completedTasks.reduce((acc: Record<string, Task[]>, task: Task) => {
    const key = task.project_id || 'inbox';
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  const handlePeriodChange = (option: PeriodOption) => {
    setSelectedYear(option.year);
    setSelectedPeriod(option.period);
  };

  if (isLoading) {
    return (
      <div className="achievement-page">
        <div className="loading-state">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="achievement-page">
      <div className="page-header">
        <div className="header-left">
          <FaTrophy className="page-icon" />
          <h2 className="page-title">成果サマリー</h2>
        </div>
        <div className="period-selector">
          {periodOptions.map((option) => (
            <button
              key={`${option.year}-${option.period}`}
              className={`period-btn ${
                option.year === selectedYear && option.period === selectedPeriod ? 'active' : ''
              }`}
              onClick={() => handlePeriodChange(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="achievement-content">
        {/* Stats Summary */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon completed">
              <FaCheckCircle />
            </div>
            <div className="stat-info">
              <div className="stat-value">{completedTasks.length}</div>
              <div className="stat-label">完了タスク</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon projects">
              <FaChartLine />
            </div>
            <div className="stat-info">
              <div className="stat-value">{Object.keys(tasksByProject).length}</div>
              <div className="stat-label">関連プロジェクト</div>
            </div>
          </div>
        </div>

        {/* Task List by Project */}
        <div className="achievement-section">
          <h3>達成事項</h3>
          {completedTasks.length === 0 ? (
            <div className="empty-state">
              <p>この期間の完了タスクはありません</p>
            </div>
          ) : (
            <div className="project-groups">
              {Object.entries(tasksByProject).map(([projectId, tasks]: [string, Task[]]) => (
                <div key={projectId} className="project-group">
                  <h4 className="project-header">
                    {projectId === 'inbox' ? '📥 Inbox' : `📁 ${tasks[0]?.project_id || projectId}`}
                    <span className="task-count">{tasks.length}件</span>
                  </h4>
                  <ul className="achievement-list">
                    {tasks.map((task: Task) => (
                      <li key={task.id} className="achievement-item">
                        <FaCheckCircle className="check-icon" />
                        <div className="achievement-info">
                          <div className="achievement-title">{task.title}</div>
                          {task.description && (
                            <div className="achievement-desc">{task.description}</div>
                          )}
                          <div className="achievement-meta">
                            <span>完了日: {formatDate(task.updated_at, { year: 'numeric', month: 'numeric', day: 'numeric' }, timezone)}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Export Section */}
        <div className="achievement-section">
          <h3>成長ポイント</h3>
          <textarea
            className="growth-notes"
            placeholder="この期間で学んだこと、成長したポイントを記入してください...&#10;&#10;例:&#10;- プロジェクトAで新しい技術スタックを習得&#10;- タスク管理の効率が向上&#10;- チーム連携がスムーズになった"
            rows={8}
          />
          <button className="export-btn">
            <FaCalendar />
            レポートをエクスポート
          </button>
        </div>
      </div>
    </div>
  );
}
