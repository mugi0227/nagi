import { useState } from 'react';
import { FaRepeat } from 'react-icons/fa6';
import type { RecurringTask, RecurringTaskCreate, RecurringTaskFrequency, RecurringTaskUpdate } from '../../api/types';
import './RecurringTaskForm.css';

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

const FREQUENCY_OPTIONS: { value: RecurringTaskFrequency; label: string }[] = [
  { value: 'daily', label: '毎日' },
  { value: 'weekly', label: '毎週' },
  { value: 'biweekly', label: '隔週' },
  { value: 'monthly', label: '毎月' },
  { value: 'bimonthly', label: '隔月' },
  { value: 'custom', label: 'カスタム' },
];

interface RecurringTaskFormProps {
  initial?: RecurringTask;
  projectId?: string;
  onSubmit: (data: RecurringTaskCreate | RecurringTaskUpdate) => Promise<void>;
  onCancel: () => void;
}

interface FormState {
  title: string;
  description: string;
  frequency: RecurringTaskFrequency;
  weekday: number;
  dayOfMonth: number;
  customIntervalDays: number;
  estimatedMinutes: string;
  importance: string;
  urgency: string;
  energyLevel: string;
}

export function RecurringTaskForm({ initial, projectId, onSubmit, onCancel }: RecurringTaskFormProps) {
  const [form, setForm] = useState<FormState>({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    frequency: initial?.frequency ?? 'weekly',
    weekday: initial?.weekday ?? 0,
    dayOfMonth: initial?.day_of_month ?? 1,
    customIntervalDays: initial?.custom_interval_days ?? 7,
    estimatedMinutes: initial?.estimated_minutes?.toString() ?? '',
    importance: initial?.importance ?? 'MEDIUM',
    urgency: initial?.urgency ?? 'MEDIUM',
    energyLevel: initial?.energy_level ?? 'LOW',
  });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const needsWeekday = form.frequency === 'weekly' || form.frequency === 'biweekly';
  const needsDayOfMonth = form.frequency === 'monthly' || form.frequency === 'bimonthly';
  const needsCustomInterval = form.frequency === 'custom';

  const validate = (): string | null => {
    if (!form.title.trim()) return 'タイトルを入力してください';
    if (needsWeekday && (form.weekday < 0 || form.weekday > 6)) return '曜日を選択してください';
    if (needsDayOfMonth && (form.dayOfMonth < 1 || form.dayOfMonth > 31)) return '日付を1〜31の範囲で入力してください';
    if (needsCustomInterval && (form.customIntervalDays < 1 || form.customIntervalDays > 365)) return '間隔を1〜365の範囲で入力してください';
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
      const data: RecurringTaskCreate = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        project_id: projectId || initial?.project_id || undefined,
        frequency: form.frequency,
        weekday: needsWeekday ? form.weekday : undefined,
        day_of_month: needsDayOfMonth ? form.dayOfMonth : undefined,
        custom_interval_days: needsCustomInterval ? form.customIntervalDays : undefined,
        estimated_minutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : undefined,
        importance: form.importance as 'HIGH' | 'MEDIUM' | 'LOW',
        urgency: form.urgency as 'HIGH' | 'MEDIUM' | 'LOW',
        energy_level: form.energyLevel as 'HIGH' | 'MEDIUM' | 'LOW',
      };
      await onSubmit(data);
    } catch {
      setError('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="recurring-task-form-overlay" onClick={onCancel}>
      <div className="recurring-task-form-content" onClick={e => e.stopPropagation()}>
        <div className="recurring-task-form-header">
          <h2><FaRepeat style={{ marginRight: 8, verticalAlign: 'middle' }} />{initial ? '定期タスクを編集' : '定期タスクを作成'}</h2>
          <button className="recurring-task-form-close" onClick={onCancel}>✕</button>
        </div>

        <div className="recurring-task-form-body">
          {/* Title */}
          <div className="rt-form-row">
            <label htmlFor="rt-title">タイトル</label>
            <input
              id="rt-title"
              type="text"
              value={form.title}
              onChange={e => updateField('title', e.target.value)}
              placeholder="例: 週次レポート作成"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="rt-form-row">
            <label htmlFor="rt-desc">説明（任意）</label>
            <textarea
              id="rt-desc"
              value={form.description}
              onChange={e => updateField('description', e.target.value)}
              placeholder="タスクの詳細"
              rows={2}
            />
          </div>

          {/* Frequency */}
          <div className="rt-form-row">
            <label htmlFor="rt-freq">頻度</label>
            <select
              id="rt-freq"
              value={form.frequency}
              onChange={e => updateField('frequency', e.target.value as RecurringTaskFrequency)}
            >
              {FREQUENCY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Weekday selector (weekly / biweekly) */}
          {needsWeekday && (
            <div className="rt-form-row">
              <label>曜日</label>
              <div className="rt-weekday-group">
                {WEEKDAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`rt-weekday-btn ${form.weekday === idx ? 'active' : ''}`}
                    onClick={() => updateField('weekday', idx)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Day of month (monthly / bimonthly) */}
          {needsDayOfMonth && (
            <div className="rt-form-row">
              <label htmlFor="rt-dom">日付（毎月何日）</label>
              <input
                id="rt-dom"
                type="number"
                min={1}
                max={31}
                value={form.dayOfMonth}
                onChange={e => updateField('dayOfMonth', Number(e.target.value))}
              />
            </div>
          )}

          {/* Custom interval */}
          {needsCustomInterval && (
            <div className="rt-form-row">
              <label htmlFor="rt-interval">間隔（日数）</label>
              <input
                id="rt-interval"
                type="number"
                min={1}
                max={365}
                value={form.customIntervalDays}
                onChange={e => updateField('customIntervalDays', Number(e.target.value))}
              />
            </div>
          )}

          {/* Estimated minutes + Priority grid */}
          <div className="rt-form-grid">
            <div className="rt-form-row">
              <label htmlFor="rt-est">見積もり（分）</label>
              <input
                id="rt-est"
                type="number"
                min={1}
                value={form.estimatedMinutes}
                onChange={e => updateField('estimatedMinutes', e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="rt-form-row">
              <label htmlFor="rt-energy">エネルギー</label>
              <select
                id="rt-energy"
                value={form.energyLevel}
                onChange={e => updateField('energyLevel', e.target.value)}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </div>
          </div>

          <div className="rt-form-grid">
            <div className="rt-form-row">
              <label htmlFor="rt-importance">重要度</label>
              <select
                id="rt-importance"
                value={form.importance}
                onChange={e => updateField('importance', e.target.value)}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </div>
            <div className="rt-form-row">
              <label htmlFor="rt-urgency">緊急度</label>
              <select
                id="rt-urgency"
                value={form.urgency}
                onChange={e => updateField('urgency', e.target.value)}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </div>
          </div>

          {error && <p className="rt-form-error">{error}</p>}

          <div className="rt-form-actions">
            <button className="rt-cancel-btn" onClick={onCancel}>キャンセル</button>
            <button className="rt-submit-btn" onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? '保存中...' : initial ? '更新' : '作成'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
