import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { tasksApi } from '../api/tasks';
import type { Task, TaskUpdate } from '../api/types';
import { AgentCard } from '../components/dashboard/AgentCard';
import { DailyBriefingCard } from '../components/dashboard/DailyBriefingCard';
import { TodayTasksCard } from '../components/dashboard/TodayTasksCard';
import { ScheduleOverviewCard } from '../components/dashboard/ScheduleOverviewCard';
import { WeeklyMeetingsCard } from '../components/dashboard/WeeklyMeetingsCard';
import { WeeklyProgress } from '../components/dashboard/WeeklyProgress';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { useTasks } from '../hooks/useTasks';
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
  const { tasks, updateTask, deleteTask, refetch: refetchTasks } = useTasks();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [openedParentTask, setOpenedParentTask] = useState<Task | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);

  const handleTaskClick = (task: Task) => {
    if (task.parent_id) {
      const parent = tasks.find(t => t.id === task.parent_id);
      if (parent) {
        setOpenedParentTask(parent);
        setSelectedTask(task);
      } else {
        setSelectedTask(task);
        setOpenedParentTask(null);
      }
    } else {
      setSelectedTask(task);
      setOpenedParentTask(null);
    }
  };

  const handleScheduleTaskClick = async (taskId: string) => {
    const task = tasks.find(item => item.id === taskId);
    if (task) {
      handleTaskClick(task);
      return;
    }
    const fetched = await tasksApi.getById(taskId).catch(() => null);
    if (fetched) {
      handleTaskClick(fetched);
    }
  };

  const handleEditTask = (task: Task) => {
    setSelectedTask(null);
    setOpenedParentTask(null);
    setTaskToEdit(task);
  };

  const handleDeleteTask = async (task: Task) => {
    if (window.confirm(`${task.title} を削除してもよろしいですか？`)) {
      await deleteTask(task.id);
      setSelectedTask(null);
      setOpenedParentTask(null);
      refetchTasks();
    }
  };

  const handleCloseForm = () => {
    setTaskToEdit(null);
  };

  const handleSubmitForm = async (data: TaskUpdate) => {
    if (taskToEdit) {
      await updateTask(taskToEdit.id, data);
      refetchTasks();
    }
    handleCloseForm();
  };

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
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="grid-side"
        >
          <WeeklyProgress />
        </motion.div>
      </div>

      <motion.div
        variants={itemVariants}
        className="dashboard-bottom-section"
      >
        <ScheduleOverviewCard onTaskClick={handleScheduleTaskClick} />
        <WeeklyMeetingsCard />
      </motion.div>

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

      {selectedTask && (
        <TaskDetailModal
          task={openedParentTask || selectedTask}
          subtasks={tasks.filter(t => t.parent_id === (openedParentTask?.id || selectedTask.id))}
          allTasks={tasks}
          initialSubtask={openedParentTask ? selectedTask : null}
          onClose={() => {
            setSelectedTask(null);
            setOpenedParentTask(null);
          }}
          onEdit={handleEditTask}
          onDelete={handleDeleteTask}
          onProgressChange={(taskId, progress) => {
            updateTask(taskId, { progress });
          }}
          onActionItemsCreated={refetchTasks}
        />
      )}

      <AnimatePresence>
        {taskToEdit && (
          <TaskFormModal
            task={taskToEdit}
            allTasks={tasks}
            onClose={handleCloseForm}
            onSubmit={handleSubmitForm}
            isSubmitting={false}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
