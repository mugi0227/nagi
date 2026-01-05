import type { Task } from '../api/types';

/**
 * Get the order of a task within its parent.
 * Uses the order_in_parent field. Returns Infinity if not set (to sort to the end).
 */
export function getTaskOrder(task: Task): number {
  return task.order_in_parent ?? Infinity;
}

/**
 * Sort tasks by their order_in_parent field.
 * Tasks without order_in_parent are sorted to the end.
 */
export function sortTasksByStepNumber(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aOrder = getTaskOrder(a);
    const bOrder = getTaskOrder(b);
    return aOrder - bOrder;
  });
}
