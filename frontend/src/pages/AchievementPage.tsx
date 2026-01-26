import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
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
import type { Achievement, SkillExperience } from '../api/types';
import { useTimezone } from '../hooks/useTimezone';
import { formatDate, nowInTimezone, toDateTime } from '../utils/dateTime';
import './AchievementPage.css';

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
  icon: ReactNode;
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

const getLatestWeekPeriod = (now: DateTime) => {
  const daysSinceFriday = (now.weekday - 5 + 7) % 7;
  const weekEnd = now.startOf('day').minus({ days: daysSinceFriday });
  const weekStart = weekEnd.minus({ days: 7 });
  return { weekStart, weekEnd };
};

const formatPeriodLabel = (start: string | Date, end: string | Date, timezone: string) => {
  const startLabel = formatDate(start, { month: 'numeric', day: 'numeric' }, timezone);
  const endLabel = formatDate(end, { month: 'numeric', day: 'numeric' }, timezone);
  return `${startLabel} - ${endLabel}`;
};

const isSamePeriod = (
  achievement: Achievement,
  weekStart: DateTime,
  weekEnd: DateTime,
  timezone: string,
) => {
  const start = toDateTime(achievement.period_start, timezone).toUTC();
  const end = toDateTime(achievement.period_end, timezone).toUTC();
  return (
    Math.abs(start.toMillis() - weekStart.toUTC().toMillis()) < 1000 &&
    Math.abs(end.toMillis() - weekEnd.toUTC().toMillis()) < 1000
  );
};

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const timezone = useTimezone();
  const [expanded, setExpanded] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const taskSnapshots = achievement.task_snapshots ?? [];
  const periodLabel =
    achievement.period_label ||
    formatPeriodLabel(achievement.period_start, achievement.period_end, timezone);
  const detailsAvailable =
    achievement.growth_points.length > 0 ||
    achievement.next_suggestions.length > 0 ||
    taskSnapshots.length > 0 ||
    achievement.skill_analysis.domain_skills.length > 0 ||
    achievement.skill_analysis.soft_skills.length > 0 ||
    achievement.skill_analysis.work_types.length > 0;

  return (
    <div className="achievement-week-card">
      <div className="achievement-week-header">
        <div className="achievement-week-title">
          <FaCalendarAlt className="achievement-week-icon" />
          <span>{periodLabel}</span>
        </div>
        <span className={`generation-type ${achievement.generation_type.toLowerCase()}`}>
          {achievement.generation_type === 'AUTO' ? '自動生成' : '手動生成'}
        </span>
      </div>

      <p className="achievement-week-summary">{achievement.summary}</p>

      <div className="achievement-week-stats">
        <div className="achievement-week-stat">
          <span className="stat-value">{achievement.task_count}</span>
          <span className="stat-label">完了タスク</span>
        </div>
        <div className="achievement-week-stat">
          <span className="stat-value">{achievement.project_ids.length}</span>
          <span className="stat-label">関連プロジェクト</span>
        </div>
      </div>

      {detailsAvailable && (
        <button className="achievement-toggle-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? '詳細を閉じる' : '詳細を見る'}
          {expanded ? <FaChevronUp /> : <FaChevronDown />}
        </button>
      )}

      {expanded && (
        <div className="achievement-week-details">
          {(achievement.skill_analysis.domain_skills.length > 0 ||
            achievement.skill_analysis.soft_skills.length > 0 ||
            achievement.skill_analysis.work_types.length > 0) && (
            <div className="achievement-section">
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
          )}

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

          <div className="achievement-section">
            <h3>
              <FaCalendarAlt className="section-icon" />
              対象タスク
            </h3>
            {taskSnapshots.length === 0 ? (
              <p className="empty-hint">対象タスクはありません</p>
            ) : (
              <>
                <button
                  className="toggle-task-list"
                  onClick={() => setShowTasks(!showTasks)}
                >
                  <FaCalendarAlt />
                  対象タスク一覧を{showTasks ? '隠す' : '見る'} ({taskSnapshots.length}件)
                  {showTasks ? <FaChevronUp /> : <FaChevronDown />}
                </button>

                {showTasks && (
                  <ul className="task-preview-list achievement-task-list">
                    {taskSnapshots.map((task) => (
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AchievementPage() {
  const queryClient = useQueryClient();
  const timezone = useTimezone();
  const now = nowInTimezone(timezone);
  const { weekStart, weekEnd } = getLatestWeekPeriod(now);
  const [showPreviewTasks, setShowPreviewTasks] = useState(false);

  const { data: achievementsData, isLoading: isLoadingAchievements } = useQuery({
    queryKey: ['achievements', 'weekly'],
    queryFn: () => achievementsApi.list({ limit: 20 }),
  });

  const achievements = achievementsData?.achievements ?? [];
  const hasLatestWeekAchievement = useMemo(
    () => achievements.some((achievement) => isSamePeriod(achievement, weekStart, weekEnd, timezone)),
    [achievements, weekStart, weekEnd, timezone]
  );

  const previewEnabled = !isLoadingAchievements && !hasLatestWeekAchievement;
  const previewStartIso = weekStart.toUTC().toISO() ?? '';
  const previewEndIso = weekEnd.toUTC().toISO() ?? '';
  const weekLabel = `週次振り返り (${formatPeriodLabel(
    weekStart.toJSDate(),
    weekEnd.toJSDate(),
    timezone
  )})`;

  const { data: previewData, isLoading: isLoadingPreview } = useQuery({
    queryKey: ['achievement-preview', previewStartIso, previewEndIso],
    queryFn: () => achievementsApi.previewCompletedTasks(previewStartIso, previewEndIso),
    enabled: previewEnabled && !!previewStartIso && !!previewEndIso,
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      achievementsApi.create({
        period_start: previewStartIso,
        period_end: previewEndIso,
        period_label: weekLabel,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['achievements'] });
      setShowPreviewTasks(false);
    },
  });

  return (
    <div className="achievement-page">
      <div className="page-header">
        <div className="header-left">
          <FaTrophy className="page-icon" />
          <h2 className="page-title">Achievement</h2>
        </div>
      </div>

      <div className="weekly-generator">
        <div className="weekly-generator-header">
          <div>
            <div className="weekly-generator-title">最新の週次</div>
            <div className="weekly-generator-range">{weekLabel}</div>
          </div>
          <div className="weekly-generator-tag">金曜締め</div>
        </div>

        {isLoadingAchievements || (previewEnabled && isLoadingPreview) ? (
          <div className="loading-state">
            <FaSpinner className="spinner" />
            読み込み中...
          </div>
        ) : hasLatestWeekAchievement ? (
          <div className="weekly-generator-status">
            週次の達成項目は生成済みです
          </div>
        ) : previewData && previewData.task_count > 0 ? (
          <div className="weekly-generator-body">
            <div className="preview-stats compact">
              <div className="stat-card">
                <div className="stat-icon completed">
                  <FaCheckCircle />
                </div>
                <div className="stat-info">
                  <div className="stat-value">{previewData.task_count}</div>
                  <div className="stat-label">完了タスク</div>
                </div>
              </div>
            </div>

            <div className="weekly-generator-actions">
              <button
                className="generate-btn"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || !previewStartIso || !previewEndIso}
              >
                {generateMutation.isPending ? (
                  <>
                    <FaSpinner className="spinner" />
                    生成中...
                  </>
                ) : (
                  <>
                    <FaRocket />
                    週次を生成
                  </>
                )}
              </button>
            </div>

            <div className="task-preview-section">
              <button
                className="toggle-task-list"
                onClick={() => setShowPreviewTasks(!showPreviewTasks)}
              >
                <FaCalendarAlt />
                対象タスク一覧を{showPreviewTasks ? '隠す' : '見る'}
                {showPreviewTasks ? <FaChevronUp /> : <FaChevronDown />}
              </button>

              {showPreviewTasks && (
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
          </div>
        ) : (
          <div className="weekly-generator-status">
            対象期間に完了タスクがありません
          </div>
        )}
      </div>

      {isLoadingAchievements ? (
        <div className="loading-state">
          <FaSpinner className="spinner" />
          読み込み中...
        </div>
      ) : achievements.length === 0 ? (
        <div className="empty-state">
          <FaTrophy className="empty-icon" />
          <p>まだ達成項目がありません</p>
          <p className="empty-hint">週次の達成項目が生成されるとここに表示されます</p>
        </div>
      ) : (
        <div className="achievement-list">
          {achievements.map((achievement) => (
            <AchievementCard key={achievement.id} achievement={achievement} />
          ))}
        </div>
      )}
    </div>
  );
}
