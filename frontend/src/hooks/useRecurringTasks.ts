import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recurringTasksApi } from '../api/recurringTasks';
import type { RecurringTaskCreate, RecurringTaskUpdate } from '../api/types';

const QUERY_KEY = ['recurring-tasks'];

export function useRecurringTasks(projectId?: string, includeInactive = false) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const query = useQuery({
    queryKey: [...QUERY_KEY, projectId, includeInactive],
    queryFn: () => recurringTasksApi.list({ projectId, includeInactive }),
  });

  const createMutation = useMutation({
    mutationFn: (data: RecurringTaskCreate) => recurringTasksApi.create(data),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RecurringTaskUpdate }) =>
      recurringTasksApi.update(id, data),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => recurringTasksApi.delete(id),
    onSuccess: invalidate,
  });

  const generateMutation = useMutation({
    mutationFn: (id: string) => recurringTasksApi.generateTasks(id),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const deleteGeneratedTasksMutation = useMutation({
    mutationFn: (id: string) => recurringTasksApi.deleteGeneratedTasks(id),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  return {
    recurringTasks: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createRecurringTask: createMutation.mutateAsync,
    updateRecurringTask: updateMutation.mutateAsync,
    deleteRecurringTask: deleteMutation.mutateAsync,
    generateTasks: generateMutation.mutateAsync,
    deleteGeneratedTasks: deleteGeneratedTasksMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isDeletingGenerated: deleteGeneratedTasksMutation.isPending,
  };
}
