/**
 * MeetingCompleted - Post-meeting summary and task creation component
 *
 * Shows transcript analysis, summary, decisions, and next actions.
 * Supports inline editing of summary sections and assignee selection for task creation.
 */

import { useState, useCallback, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
    FaClipboardList,
    FaMagic,
    FaCheckCircle,
    FaLightbulb,
    FaTasks,
    FaPlus,
    FaUser,
    FaCalendar,
    FaExclamationTriangle,
    FaFlag,
    FaSave,
    FaEdit,
    FaTimes,
    FaRedo,
    FaTrash,
    FaClock,
    FaBolt,
    FaSyncAlt,
    FaSitemap,
    FaLink,
} from 'react-icons/fa';
import { meetingSessionApi } from '../../api/meetingSession';
import type { MeetingSession, MeetingSummary, NextAction, ActionType } from '../../types/session';
import './MeetingCompleted.css';

// Parse saved summary from session (stored as JSON string)
function parseSavedSummary(summaryJson: string | null): MeetingSummary | null {
    if (!summaryJson) return null;
    try {
        return JSON.parse(summaryJson) as MeetingSummary;
    } catch {
        return null;
    }
}

interface MemberOption {
    id: string;
    label: string;
}

interface MeetingCompletedProps {
    session: MeetingSession;
    projectId: string;
    memberOptions?: MemberOption[];
    onTasksCreated?: () => void;
}

export function MeetingCompleted({ session, projectId, memberOptions = [], onTasksCreated }: MeetingCompletedProps) {
    const [transcript, setTranscript] = useState(session.transcript || '');
    const [savedTranscript, setSavedTranscript] = useState(session.transcript || '');
    const [isEditing, setIsEditing] = useState(!session.transcript);

    // Summary state
    const initialSummary = useMemo(() => parseSavedSummary(session.summary), [session.summary]);
    const [summary, setSummary] = useState<MeetingSummary | null>(initialSummary);

    // Inline editing state for summary
    const [editingSummary, setEditingSummary] = useState(false);
    const [editSummaryData, setEditSummaryData] = useState<MeetingSummary | null>(null);

    // Converted actions tracking
    const initialConvertedActions = useMemo(() => {
        return new Set<number>(initialSummary?.converted_action_indices || []);
    }, [initialSummary]);
    const [convertedActions, setConvertedActions] = useState<Set<number>>(initialConvertedActions);

    // Selected actions for task creation
    const initialSelectedActions = useMemo(() => {
        if (initialSummary?.next_actions) {
            return new Set(
                initialSummary.next_actions
                    .map((_, i) => i)
                    .filter((i) => !initialConvertedActions.has(i))
            );
        }
        return new Set<number>();
    }, [initialSummary, initialConvertedActions]);
    const [selectedActions, setSelectedActions] = useState<Set<number>>(initialSelectedActions);

    // Assignee mapping: action index → assignee_id
    const [actionAssignees, setActionAssignees] = useState<Record<number, string>>({});

    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Save summary mutation
    const saveSummaryMutation = useMutation({
        mutationFn: async (summaryData: MeetingSummary) => {
            return meetingSessionApi.update(session.id, {
                summary: JSON.stringify(summaryData)
            });
        },
        onSuccess: () => {
            setSuccessMessage('分析結果を保存しました。');
        },
        onError: (error) => {
            console.error('Failed to save summary:', error);
        },
    });

    // Analyze transcript mutation
    const analyzeMutation = useMutation({
        mutationFn: async () => {
            return meetingSessionApi.analyzeTranscript(session.id, {
                transcript,
                project_id: projectId,
            });
        },
        onSuccess: (data) => {
            setSummary(data);
            setSelectedActions(new Set(data.next_actions.map((_, i) => i)));
            setErrorMessage(null);
            saveSummaryMutation.mutate(data);
        },
        onError: (error) => {
            setErrorMessage('トランスクリプトの分析に失敗しました。');
            console.error('Failed to analyze transcript:', error);
        },
    });

    // Apply actions mutation (create/update/add_subtask)
    const applyActionsMutation = useMutation({
        mutationFn: async (actionIndices: number[]) => {
            if (!summary) throw new Error('No summary available');
            const actions: NextAction[] = actionIndices.map((i) => {
                const action = summary.next_actions[i];
                const assigneeId = actionAssignees[i];
                return {
                    ...action,
                    assignee_id: assigneeId || action.assignee_id,
                };
            });
            return meetingSessionApi.applyActions(session.id, {
                project_id: projectId,
                actions,
            }).then((result) => ({ ...result, actionIndices }));
        },
        onSuccess: (data) => {
            const messages: string[] = [];
            if (data.created_count > 0) messages.push(`${data.created_count}件作成`);
            if (data.updated_count > 0) messages.push(`${data.updated_count}件更新`);
            if (data.subtask_count > 0) messages.push(`${data.subtask_count}件サブタスク追加`);
            setSuccessMessage(`${messages.join('、')}しました。`);

            const newConvertedActions = new Set(convertedActions);
            data.actionIndices.forEach((i: number) => newConvertedActions.add(i));
            setConvertedActions(newConvertedActions);

            if (summary) {
                const updatedSummary = {
                    ...summary,
                    converted_action_indices: Array.from(newConvertedActions),
                };
                setSummary(updatedSummary);
                saveSummaryMutation.mutate(updatedSummary);
            }

            setSelectedActions(new Set());
            setActionAssignees({});
            onTasksCreated?.();
        },
        onError: (error) => {
            setErrorMessage('アクションの適用に失敗しました。');
            console.error('Failed to apply actions:', error);
        },
    });

    // Save transcript mutation
    const saveTranscriptMutation = useMutation({
        mutationFn: async () => {
            return meetingSessionApi.update(session.id, { transcript });
        },
        onSuccess: () => {
            setSavedTranscript(transcript);
            setSuccessMessage('議事録を保存しました。');
            setErrorMessage(null);
            setIsEditing(false);
        },
        onError: (error) => {
            setErrorMessage('議事録の保存に失敗しました。');
            console.error('Failed to save transcript:', error);
        },
    });

    // Delete transcript mutation
    const deleteTranscriptMutation = useMutation({
        mutationFn: async () => {
            return meetingSessionApi.update(session.id, { transcript: '' });
        },
        onSuccess: () => {
            setTranscript('');
            setSavedTranscript('');
            setSuccessMessage('議事録を削除しました。');
            setErrorMessage(null);
            setIsEditing(true);
        },
        onError: (error) => {
            setErrorMessage('議事録の削除に失敗しました。');
            console.error('Failed to delete transcript:', error);
        },
    });

    // Delete summary mutation
    const deleteSummaryMutation = useMutation({
        mutationFn: async () => {
            return meetingSessionApi.update(session.id, { summary: '' });
        },
        onSuccess: () => {
            setSummary(null);
            setConvertedActions(new Set());
            setSelectedActions(new Set());
            setEditingSummary(false);
            setEditSummaryData(null);
            setSuccessMessage('サマリーを削除しました。');
            setErrorMessage(null);
        },
        onError: (error) => {
            setErrorMessage('サマリーの削除に失敗しました。');
            console.error('Failed to delete summary:', error);
        },
    });

    const handleAnalyze = useCallback(() => {
        if (!transcript.trim()) return;
        analyzeMutation.mutate();
    }, [transcript, analyzeMutation]);

    const handleSaveTranscript = useCallback(() => {
        saveTranscriptMutation.mutate();
    }, [saveTranscriptMutation]);

    const handleCancelEdit = useCallback(() => {
        setTranscript(savedTranscript);
        setIsEditing(false);
    }, [savedTranscript]);

    const handleStartEdit = useCallback(() => {
        setIsEditing(true);
    }, []);

    const handleDeleteTranscript = useCallback(() => {
        if (!window.confirm('議事録を削除しますか？この操作は元に戻せません。')) return;
        deleteTranscriptMutation.mutate();
    }, [deleteTranscriptMutation]);

    const handleDeleteSummary = useCallback(() => {
        if (!window.confirm('サマリーを削除しますか？この操作は元に戻せません。')) return;
        deleteSummaryMutation.mutate();
    }, [deleteSummaryMutation]);

    // Inline summary editing handlers
    const handleStartSummaryEdit = useCallback(() => {
        if (summary) {
            setEditSummaryData(JSON.parse(JSON.stringify(summary)));
            setEditingSummary(true);
        }
    }, [summary]);

    const handleCancelSummaryEdit = useCallback(() => {
        setEditingSummary(false);
        setEditSummaryData(null);
    }, []);

    const handleSaveSummaryEdit = useCallback(() => {
        if (!editSummaryData) return;
        setSummary(editSummaryData);
        saveSummaryMutation.mutate(editSummaryData);
        setEditingSummary(false);
        setEditSummaryData(null);
    }, [editSummaryData, saveSummaryMutation]);

    const handleToggleAction = useCallback((index: number) => {
        setSelectedActions((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    }, []);

    const handleAssigneeChange = useCallback((index: number, assigneeId: string) => {
        setActionAssignees((prev) => ({
            ...prev,
            [index]: assigneeId,
        }));
    }, []);

    const handleApplyActions = useCallback(() => {
        if (!summary || selectedActions.size === 0) return;
        const indicesToApply = Array.from(selectedActions);
        applyActionsMutation.mutate(indicesToApply);
    }, [summary, selectedActions, applyActionsMutation]);

    const getPriorityClass = (priority: string) => {
        switch (priority) {
            case 'HIGH': return 'priority-high';
            case 'MEDIUM': return 'priority-medium';
            case 'LOW': return 'priority-low';
            default: return '';
        }
    };

    const getPriorityLabel = (priority: string) => {
        switch (priority) {
            case 'HIGH': return '高';
            case 'MEDIUM': return '中';
            case 'LOW': return '低';
            default: return priority;
        }
    };

    const getEnergyLabel = (level?: string) => {
        switch (level) {
            case 'HIGH': return '重';
            case 'MEDIUM': return '中';
            case 'LOW': return '軽';
            default: return null;
        }
    };

    const getActionTypeBadge = (actionType?: ActionType) => {
        switch (actionType) {
            case 'update':
                return (
                    <span className="action-type-badge action-type-update">
                        <FaSyncAlt /> 既存更新
                    </span>
                );
            case 'add_subtask':
                return (
                    <span className="action-type-badge action-type-subtask">
                        <FaSitemap /> サブタスク追加
                    </span>
                );
            default:
                return (
                    <span className="action-type-badge action-type-create">
                        <FaPlus /> 新規作成
                    </span>
                );
        }
    };

    // Build apply button label
    const getApplyButtonLabel = () => {
        if (applyActionsMutation.isPending) return '適用中...';
        if (!summary || selectedActions.size === 0) return '適用 (0件)';

        const selected = Array.from(selectedActions).map(
            (i) => summary.next_actions[i]
        );
        const creates = selected.filter((a) => !a.action_type || a.action_type === 'create').length;
        const updates = selected.filter((a) => a.action_type === 'update').length;
        const subtasks = selected.filter((a) => a.action_type === 'add_subtask').length;

        const parts: string[] = [];
        if (creates > 0) parts.push(`作成${creates}`);
        if (updates > 0) parts.push(`更新${updates}`);
        if (subtasks > 0) parts.push(`サブタスク${subtasks}`);

        return `適用 (${parts.join('/')})`;
    };

    // Get display summary (editing version if in edit mode)
    const displaySummary = editingSummary ? editSummaryData : summary;

    return (
        <div className="meeting-completed">
            {/* Success/Error Messages */}
            {successMessage && (
                <div className="success-message">
                    <FaCheckCircle />
                    <span>{successMessage}</span>
                </div>
            )}
            {errorMessage && (
                <div className="error-message">
                    <FaExclamationTriangle />
                    <span>{errorMessage}</span>
                </div>
            )}

            {/* Transcript Input Section */}
            <div className="transcript-input-section">
                <div className="transcript-header">
                    <h4>
                        <FaClipboardList />
                        議事録・トランスクリプト
                    </h4>
                    <div className="transcript-header-actions">
                        {!isEditing && transcript && (
                            <>
                                <button className="edit-btn" onClick={handleStartEdit} title="編集">
                                    <FaEdit />
                                </button>
                                <button
                                    className="delete-btn"
                                    onClick={handleDeleteTranscript}
                                    disabled={deleteTranscriptMutation.isPending}
                                    title="削除"
                                >
                                    <FaTrash />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {isEditing ? (
                    <>
                        <textarea
                            className="transcript-textarea"
                            value={transcript}
                            onChange={(e) => setTranscript(e.target.value)}
                            placeholder="会議の議事録やトランスクリプトをここに貼り付けてください..."
                        />
                        <div className="transcript-actions">
                            {transcript !== '' && (
                                <button
                                    className="cancel-btn"
                                    onClick={handleCancelEdit}
                                    disabled={saveTranscriptMutation.isPending}
                                >
                                    <FaTimes />
                                    キャンセル
                                </button>
                            )}
                            <button
                                className={`save-btn ${saveTranscriptMutation.isPending ? 'loading' : ''}`}
                                onClick={handleSaveTranscript}
                                disabled={!transcript.trim() || saveTranscriptMutation.isPending}
                            >
                                <FaSave />
                                {saveTranscriptMutation.isPending ? '保存中...' : '保存'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {transcript ? (
                            <div className="existing-transcript">
                                <pre>{transcript}</pre>
                            </div>
                        ) : (
                            <div className="empty-transcript">
                                <p>議事録がまだありません。</p>
                            </div>
                        )}
                    </>
                )}

                {/* Analyze button */}
                {!isEditing && transcript && (
                    <div className="transcript-actions">
                        <button
                            className={`analyze-btn ${summary ? 'reanalyze' : ''} ${analyzeMutation.isPending ? 'loading' : ''}`}
                            onClick={handleAnalyze}
                            disabled={analyzeMutation.isPending}
                        >
                            {summary ? <FaRedo /> : <FaMagic />}
                            {analyzeMutation.isPending ? '分析中...' : summary ? '再分析' : 'AIで分析'}
                        </button>
                    </div>
                )}
            </div>

            {/* Summary Section */}
            {displaySummary && (
                <>
                    <div className="summary-section">
                        <div className="summary-header">
                            <h4>
                                <FaLightbulb />
                                会議サマリー
                            </h4>
                            <div className="summary-header-actions">
                                {!editingSummary ? (
                                    <>
                                        <button
                                            className="summary-edit-btn"
                                            onClick={handleStartSummaryEdit}
                                            title="サマリーを編集"
                                        >
                                            <FaEdit /> 編集
                                        </button>
                                        <button
                                            className="delete-summary-btn"
                                            onClick={handleDeleteSummary}
                                            disabled={deleteSummaryMutation.isPending}
                                            title="サマリーを削除"
                                        >
                                            <FaTrash /> 削除
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            className="summary-save-btn"
                                            onClick={handleSaveSummaryEdit}
                                            disabled={saveSummaryMutation.isPending}
                                        >
                                            <FaSave /> 保存
                                        </button>
                                        <button
                                            className="summary-cancel-btn"
                                            onClick={handleCancelSummaryEdit}
                                        >
                                            <FaTimes /> キャンセル
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Overall Summary */}
                        <div className="overall-summary">
                            {editingSummary && editSummaryData ? (
                                <textarea
                                    className="summary-inline-textarea"
                                    value={editSummaryData.overall_summary}
                                    onChange={(e) =>
                                        setEditSummaryData({
                                            ...editSummaryData,
                                            overall_summary: e.target.value,
                                        })
                                    }
                                    rows={3}
                                />
                            ) : (
                                <p>{displaySummary.overall_summary}</p>
                            )}
                        </div>

                        {/* Agenda Discussions */}
                        {displaySummary.agenda_discussions.length > 0 && (
                            <div className="agenda-discussions">
                                {displaySummary.agenda_discussions.map((disc, index) => (
                                    <div key={index} className="discussion-item">
                                        {editingSummary && editSummaryData ? (
                                            <>
                                                <input
                                                    className="summary-inline-input"
                                                    value={editSummaryData.agenda_discussions[index]?.agenda_title || ''}
                                                    onChange={(e) => {
                                                        const updated = [...editSummaryData.agenda_discussions];
                                                        updated[index] = { ...updated[index], agenda_title: e.target.value };
                                                        setEditSummaryData({ ...editSummaryData, agenda_discussions: updated });
                                                    }}
                                                    placeholder="アジェンダタイトル"
                                                />
                                                <textarea
                                                    className="summary-inline-textarea small"
                                                    value={editSummaryData.agenda_discussions[index]?.summary || ''}
                                                    onChange={(e) => {
                                                        const updated = [...editSummaryData.agenda_discussions];
                                                        updated[index] = { ...updated[index], summary: e.target.value };
                                                        setEditSummaryData({ ...editSummaryData, agenda_discussions: updated });
                                                    }}
                                                    rows={2}
                                                    placeholder="議論の要約"
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <h5>{disc.agenda_title}</h5>
                                                <p>{disc.summary}</p>
                                                {disc.key_points.length > 0 && (
                                                    <div className="key-points">
                                                        {disc.key_points.map((point, i) => (
                                                            <span key={i}>{point}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Decisions Section */}
                    {displaySummary.decisions.length > 0 && (
                        <div className="decisions-section">
                            <h4>
                                <FaCheckCircle />
                                決定事項
                            </h4>
                            <div className="decisions-list">
                                {displaySummary.decisions.map((decision, index) => (
                                    <div key={index} className="decision-item">
                                        {editingSummary && editSummaryData ? (
                                            <>
                                                <textarea
                                                    className="summary-inline-textarea small"
                                                    value={editSummaryData.decisions[index]?.content || ''}
                                                    onChange={(e) => {
                                                        const updated = [...editSummaryData.decisions];
                                                        updated[index] = { ...updated[index], content: e.target.value };
                                                        setEditSummaryData({ ...editSummaryData, decisions: updated });
                                                    }}
                                                    rows={2}
                                                    placeholder="決定内容"
                                                />
                                                <input
                                                    className="summary-inline-input small"
                                                    value={editSummaryData.decisions[index]?.rationale || ''}
                                                    onChange={(e) => {
                                                        const updated = [...editSummaryData.decisions];
                                                        updated[index] = { ...updated[index], rationale: e.target.value };
                                                        setEditSummaryData({ ...editSummaryData, decisions: updated });
                                                    }}
                                                    placeholder="決定の理由（任意）"
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <div className="content">{decision.content}</div>
                                                {decision.rationale && (
                                                    <div className="rationale">{decision.rationale}</div>
                                                )}
                                                {decision.related_agenda && (
                                                    <div className="related-agenda">
                                                        関連アジェンダ: {decision.related_agenda}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Next Actions Section */}
                    {displaySummary.next_actions.length > 0 && (
                        <div className="next-actions-section">
                            <div className="next-actions-header">
                                <h4>
                                    <FaTasks />
                                    ネクストアクション ({displaySummary.next_actions.length}件)
                                    {convertedActions.size > 0 && (
                                        <span className="converted-count">
                                            {convertedActions.size}件適用済み
                                        </span>
                                    )}
                                </h4>
                                <button
                                    className="create-tasks-btn"
                                    onClick={handleApplyActions}
                                    disabled={
                                        selectedActions.size === 0 || applyActionsMutation.isPending
                                    }
                                >
                                    <FaPlus />
                                    {getApplyButtonLabel()}
                                </button>
                            </div>
                            <div className="actions-list">
                                {displaySummary.next_actions.map((action, index) => {
                                    const isConverted = convertedActions.has(index);
                                    const actionType = action.action_type || 'create';
                                    return (
                                        <div
                                            key={index}
                                            className={`action-item ${isConverted ? 'converted' : ''} action-item-${actionType}`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="action-checkbox"
                                                checked={selectedActions.has(index)}
                                                onChange={() => handleToggleAction(index)}
                                                disabled={isConverted}
                                            />
                                            <div className="action-content">
                                                <div className="action-title-row">
                                                    <h5>{action.title}</h5>
                                                    {getActionTypeBadge(action.action_type)}
                                                    {isConverted && (
                                                        <span className="converted-badge">
                                                            <FaCheckCircle /> 適用済み
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Show existing task reference for update/add_subtask */}
                                                {(actionType === 'update' || actionType === 'add_subtask') && action.existing_task_title && (
                                                    <div className="existing-task-ref">
                                                        <FaLink />
                                                        <span>対象タスク: {action.existing_task_title}</span>
                                                    </div>
                                                )}

                                                {/* Show update reason */}
                                                {actionType === 'update' && action.update_reason && (
                                                    <p className="action-update-reason">
                                                        更新内容: {action.update_reason}
                                                    </p>
                                                )}

                                                {action.description && <p>{action.description}</p>}
                                                {action.purpose && (
                                                    <p className="action-purpose">目的: {action.purpose}</p>
                                                )}
                                                <div className="action-meta">
                                                    {action.assignee && (
                                                        <span>
                                                            <FaUser /> {action.assignee}
                                                        </span>
                                                    )}
                                                    {action.due_date && (
                                                        <span>
                                                            <FaCalendar /> {action.due_date}
                                                        </span>
                                                    )}
                                                    <span className={getPriorityClass(action.priority)}>
                                                        <FaFlag /> 優先度: {getPriorityLabel(action.priority)}
                                                    </span>
                                                    {action.estimated_minutes && (
                                                        <span>
                                                            <FaClock /> {action.estimated_minutes}分
                                                        </span>
                                                    )}
                                                    {action.energy_level && (
                                                        <span className={`energy-${action.energy_level.toLowerCase()}`}>
                                                            <FaBolt /> 負荷: {getEnergyLabel(action.energy_level)}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Assignee selection for unconverted actions */}
                                                {!isConverted && memberOptions.length > 0 && (
                                                    <div className="action-assignee-select">
                                                        <label>
                                                            <FaUser />
                                                            担当者:
                                                        </label>
                                                        <select
                                                            value={actionAssignees[index] || ''}
                                                            onChange={(e) => handleAssigneeChange(index, e.target.value)}
                                                        >
                                                            <option value="">
                                                                {action.assignee ? `AI提案: ${action.assignee}` : '未指定'}
                                                            </option>
                                                            {memberOptions.map((member) => (
                                                                <option key={member.id} value={member.id}>
                                                                    {member.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
