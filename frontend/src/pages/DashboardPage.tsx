import { useState } from 'react';
import { motion } from 'framer-motion';
import { AgentCard } from '../components/dashboard/AgentCard';
import { DailyBriefingCard } from '../components/dashboard/DailyBriefingCard';
import { TodayTasksCard } from '../components/dashboard/TodayTasksCard';
import { ScheduleOverviewCard } from '../components/dashboard/ScheduleOverviewCard';
import { WeeklyMeetingsCard } from '../components/dashboard/WeeklyMeetingsCard';
import { WeeklyProgress } from '../components/dashboard/WeeklyProgress';
import './DashboardPage.css';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 24
    }
  }
};

export function DashboardPage() {
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);

  return (
    <motion.div
      className="dashboard-page"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        variants={itemVariants}
      >
        <AgentCard onOpenDailyBriefing={() => setIsBriefingOpen(true)} />
      </motion.div>

      <div className="dashboard-grid">
        <motion.div
          variants={itemVariants}
          className="grid-main"
        >
          <TodayTasksCard />
          <ScheduleOverviewCard />
          <WeeklyMeetingsCard />
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="grid-side"
        >
          <WeeklyProgress />
        </motion.div>
      </div>

      {isBriefingOpen && (
        <div className="daily-briefing-modal" role="dialog" aria-modal="true">
          <div
            className="daily-briefing-backdrop"
            onClick={() => setIsBriefingOpen(false)}
          />
          <div className="daily-briefing-panel">
            <button
              type="button"
              className="daily-briefing-close"
              onClick={() => setIsBriefingOpen(false)}
              aria-label="Close"
            >
              X
            </button>
            <DailyBriefingCard onFinish={() => setIsBriefingOpen(false)} />
          </div>
        </div>
      )}
    </motion.div>
  );
}
