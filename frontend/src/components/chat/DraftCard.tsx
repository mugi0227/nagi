import { useState } from 'react';
import { FaRobot, FaListCheck, FaFileLines, FaCodeBranch, FaClipboardList } from 'react-icons/fa6';
import { useTimezone } from '../../hooks/useTimezone';
import { todayInTimezone } from '../../utils/dateTime';
import './DraftCard.css';

export type DraftCardType = 'task' | 'phase' | 'agenda' | 'subtask' | 'actionItem';

export interface DraftCardInfo {
  label: string;
  value: string;
}

export interface CheckinOptions {
  enabled: boolean;
  startDate?: string;  // YYYY-MM-DD
  endDate?: string;    // YYYY-MM-DD
}

export interface DraftCardData {
  type: DraftCardType;
  title: string;
  info: DraftCardInfo[];
  placeholder: string;
  promptTemplate: string;
  // Agenda-specific options
  checkinOptions?: CheckinOptions;
}

interface DraftCardProps {
  data: DraftCardData;
  onSend: (message: string) => void;
  onCancel: () => void;
}

const iconMap: Record<DraftCardType, React.ReactNode> = {
  task: <FaRobot />,
  phase: <FaListCheck />,
  agenda: <FaFileLines />,
  subtask: <FaCodeBranch />,
  actionItem: <FaClipboardList />,
};

export function DraftCard({ data, onSend, onCancel }: DraftCardProps) {
  const timezone = useTimezone();
  const [instruction, setInstruction] = useState('');

  // Check-in options state (for agenda type)
  const defaultStartDate = () => {
    return todayInTimezone(timezone).minus({ days: 7 }).toISODate() ?? '';
  };
  const defaultEndDate = () => todayInTimezone(timezone).toISODate() ?? '';

  const [checkinEnabled, setCheckinEnabled] = useState(data.checkinOptions?.enabled ?? true);
  const [checkinStartDate, setCheckinStartDate] = useState(data.checkinOptions?.startDate ?? defaultStartDate());
  const [checkinEndDate, setCheckinEndDate] = useState(data.checkinOptions?.endDate ?? defaultEndDate());

  const handleSend = () => {
    let message = data.promptTemplate.replace('{instruction}', instruction.trim());

    // Add check-in context for agenda type
    if (data.type === 'agenda') {
      if (checkinEnabled) {
        message = message.replace('{checkin_context}',
          `Check-in情報を参照: ${checkinStartDate} 〜 ${checkinEndDate}`);
      } else {
        message = message.replace('{checkin_context}', 'Check-in情報: 参照しない');
      }
    }

    onSend(message);
  };

  return (
    <div className={`draft-card draft-card-${data.type}`}>
      <div className="draft-card-header">
        <span className="draft-card-icon">{iconMap[data.type]}</span>
        <span className="draft-card-title">{data.title}</span>
      </div>
      <div className="draft-card-body">
        <div className="draft-card-info">
          {data.info.map((item, index) => (
            <div key={index} className="draft-card-info-row">
              <span className="draft-card-label">{item.label}</span>
              <span className="draft-card-value">{item.value}</span>
            </div>
          ))}
        </div>

        {/* Check-in options for agenda type */}
        {data.type === 'agenda' && (
          <div className="draft-card-checkin-options">
            <label className="draft-card-checkin-toggle">
              <input
                type="checkbox"
                checked={checkinEnabled}
                onChange={(e) => setCheckinEnabled(e.target.checked)}
              />
              <span>Check-in情報を参照する</span>
            </label>
            {checkinEnabled && (
              <div className="draft-card-checkin-dates">
                <div className="draft-card-date-field">
                  <label>開始日</label>
                  <input
                    type="date"
                    value={checkinStartDate}
                    onChange={(e) => setCheckinStartDate(e.target.value)}
                  />
                </div>
                <span className="draft-card-date-separator">〜</span>
                <div className="draft-card-date-field">
                  <label>終了日</label>
                  <input
                    type="date"
                    value={checkinEndDate}
                    onChange={(e) => setCheckinEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="draft-card-instruction">
          <label>追加の指示（任意）</label>
          <textarea
            rows={3}
            placeholder={data.placeholder}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            autoFocus
          />
        </div>
        <div className="draft-card-actions">
          <button className="draft-card-btn-cancel" onClick={onCancel}>
            キャンセル
          </button>
          <button className="draft-card-btn-send" onClick={handleSend}>
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
