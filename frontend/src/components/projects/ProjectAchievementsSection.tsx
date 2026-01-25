import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTrophy, FaPlus, FaChevronDown, FaChevronUp, FaUsers, FaLightbulb, FaTriangleExclamation, FaBookOpen, FaTrash } from 'react-icons/fa6';
import { projectAchievementsApi } from '../../api/projectAchievements';
import type { ProjectAchievement, MemberContribution } from '../../api/types';
import { formatDate, todayInTimezone } from '../../utils/dateTime';
import { useTimezone } from '../../hooks/useTimezone';
import './ProjectAchievementsSection.css';

interface ProjectAchievementsSectionProps {
  projectId: string;
}

function MemberContributionCard({ contribution }: { contribution: MemberContribution }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="member-contribution">
      <div
        className="member-contribution-header"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
      >
        <div className="member-info">
          <span className="member-name">{contribution.display_name}</span>
          <span className="task-count">{contribution.task_count}件完了</span>
        </div>
        {contribution.task_titles.length > 0 && (
          <button className="expand-btn">
            {expanded ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        )}
      </div>
      {contribution.main_areas.length > 0 && (
        <div className="member-areas">
          {contribution.main_areas.map((area, i) => (
            <span key={i} className="area-tag">{area}</span>
          ))}
        </div>
      )}
      <AnimatePresence>
        {expanded && contribution.task_titles.length > 0 && (
          <motion.div
            className="member-tasks"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ul>
              {contribution.task_titles.map((title, i) => (
                <li key={i}>{title}</li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AchievementCard({
  achievement,
  onDelete,
  isDeleting,
}: {
  achievement: ProjectAchievement;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const timezone = useTimezone();
  const [expanded, setExpanded] = useState(false);

  const formatPeriod = () => {
    const start = formatDate(achievement.period_start, { month: 'numeric', day: 'numeric' }, timezone);
    const end = formatDate(achievement.period_end, { month: 'numeric', day: 'numeric' }, timezone);
    return `${start} - ${end}`;
  };

  return (
    <div className="achievement-card">
      <div className="achievement-header">
        <div className="achievement-meta">
          <span className="achievement-period">{achievement.period_label || formatPeriod()}</span>
          <span className={`generation-type ${achievement.generation_type.toLowerCase()}`}>
            {achievement.generation_type === 'AUTO' ? '自動生成' : '手動生成'}
          </span>
        </div>
        <button
          className="delete-btn"
          onClick={onDelete}
          disabled={isDeleting}
          title="削除"
        >
          <FaTrash />
        </button>
      </div>

      <div className="achievement-summary">
        <p>{achievement.summary}</p>
      </div>

      <div className="achievement-stats">
        <div className="stat">
          <span className="stat-value">{achievement.total_task_count}</span>
          <span className="stat-label">完了タスク</span>
        </div>
        <div className="stat">
          <span className="stat-value">{achievement.remaining_tasks_count}</span>
          <span className="stat-label">残タスク</span>
        </div>
        <div className="stat">
          <span className="stat-value">{achievement.member_contributions.length}</span>
          <span className="stat-label">貢献メンバー</span>
        </div>
      </div>

      <button
        className="expand-details-btn"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? '詳細を閉じる' : '詳細を見る'}
        {expanded ? <FaChevronUp /> : <FaChevronDown />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="achievement-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Team Highlights */}
            {achievement.team_highlights.length > 0 && (
              <div className="detail-section">
                <h4><FaTrophy className="section-icon highlight" /> チームのハイライト</h4>
                <ul>
                  {achievement.team_highlights.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Challenges */}
            {achievement.challenges.length > 0 && (
              <div className="detail-section">
                <h4><FaTriangleExclamation className="section-icon challenge" /> 直面した課題</h4>
                <ul>
                  {achievement.challenges.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Learnings */}
            {achievement.learnings.length > 0 && (
              <div className="detail-section">
                <h4><FaLightbulb className="section-icon learning" /> 学び</h4>
                <ul>
                  {achievement.learnings.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Open Issues */}
            {achievement.open_issues.length > 0 && (
              <div className="detail-section">
                <h4><FaBookOpen className="section-icon issue" /> 未解決の課題</h4>
                <ul>
                  {achievement.open_issues.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Member Contributions */}
            {achievement.member_contributions.length > 0 && (
              <div className="detail-section">
                <h4><FaUsers className="section-icon members" /> メンバー貢献</h4>
                <div className="member-contributions">
                  {achievement.member_contributions.map((mc, i) => (
                    <MemberContributionCard key={i} contribution={mc} />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ProjectAchievementsSection({ projectId }: ProjectAchievementsSectionProps) {
  const queryClient = useQueryClient();
  const timezone = useTimezone();
  const [showGenerator, setShowGenerator] = useState(false);
  const [periodStart, setPeriodStart] = useState(() => {
    return todayInTimezone(timezone).minus({ days: 7 }).toISODate() ?? '';
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    return todayInTimezone(timezone).toISODate() ?? '';
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['project-achievements', projectId],
    queryFn: () => projectAchievementsApi.list(projectId, { limit: 10 }),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      projectAchievementsApi.create(projectId, {
        period_start: new Date(periodStart).toISOString(),
        period_end: new Date(periodEnd).toISOString(),
        period_label: `${periodStart} - ${periodEnd}`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-achievements', projectId] });
      setShowGenerator(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (achievementId: string) =>
      projectAchievementsApi.delete(projectId, achievementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-achievements', projectId] });
    },
  });

  const achievements = data?.achievements ?? [];

  return (
    <div className="project-achievements-section">
      <div className="section-header">
        <div className="header-title">
          <FaTrophy className="section-icon" />
          <h3>達成項目</h3>
        </div>
        <button
          className="generate-btn"
          onClick={() => setShowGenerator(!showGenerator)}
        >
          <FaPlus />
          <span>生成</span>
        </button>
      </div>

      <AnimatePresence>
        {showGenerator && (
          <motion.div
            className="achievement-generator"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="generator-form">
              <div className="period-inputs">
                <label>
                  <span>開始日</span>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </label>
                <label>
                  <span>終了日</span>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </label>
              </div>
              <div className="generator-actions">
                <button
                  className="cancel-btn"
                  onClick={() => setShowGenerator(false)}
                  disabled={generateMutation.isPending}
                >
                  キャンセル
                </button>
                <button
                  className="submit-btn"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending || !periodStart || !periodEnd}
                >
                  {generateMutation.isPending ? '生成中...' : '達成項目を生成'}
                </button>
              </div>
              {generateMutation.isError && (
                <div className="generator-error">
                  生成に失敗しました。期間内に完了タスクがあることを確認してください。
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="achievements-list">
        {isLoading ? (
          <div className="loading-state">読み込み中...</div>
        ) : error ? (
          <div className="error-state">達成項目の取得に失敗しました</div>
        ) : achievements.length === 0 ? (
          <div className="empty-state">
            <FaTrophy className="empty-icon" />
            <p>まだ達成項目がありません</p>
            <p className="empty-hint">「生成」ボタンから期間を指定して生成できます</p>
          </div>
        ) : (
          achievements.map((achievement) => (
            <AchievementCard
              key={achievement.id}
              achievement={achievement}
              onDelete={() => deleteMutation.mutate(achievement.id)}
              isDeleting={deleteMutation.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}
