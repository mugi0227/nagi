import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FaTrophy,
  FaCheckCircle,
  FaChartLine,
  FaLightbulb,
  FaRocket,
  FaStar,
  FaSpinner,
  FaCalendarAlt,
  FaChevronDown,
  FaChevronUp,
} from 'react-icons/fa';
import { achievementsApi } from '../api/achievements';
import type { SkillExperience } from '../api/types';
import { useTimezone } from '../hooks/useTimezone';
import { formatDate, nowInTimezone } from '../utils/dateTime';
import './AchievementPage.css';

type PeriodType = 'H1' | 'H2' | 'custom';

interface PeriodOption {
  type: PeriodType;
  year?: number;
  label: string;
  startDate: string;
  endDate: string;
}

function SkillBar({ skill, maxCount }: { skill: SkillExperience; maxCount: number }) {
  const widthPercent = maxCount > 0 ? (skill.experience_count / maxCount) * 100 : 0;

  return (
    <div className="skill-bar-container">
      <div className="skill-bar-label">
        <span className="skill-name">{skill.category}</span>
        <span className="skill-count">{skill.experience_count}件</span>
      </div>
      <div className="skill-bar-track">
        <div
          className="skill-bar-fill"
          style={{ width: `${Math.max(widthPercent, 5)}%` }}
        />
      </div>
    </div>
  );
}

function SkillSection({
  title,
  skills,
  icon,
}: {
  title: string;
  skills: SkillExperience[];
  icon: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const maxCount = Math.max(...skills.map((s) => s.experience_count), 1);

  if (skills.length === 0) return null;

  return (
    <div className="skill-section">
      <button className="skill-section-header" onClick={() => setExpanded(!expanded)}>
        <span className="skill-section-icon">{icon}</span>
        <span className="skill-section-title">{title}</span>
        <span className="skill-section-count">{skills.length}カテゴリ</span>
        {expanded ? <FaChevronUp /> : <FaChevronDown />}
      </button>
      {expanded && (
        <div className="skill-bars">
          {skills
            .sort((a, b) => b.experience_count - a.experience_count)
            .map((skill) => (
              <SkillBar key={skill.category} skill={skill} maxCount={maxCount} />
            ))}
        </div>
      )}
    </div>
  );
}

export function AchievementPage() {
  const queryClient = useQueryClient();
  const timezone = useTimezone();
  const now = nowInTimezone(timezone);
  const currentYear = now.year;
  const currentMonth = now.month;
  const defaultPeriodType: PeriodType = currentMonth >= 4 && currentMonth <= 9 ? 'H1' : 'H2';
  // 1-3月は前年の下期に属する
  const defaultYear = currentMonth >= 1 && currentMonth <= 3 ? currentYear - 1 : currentYear;

  const [selectedPeriodType, setSelectedPeriodType] = useState<PeriodType>(defaultPeriodType);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showTaskList, setShowTaskList] = useState(false);

  // Generate period options
  const periodOptions: PeriodOption[] = useMemo(() => {
    const options: PeriodOption[] = [];
    for (let year = currentYear; year >= currentYear - 1; year--) {
      options.push({
        type: 'H1',
        year,
        label: `${year}年 上期 (4-9月)`,
        startDate: `${year}-04-01T00:00:00`,
        endDate: `${year}-09-30T23:59:59`,
      });
      options.push({
        type: 'H2',
        year,
        label: `${year}年 下期 (10-3月)`,
        startDate: `${year}-10-01T00:00:00`,
        endDate: `${year + 1}-03-31T23:59:59`,
      });
    }
    return options;
  }, [currentYear]);

  const currentOption = periodOptions.find(
    (opt) => opt.type === selectedPeriodType && opt.year === selectedYear
  );

  const periodStart =
    selectedPeriodType === 'custom' && customStartDate
      ? `${customStartDate}T00:00:00`
      : currentOption?.startDate || '';
  const periodEnd =
    selectedPeriodType === 'custom' && customEndDate
      ? `${customEndDate}T23:59:59`
      : currentOption?.endDate || '';
  const periodLabel =
    selectedPeriodType === 'custom'
      ? `${customStartDate} 〜 ${customEndDate}`
      : currentOption?.label || '';

  // Fetch achievements list
  const { data: achievementsData, isLoading: isLoadingAchievements } = useQuery({
    queryKey: ['achievements', periodStart, periodEnd],
    queryFn: () =>
      achievementsApi.list({
        period_start: periodStart,
        period_end: periodEnd,
        limit: 1,
      }),
    enabled: !!periodStart && !!periodEnd,
  });

  const achievement = achievementsData?.achievements?.[0];

  // Preview completed tasks
  const { data: previewData, isLoading: isLoadingPreview } = useQuery({
    queryKey: ['achievement-preview', periodStart, periodEnd],
    queryFn: () => achievementsApi.previewCompletedTasks(periodStart, periodEnd),
    enabled: !!periodStart && !!periodEnd && !achievement,
  });

  // Generate achievement mutation
  const generateMutation = useMutation({
    mutationFn: () =>
      achievementsApi.create({
        period_start: periodStart,
        period_end: periodEnd,
        period_label: periodLabel,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['achievements'] });
    },
  });

  const handlePeriodChange = (option: PeriodOption) => {
    setSelectedPeriodType(option.type);
    if (option.year) setSelectedYear(option.year);
  };

  const handleGenerate = () => {
    if (!periodStart || !periodEnd) return;
    generateMutation.mutate();
  };

  const isLoading = isLoadingAchievements || isLoadingPreview;

  return (
    <div className="achievement-page">
      {/* Header */}
      <div className="page-header">
        <div className="header-left">
          <FaTrophy className="page-icon" />
          <h2 className="page-title">Achievement</h2>
        </div>
      </div>

      {/* Period Selector */}
      <div className="period-selector-container">
        <div className="period-buttons">
          {periodOptions.slice(0, 4).map((option) => (
            <button
              key={`${option.year}-${option.type}`}
              className={`period-btn ${
                option.type === selectedPeriodType && option.year === selectedYear
                  ? 'active'
                  : ''
              }`}
              onClick={() => handlePeriodChange(option)}
            >
              {option.label}
            </button>
          ))}
          <button
            className={`period-btn ${selectedPeriodType === 'custom' ? 'active' : ''}`}
            onClick={() => setSelectedPeriodType('custom')}
          >
            カスタム期間
          </button>
        </div>

        {selectedPeriodType === 'custom' && (
          <div className="custom-period-inputs">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="date-input"
            />
            <span className="date-separator">〜</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="date-input"
            />
          </div>
        )}
      </div>

      {/* Main Content */}
      {isLoading ? (
        <div className="loading-state">
          <FaSpinner className="spinner" />
          読み込み中...
        </div>
      ) : achievement ? (
        /* Achievement exists - show it */
        <div className="achievement-content">
          {/* Stats Summary */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon completed">
                <FaCheckCircle />
              </div>
              <div className="stat-info">
                <div className="stat-value">{achievement.task_count}</div>
                <div className="stat-label">完了タスク</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon projects">
                <FaChartLine />
              </div>
              <div className="stat-info">
                <div className="stat-value">{achievement.project_ids.length}</div>
                <div className="stat-label">関連プロジェクト</div>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="achievement-section summary-section">
            <h3>
              <FaStar className="section-icon" />
              達成サマリー
            </h3>
            <p className="summary-text">{achievement.summary}</p>
          </div>

          {/* Skill Map */}
          <div className="achievement-section skill-map-section">
            <h3>
              <FaChartLine className="section-icon" />
              スキルマップ
            </h3>
            <div className="skill-map">
              <SkillSection
                title="専門領域"
                skills={achievement.skill_analysis.domain_skills}
                icon="🎯"
              />
              <SkillSection
                title="ソフトスキル"
                skills={achievement.skill_analysis.soft_skills}
                icon="💬"
              />
              <SkillSection
                title="作業タイプ"
                skills={achievement.skill_analysis.work_types}
                icon="🛠️"
              />
            </div>

            {/* Strengths & Growth Areas */}
            <div className="skill-insights">
              {achievement.skill_analysis.strengths.length > 0 && (
                <div className="insight-box strengths">
                  <h4>
                    <FaStar className="insight-icon" />
                    強み
                  </h4>
                  <ul>
                    {achievement.skill_analysis.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {achievement.skill_analysis.growth_areas.length > 0 && (
                <div className="insight-box growth-areas">
                  <h4>
                    <FaRocket className="insight-icon" />
                    伸びしろ
                  </h4>
                  <ul>
                    {achievement.skill_analysis.growth_areas.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Growth Points */}
          {achievement.growth_points.length > 0 && (
            <div className="achievement-section">
              <h3>
                <FaChartLine className="section-icon" />
                成長ポイント
              </h3>
              <ul className="growth-points-list">
                {achievement.growth_points.map((point, i) => (
                  <li key={i}>
                    <FaCheckCircle className="point-icon" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next Suggestions */}
          {achievement.next_suggestions.length > 0 && (
            <div className="achievement-section">
              <h3>
                <FaLightbulb className="section-icon" />
                次への提案
              </h3>
              <ul className="suggestions-list">
                {achievement.next_suggestions.map((suggestion, i) => (
                  <li key={i}>
                    <FaRocket className="suggestion-icon" />
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Regenerate Button */}
          <div className="action-buttons">
            <button
              className="regenerate-btn"
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <>
                  <FaSpinner className="spinner" />
                  再生成中...
                </>
              ) : (
                <>
                  <FaRocket />
                  再生成
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* No achievement - show preview and generate button */
        <div className="achievement-content">
          <div className="no-achievement">
            <div className="preview-stats">
              <div className="stat-card">
                <div className="stat-icon completed">
                  <FaCheckCircle />
                </div>
                <div className="stat-info">
                  <div className="stat-value">{previewData?.task_count || 0}</div>
                  <div className="stat-label">完了タスク</div>
                </div>
              </div>
            </div>

            {previewData && previewData.task_count > 0 ? (
              <>
                <p className="generate-prompt">
                  この期間に{previewData.task_count}件のタスクを完了しました。
                  <br />
                  AIが分析して達成サマリーを生成します。
                </p>

                <button
                  className="generate-btn"
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? (
                    <>
                      <FaSpinner className="spinner" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <FaRocket />
                      Achievementを生成
                    </>
                  )}
                </button>

                {/* Task Preview */}
                <div className="task-preview-section">
                  <button
                    className="toggle-task-list"
                    onClick={() => setShowTaskList(!showTaskList)}
                  >
                    <FaCalendarAlt />
                    完了タスク一覧を{showTaskList ? '隠す' : '見る'}
                    {showTaskList ? <FaChevronUp /> : <FaChevronDown />}
                  </button>

                  {showTaskList && (
                    <ul className="task-preview-list">
                      {previewData.tasks.map((task) => (
                        <li key={task.id} className="task-preview-item">
                          <FaCheckCircle className="check-icon" />
                          <div className="task-info">
                            <span className="task-title">{task.title}</span>
                            <span className="task-date">
                              {formatDate(
                                task.completed_at,
                                { month: 'numeric', day: 'numeric' },
                                timezone
                              )}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <FaTrophy className="empty-icon" />
                <p>この期間に完了したタスクはありません</p>
                <p className="empty-hint">
                  タスクを完了するとAchievementが生成できるようになります
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
