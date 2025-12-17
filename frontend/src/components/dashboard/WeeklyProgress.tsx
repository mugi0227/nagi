import { useWeeklyProgress } from '../../hooks/useWeeklyProgress';
import './WeeklyProgress.css';

export function WeeklyProgress() {
  const { weekData, totalDone, totalPending } = useWeeklyProgress();

  return (
    <div className="stats-card">
      <h3>Weekly Progress</h3>
      <div className="progress-chart-mock">
        {weekData.map((item, index) => (
          <div
            key={index}
            className={`bar ${item.active ? 'active' : ''}`}
            style={{ height: `${item.height}%` }}
            title={`${item.day}: ${item.completedCount}件完了`}
          >
            <span className="bar-label">{item.day}</span>
          </div>
        ))}
      </div>
      <div className="stats-summary">
        <div className="stat-item">
          <span className="stat-value">{totalDone}</span>
          <span className="stat-label">Done</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{totalPending}</span>
          <span className="stat-label">Pending</span>
        </div>
      </div>
    </div>
  );
}
