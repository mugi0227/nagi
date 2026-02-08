import { useState } from 'react';
import { DateTime } from 'luxon';
import { FaCalendarPlus } from 'react-icons/fa';
import { tasksApi } from '../../api/tasks';
import type { TaskCreate } from '../../api/types';
import { useTimezone } from '../../hooks/useTimezone';
import { useProjects } from '../../hooks/useProjects';
import { nowInTimezone } from '../../utils/dateTime';
import './CreateMeetingModal.css';

interface CreateMeetingModalProps {
    projectId?: string;
    initialDate?: string;
    initialStartTime?: string;
    initialEndTime?: string;
    onClose: () => void;
    onCreated: () => void;
}

interface FormState {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    isAllDay: boolean;
    location: string;
    attendees: string;
    description: string;
}

export function CreateMeetingModal({ projectId, initialDate, initialStartTime, initialEndTime, onClose, onCreated }: CreateMeetingModalProps) {
    const timezone = useTimezone();
    const { projects } = useProjects();
    const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? '');

    const [form, setForm] = useState<FormState>({
        title: '',
        date: initialDate ?? nowInTimezone(timezone).toFormat('yyyy-MM-dd'),
        startTime: initialStartTime ?? '10:00',
        endTime: initialEndTime ?? '11:00',
        isAllDay: false,
        location: '',
        attendees: '',
        description: '',
    });
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setError('');
    };

    const validate = (): string | null => {
        if (!form.title.trim()) return 'タイトルを入力してください';
        if (!form.date) return '日付を選択してください';
        if (!form.isAllDay) {
            if (!form.startTime) return '開始時刻を入力してください';
            if (!form.endTime) return '終了時刻を入力してください';
            if (form.endTime <= form.startTime) return '終了時刻は開始時刻より後にしてください';
        }
        return null;
    };

    const handleSubmit = async () => {
        if (isSaving) return;

        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsSaving(true);
        setError('');

        try {
            const attendees = form.attendees
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);

            let startTimeISO: string;
            let endTimeISO: string;

            if (form.isAllDay) {
                startTimeISO = DateTime.fromISO(`${form.date}T00:00:00`, { zone: timezone }).toISO()!;
                endTimeISO = DateTime.fromISO(`${form.date}T23:59:00`, { zone: timezone }).toISO()!;
            } else {
                startTimeISO = DateTime.fromISO(`${form.date}T${form.startTime}:00`, { zone: timezone }).toISO()!;
                endTimeISO = DateTime.fromISO(`${form.date}T${form.endTime}:00`, { zone: timezone }).toISO()!;
            }

            const resolvedProjectId = projectId ?? (selectedProjectId || undefined);
            const payload: TaskCreate = {
                title: form.title.trim(),
                project_id: resolvedProjectId,
                is_fixed_time: true,
                is_all_day: form.isAllDay,
                start_time: startTimeISO,
                end_time: endTimeISO,
                location: form.location.trim() || undefined,
                attendees: attendees.length > 0 ? attendees : undefined,
                description: form.description.trim() || undefined,
            };

            await tasksApi.create(payload);
            onCreated();
            onClose();
        } catch {
            setError('ミーティングの作成に失敗しました');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="create-meeting-modal-overlay" onClick={onClose}>
            <div className="create-meeting-modal-content" onClick={e => e.stopPropagation()}>
                <div className="create-meeting-modal-header">
                    <h2><FaCalendarPlus style={{ marginRight: 8, verticalAlign: 'middle' }} />ミーティングを作成</h2>
                    <button className="create-meeting-modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="create-meeting-form">
                    {/* Title */}
                    <div className="create-meeting-form-row">
                        <label htmlFor="cm-title">タイトル</label>
                        <input
                            id="cm-title"
                            type="text"
                            value={form.title}
                            onChange={e => updateField('title', e.target.value)}
                            placeholder="例: クライアントMTG"
                            autoFocus
                        />
                    </div>

                    {/* Project selector (when no projectId provided) */}
                    {!projectId && (
                        <div className="create-meeting-form-row">
                            <label htmlFor="cm-project">プロジェクト</label>
                            <select
                                id="cm-project"
                                value={selectedProjectId}
                                onChange={e => setSelectedProjectId(e.target.value)}
                            >
                                <option value="">なし（Inbox）</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Date + All-day toggle */}
                    <div className="create-meeting-form-grid">
                        <div className="create-meeting-form-row">
                            <label htmlFor="cm-date">日付</label>
                            <input
                                id="cm-date"
                                type="date"
                                value={form.date}
                                onChange={e => updateField('date', e.target.value)}
                            />
                        </div>
                        <div className="create-meeting-form-row">
                            <label>&nbsp;</label>
                            <label className="create-meeting-allday-label">
                                <input
                                    type="checkbox"
                                    checked={form.isAllDay}
                                    onChange={e => updateField('isAllDay', e.target.checked)}
                                />
                                終日
                            </label>
                        </div>
                    </div>

                    {/* Start/End time (hidden when all-day) */}
                    {!form.isAllDay && (
                        <div className="create-meeting-form-grid">
                            <div className="create-meeting-form-row">
                                <label htmlFor="cm-start">開始時刻</label>
                                <input
                                    id="cm-start"
                                    type="time"
                                    value={form.startTime}
                                    onChange={e => updateField('startTime', e.target.value)}
                                />
                            </div>
                            <div className="create-meeting-form-row">
                                <label htmlFor="cm-end">終了時刻</label>
                                <input
                                    id="cm-end"
                                    type="time"
                                    value={form.endTime}
                                    onChange={e => updateField('endTime', e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Location + Attendees */}
                    <div className="create-meeting-form-grid">
                        <div className="create-meeting-form-row">
                            <label htmlFor="cm-location">場所</label>
                            <input
                                id="cm-location"
                                type="text"
                                value={form.location}
                                onChange={e => updateField('location', e.target.value)}
                                placeholder="Zoom / 会議室A"
                            />
                        </div>
                        <div className="create-meeting-form-row">
                            <label htmlFor="cm-attendees">参加者</label>
                            <input
                                id="cm-attendees"
                                type="text"
                                value={form.attendees}
                                onChange={e => updateField('attendees', e.target.value)}
                                placeholder="田中さん, 佐藤さん"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div className="create-meeting-form-row">
                        <label htmlFor="cm-description">説明</label>
                        <textarea
                            id="cm-description"
                            value={form.description}
                            onChange={e => updateField('description', e.target.value)}
                            placeholder="ミーティングの目的や議題"
                            rows={3}
                        />
                    </div>

                    {error && <p className="create-meeting-error">{error}</p>}

                    <div className="create-meeting-form-actions">
                        <button className="create-meeting-cancel-btn" onClick={onClose}>
                            キャンセル
                        </button>
                        <button
                            className="create-meeting-submit-btn"
                            onClick={handleSubmit}
                            disabled={isSaving}
                        >
                            {isSaving ? '作成中...' : 'ミーティングを作成'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
