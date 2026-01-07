import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '../api/tasks';
import type { TaskCreate, TaskUpdate } from '../api/types';

export function useTasks(projectId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: projectId ? ['tasks', 'project', projectId] : ['tasks'],
    queryFn: async () => {
      const allTasks = await tasksApi.getAll();
      // Filter by project_id if provided
      if (projectId) {
        return allTasks.filter(task => task.project_id === projectId);
      }
      return allTasks;
    },
  });

  const createMutation = useMutation({
    mutationFn: tasksApi.create,
    onSuccess: () => {
      // Invalidate all task related queries
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
      queryClient.invalidateQueries({ queryKey: ['top3'] });
      queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskUpdate }) =>
      tasksApi.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      await queryClient.cancelQueries({ queryKey: ['today-tasks'] });
      await queryClient.cancelQueries({ queryKey: ['subtasks'] });

      // Snapshot the previous values
      const previousTasks = queryClient.getQueryData(['tasks']);
      const previousSubtasks = queryClient.getQueryData(['subtasks']);

      // Optimistically update tasks
      queryClient.setQueryData(['tasks'], (old: any) => {
        if (!old) return old;
        return old.map((t: any) => (t.id === id ? { ...t, ...data } : t));
      });

      // Optimistically update subtasks
      queryClient.setQueryData(['subtasks'], (old: any) => {
        if (!old) return old;
        return old.map((t: any) => (t.id === id ? { ...t, ...data } : t));
      });

      return { previousTasks, previousSubtasks };
    },
    onError: (err, newTodo, context) => {
      // Rollback
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks'], context.previousTasks);
      }
      if (context?.previousSubtasks) {
        queryClient.setQueryData(['subtasks'], context.previousSubtasks);
      }
    },
    onSuccess: () => {
      // Final synchronization
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
      queryClient.invalidateQueries({ queryKey: ['top3'] });
      queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: tasksApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
      queryClient.invalidateQueries({ queryKey: ['top3'] });
      queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createTask: (data: TaskCreate) => createMutation.mutate(data),
    updateTask: (id: string, data: TaskUpdate) =>
      updateMutation.mutate({ id, data }),
    deleteTask: (id: string) => deleteMutation.mutate(id),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
