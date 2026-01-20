import { useEffect, useState } from 'react';
import { FaCalendarAlt, FaList, FaPlus, FaArrowLeft, FaCog } from 'react-icons/fa';
import { api as client } from '../../api/client';
import { projectsApi } from '../../api/projects';
import type { CheckinCreateV2, CheckinV2, ProjectMember, RecurringMeeting, Task } from '../../api/types';
import { CheckinForm } from '../projects/CheckinForm';
import { RecurringMeetingsPanel } from '../projects/RecurringMeetingsPanel';
import { MeetingCalendarView } from './MeetingCalendarView';
import { MeetingMainContent } from './MeetingMainContent';
import { MeetingSidebar } from './MeetingSidebar';
import './MeetingsTab.css';
import './MeetingCalendarView.css';

type ViewMode = 'list' | 'calendar';

interface MeetingsTabProps {
    projectId: string;
    members: ProjectMember[];
    tasks: Task[];
    currentUserId: string;
}

export function MeetingsTab({ projectId, members, tasks, currentUserId }: MeetingsTabProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedMeeting, setSelectedMeeting] = useState<RecurringMeeting | null>(null);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [recurringMeetings, setRecurringMeetings] = useState<RecurringMeeting[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCheckinSaving, setIsCheckinSaving] = useState(false);
    const [showCheckinForm, setShowCheckinForm] = useState(false);
    const [checkinsV2, setCheckinsV2] = useState<CheckinV2[]>([]);
    const [isCheckinsLoading, setIsCheckinsLoading] = useState(true);
    const [expandedCheckinId, setExpandedCheckinId] = useState<string | null>(null);
    const [showRecurringMeetingsModal, setShowRecurringMeetingsModal] = useState(false);

    const getMemberName = (memberUserId: string) => {
        const member = members.find(m => m.member_user_id === memberUserId);
        return member?.member_display_name || memberUserId;
    };

    useEffect(() => {
        const fetchRecurringMeetings = async () => {
            setIsLoading(true);
            try {
                const response = await client.get<RecurringMeeting[]>(`/recurring-meetings?project_id=${projectId}`);
                setRecurringMeetings(response || []);
            } catch (e) {
                console.error("Failed to fetch recurring meetings", e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRecurringMeetings();
    }, [projectId]);

    // Fetch check-ins V2
    useEffect(() => {
        const fetchCheckins = async () => {
            setIsCheckinsLoading(true);
            try {
                const response = await projectsApi.listCheckinsV2(projectId);
                setCheckinsV2(response || []);
            } catch (e) {
                console.error("Failed to fetch check-ins", e);
            } finally {
                setIsCheckinsLoading(false);
            }
        };
        fetchCheckins();
    }, [projectId]);

    const handleSelectTask = (task: Task, date: Date) => {
        setSelectedDate(date);
        setSelectedTask(task);
        if (task.recurring_meeting_id) {
            const meeting = recurringMeetings.find(m => m.id === task.recurring_meeting_id);
            setSelectedMeeting(meeting || null);
        } else {
            setSelectedMeeting(null);
        }
    };

    const handleCalendarMeetingSelect = (task: Task, date: Date) => {
        setSelectedDate(date);
        setSelectedTask(task);
        if (task.recurring_meeting_id) {
            const meeting = recurringMeetings.find(m => m.id === task.recurring_meeting_id);
            setSelectedMeeting(meeting || null);
        } else {
            setSelectedMeeting(null);
        }
    };

    const handleSubmitCheckinV2 = async (data: CheckinCreateV2) => {
        setIsCheckinSaving(true);
        try {
            await projectsApi.createCheckinV2(projectId, data);
            // Refresh the list and close the form
            const response = await projectsApi.listCheckinsV2(projectId);
            setCheckinsV2(response || []);
            setShowCheckinForm(false);
        } catch (err) {
            console.error('Failed to create V2 checkin:', err);
            throw err;
        } finally {
            setIsCheckinSaving(false);
        }
    };

    return (
        <div className="meetings-tab-wrapper">
            <div className="meetings-tab-view-toggle">
                <button
                    className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setViewMode('list')}
                    title="リスト表示"
                >
                    <FaList /> リスト
                </button>
                <button
                    className={`view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                    onClick={() => setViewMode('calendar')}
                    title="カレンダー表示"
                >
                    <FaCalendarAlt /> カレンダー
                </button>
                <button
                    className="view-toggle-btn recurring-meetings-btn"
                    onClick={() => setShowRecurringMeetingsModal(true)}
                    title="定例会議を管理"
                >
                    <FaCog /> 定例会議管理
                </button>
            </div>

            {viewMode === 'list' ? (
                <div className="meetings-tab-three-column">
                    <MeetingSidebar
                        projectId={projectId}
                        recurringMeetings={recurringMeetings}
                        selectedTask={selectedTask}
                        onSelectTask={handleSelectTask}
                        isLoading={isLoading}
                    />
                    <MeetingMainContent
                        projectId={projectId}
                        selectedDate={selectedDate}
                        selectedMeeting={selectedMeeting}
                        selectedTask={selectedTask}
                    />
                    <div className="meetings-checkin-panel">
                        {showCheckinForm ? (
                            <>
                                <div className="checkin-panel-header">
                                    <button
                                        className="checkin-back-btn"
                                        onClick={() => setShowCheckinForm(false)}
                                    >
                                        <FaArrowLeft /> 戻る
                                    </button>
                                </div>
                                <CheckinForm
                                    projectId={projectId}
                                    members={members}
                                    tasks={tasks}
                                    currentUserId={currentUserId}
                                    onSubmit={handleSubmitCheckinV2}
                                    onCancel={() => setShowCheckinForm(false)}
                                    isSubmitting={isCheckinSaving}
                                    hideCancel
                                    compact
                                />
                            </>
                        ) : (
                            <div className="checkin-list-view">
                                <div className="checkin-panel-header">
                                    <div className="checkin-header-left">
                                        <h3>Check-in</h3>
                                        <span className="checkin-header-desc">困りごとや議論テーマを投稿</span>
                                    </div>
                                    <button
                                        className="checkin-add-btn"
                                        onClick={() => setShowCheckinForm(true)}
                                    >
                                        <FaPlus /> 新規
                                    </button>
                                </div>
                                {isCheckinsLoading ? (
                                    <div className="checkin-loading">読み込み中...</div>
                                ) : checkinsV2.length === 0 ? (
                                    <div className="checkin-empty">
                                        <p>まだCheck-inがありません</p>
                                        <button
                                            className="checkin-add-btn-large"
                                            onClick={() => setShowCheckinForm(true)}
                                        >
                                            <FaPlus /> 最初のCheck-inを作成
                                        </button>
                                    </div>
                                ) : (
                                    <div className="checkin-list">
                                        {checkinsV2.map((checkin) => (
                                            <div
                                                key={checkin.id}
                                                className={`checkin-list-item ${expandedCheckinId === checkin.id ? 'expanded' : ''}`}
                                                onClick={() => setExpandedCheckinId(expandedCheckinId === checkin.id ? null : checkin.id)}
                                            >
                                                <div className="checkin-item-header">
                                                    <div className="checkin-item-meta">
                                                        <span className="checkin-item-user">{getMemberName(checkin.member_user_id)}</span>
                                                        <span className="checkin-item-date">
                                                            {new Date(checkin.checkin_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                                                        </span>
                                                    </div>
                                                    {checkin.mood && (
                                                        <span className="checkin-item-mood">
                                                            {checkin.mood === 'good' ? '😊' : checkin.mood === 'okay' ? '😐' : '😰'}
                                                        </span>
                                                    )}
                                                </div>
                                                {checkin.items && checkin.items.length > 0 && (
                                                    <div className="checkin-item-items">
                                                        {(expandedCheckinId === checkin.id ? checkin.items : checkin.items.slice(0, 2)).map((item, idx) => (
                                                            <div key={idx} className={`checkin-item-entry ${expandedCheckinId === checkin.id ? 'expanded' : ''}`}>
                                                                <span className={`checkin-category-badge ${item.category}`}>
                                                                    {item.category === 'blocker' ? '🚧' : item.category === 'discussion' ? '💬' : item.category === 'request' ? '🙏' : '📝'}
                                                                </span>
                                                                <span className="checkin-item-content">{item.content}</span>
                                                            </div>
                                                        ))}
                                                        {expandedCheckinId !== checkin.id && checkin.items.length > 2 && (
                                                            <div className="checkin-item-more">+{checkin.items.length - 2}件（クリックで展開）</div>
                                                        )}
                                                    </div>
                                                )}
                                                {checkin.free_comment && (
                                                    <div className={`checkin-item-comment ${expandedCheckinId === checkin.id ? 'expanded' : ''}`}>{checkin.free_comment}</div>
                                                )}
                                                {expandedCheckinId === checkin.id && (
                                                    <div className="checkin-item-collapse-hint">クリックで閉じる</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="meetings-tab-calendar-with-checkin">
                    <div className="meetings-tab-calendar-main">
                        <MeetingCalendarView
                            projectId={projectId}
                            onMeetingSelect={handleCalendarMeetingSelect}
                        />
                        {selectedTask && (
                            <div className="meetings-tab-calendar-detail">
                                <MeetingMainContent
                                    projectId={projectId}
                                    selectedDate={selectedDate}
                                    selectedMeeting={selectedMeeting}
                                    selectedTask={selectedTask}
                                />
                            </div>
                        )}
                    </div>
                    <div className="meetings-checkin-panel">
                        {showCheckinForm ? (
                            <>
                                <div className="checkin-panel-header">
                                    <button
                                        className="checkin-back-btn"
                                        onClick={() => setShowCheckinForm(false)}
                                    >
                                        <FaArrowLeft /> 戻る
                                    </button>
                                </div>
                                <CheckinForm
                                    projectId={projectId}
                                    members={members}
                                    tasks={tasks}
                                    currentUserId={currentUserId}
                                    onSubmit={handleSubmitCheckinV2}
                                    onCancel={() => setShowCheckinForm(false)}
                                    isSubmitting={isCheckinSaving}
                                    hideCancel
                                    compact
                                />
                            </>
                        ) : (
                            <div className="checkin-list-view">
                                <div className="checkin-panel-header">
                                    <div className="checkin-header-left">
                                        <h3>Check-in</h3>
                                        <span className="checkin-header-desc">困りごとや議論テーマを投稿</span>
                                    </div>
                                    <button
                                        className="checkin-add-btn"
                                        onClick={() => setShowCheckinForm(true)}
                                    >
                                        <FaPlus /> 新規
                                    </button>
                                </div>
                                {isCheckinsLoading ? (
                                    <div className="checkin-loading">読み込み中...</div>
                                ) : checkinsV2.length === 0 ? (
                                    <div className="checkin-empty">
                                        <p>まだCheck-inがありません</p>
                                        <button
                                            className="checkin-add-btn-large"
                                            onClick={() => setShowCheckinForm(true)}
                                        >
                                            <FaPlus /> 最初のCheck-inを作成
                                        </button>
                                    </div>
                                ) : (
                                    <div className="checkin-list">
                                        {checkinsV2.map((checkin) => (
                                            <div
                                                key={checkin.id}
                                                className={`checkin-list-item ${expandedCheckinId === checkin.id ? 'expanded' : ''}`}
                                                onClick={() => setExpandedCheckinId(expandedCheckinId === checkin.id ? null : checkin.id)}
                                            >
                                                <div className="checkin-item-header">
                                                    <div className="checkin-item-meta">
                                                        <span className="checkin-item-user">{getMemberName(checkin.member_user_id)}</span>
                                                        <span className="checkin-item-date">
                                                            {new Date(checkin.checkin_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                                                        </span>
                                                    </div>
                                                    {checkin.mood && (
                                                        <span className="checkin-item-mood">
                                                            {checkin.mood === 'good' ? '😊' : checkin.mood === 'okay' ? '😐' : '😰'}
                                                        </span>
                                                    )}
                                                </div>
                                                {checkin.items && checkin.items.length > 0 && (
                                                    <div className="checkin-item-items">
                                                        {(expandedCheckinId === checkin.id ? checkin.items : checkin.items.slice(0, 2)).map((item, idx) => (
                                                            <div key={idx} className={`checkin-item-entry ${expandedCheckinId === checkin.id ? 'expanded' : ''}`}>
                                                                <span className={`checkin-category-badge ${item.category}`}>
                                                                    {item.category === 'blocker' ? '🚧' : item.category === 'discussion' ? '💬' : item.category === 'request' ? '🙏' : '📝'}
                                                                </span>
                                                                <span className="checkin-item-content">{item.content}</span>
                                                            </div>
                                                        ))}
                                                        {expandedCheckinId !== checkin.id && checkin.items.length > 2 && (
                                                            <div className="checkin-item-more">+{checkin.items.length - 2}件（クリックで展開）</div>
                                                        )}
                                                    </div>
                                                )}
                                                {checkin.free_comment && (
                                                    <div className={`checkin-item-comment ${expandedCheckinId === checkin.id ? 'expanded' : ''}`}>{checkin.free_comment}</div>
                                                )}
                                                {expandedCheckinId === checkin.id && (
                                                    <div className="checkin-item-collapse-hint">クリックで閉じる</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Recurring Meetings Management Modal */}
            {showRecurringMeetingsModal && (
                <div className="recurring-meetings-modal-overlay" onClick={() => setShowRecurringMeetingsModal(false)}>
                    <div className="recurring-meetings-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="recurring-meetings-modal-header">
                            <h2>定例会議管理</h2>
                            <button
                                className="recurring-meetings-modal-close"
                                onClick={() => setShowRecurringMeetingsModal(false)}
                            >
                                ✕
                            </button>
                        </div>
                        <RecurringMeetingsPanel projectId={projectId} />
                    </div>
                </div>
            )}
        </div>
    );
}
