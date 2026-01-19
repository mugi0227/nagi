/**
 * MeetingCompleted - Post-meeting summary and task creation component
 *
 * Shows transcript analysis, summary, decisions, and next actions.
 * Allows creating tasks from extracted action items.
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
} from 'react-icons/fa';
import { meetingSessionApi } from '../../api/meetingSession';
import type { MeetingSession, MeetingSummary, NextAction } from '../../types/session';
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

interface MeetingCompletedProps {
    session: MeetingSession;
    projectId: string;
    onTasksCreated?: () => void;
}

export function MeetingCompleted({ session, projectId, onTasksCreated }: MeetingCompletedProps) {
    const [transcript, setTranscript] = useState(session.transcript || '');
    const [savedTranscript, setSavedTranscript] = useState(session.transcript || ''); // Track last saved value
    const [isEditing, setIsEditing] = useState(!session.transcript); // Start in edit mode if no transcript

    // Initialize summary from saved session data
    const initialSummary = useMemo(() => parseSavedSummary(session.summary), [session.summary]);
    const [summary, setSummary] = useState<MeetingSummary | null>(initialSummary);

    // Initialize selected actions from saved summary
    const initialSelectedActions = useMemo(() => {
        if (initialSummary?.next_actions) {
            return new Set(initialSummary.next_actions.map((_, i) => i));
        }
        return new Set<number>();
    }, [initialSummary]);
    const [selectedActions, setSelectedActions] = useState<Set<number>>(initialSelectedActions);
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
            return meetingSessionApi.analyzeTranscript(session.id, { transcript });
        },
        onSuccess: (data) => {
            setSummary(data);
            // Select all actions by default
            setSelectedActions(new Set(data.next_actions.map((_, i) => i)));
            setErrorMessage(null);
            // Save the summary to backend
            saveSummaryMutation.mutate(data);
        },
        onError: (error) => {
            setErrorMessage('トランスクリプトの分析に失敗しました。');
            console.error('Failed to analyze transcript:', error);
        },
    });

    // Create tasks mutation
    const createTasksMutation = useMutation({
        mutationFn: async (actions: NextAction[]) => {
            return meetingSessionApi.createTasksFromActions(session.id, {
                project_id: projectId,
                actions,
            });
        },
        onSuccess: (data) => {
            setSuccessMessage(`${data.created_count}件のタスクを作成しました。`);
            setSelectedActions(new Set());
            onTasksCreated?.();
        },
        onError: (error) => {
            setErrorMessage('タスクの作成に失敗しました。');
            console.error('Failed to create tasks:', error);
        },
    });

    // Save transcript mutation
    const saveTranscriptMutation = useMutation({
        mutationFn: async () => {
            return meetingSessionApi.update(session.id, { transcript });
        },
        onSuccess: () => {
            setSavedTranscript(transcript); // Update saved value
            setSuccessMessage('議事録を保存しました。');
            setErrorMessage(null);
            setIsEditing(false);
        },
        onError: (error) => {
            setErrorMessage('議事録の保存に失敗しました。');
            console.error('Failed to save transcript:', error);
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
        setTranscript(savedTranscript); // Restore to last saved value
        setIsEditing(false);
    }, [savedTranscript]);

    const handleStartEdit = useCallback(() => {
        setIsEditing(true);
    }, []);

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

    const handleCreateTasks = useCallback(() => {
        if (!summary || selectedActions.size === 0) return;

        const actionsToCreate = summary.next_actions.filter((_, i) => selectedActions.has(i));
        createTasksMutation.mutate(actionsToCreate);
    }, [summary, selectedActions, createTasksMutation]);

    const getPriorityClass = (priority: string) => {
        switch (priority) {
            case 'HIGH':
                return 'priority-high';
            case 'MEDIUM':
                return 'priority-medium';
            case 'LOW':
                return 'priority-low';
            default:
                return '';
        }
    };

    const getPriorityLabel = (priority: string) => {
        switch (priority) {
            case 'HIGH':
                return '高';
            case 'MEDIUM':
                return '中';
            case 'LOW':
                return '低';
            default:
                return priority;
        }
    };

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
                    {!isEditing && transcript && (
                        <button className="edit-btn" onClick={handleStartEdit} title="編集">
                            <FaEdit />
                        </button>
                    )}
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

                {/* Analyze button - show when transcript exists */}
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
            {summary && (
                <>
                    <div className="summary-section">
                        <h4>
                            <FaLightbulb />
                            会議サマリー
                        </h4>
                        <div className="overall-summary">
                            <p>{summary.overall_summary}</p>
                        </div>

                        {summary.agenda_discussions.length > 0 && (
                            <div className="agenda-discussions">
                                {summary.agenda_discussions.map((disc, index) => (
                                    <div key={index} className="discussion-item">
                                        <h5>{disc.agenda_title}</h5>
                                        <p>{disc.summary}</p>
                                        {disc.key_points.length > 0 && (
                                            <div className="key-points">
                                                {disc.key_points.map((point, i) => (
                                                    <span key={i}>{point}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Decisions Section */}
                    {summary.decisions.length > 0 && (
                        <div className="decisions-section">
                            <h4>
                                <FaCheckCircle />
                                決定事項
                            </h4>
                            <div className="decisions-list">
                                {summary.decisions.map((decision, index) => (
                                    <div key={index} className="decision-item">
                                        <div className="content">{decision.content}</div>
                                        {decision.rationale && (
                                            <div className="rationale">{decision.rationale}</div>
                                        )}
                                        {decision.related_agenda && (
                                            <div className="related-agenda">
                                                関連アジェンダ: {decision.related_agenda}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Next Actions Section */}
                    {summary.next_actions.length > 0 && (
                        <div className="next-actions-section">
                            <div className="next-actions-header">
                                <h4>
                                    <FaTasks />
                                    ネクストアクション ({summary.next_actions.length}件)
                                </h4>
                                <button
                                    className="create-tasks-btn"
                                    onClick={handleCreateTasks}
                                    disabled={
                                        selectedActions.size === 0 || createTasksMutation.isPending
                                    }
                                >
                                    <FaPlus />
                                    {createTasksMutation.isPending
                                        ? '作成中...'
                                        : `タスク化 (${selectedActions.size}件)`}
                                </button>
                            </div>
                            <div className="actions-list">
                                {summary.next_actions.map((action, index) => (
                                    <div key={index} className="action-item">
                                        <input
                                            type="checkbox"
                                            className="action-checkbox"
                                            checked={selectedActions.has(index)}
                                            onChange={() => handleToggleAction(index)}
                                        />
                                        <div className="action-content">
                                            <h5>{action.title}</h5>
                                            {action.description && <p>{action.description}</p>}
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
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

        </div>
    );
}
