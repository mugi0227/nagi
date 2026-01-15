import { useState } from 'react';
import { FaRobot, FaListCheck, FaFileLines, FaCodeBranch, FaClipboardList } from 'react-icons/fa6';
import './DraftCard.css';

export type DraftCardType = 'task' | 'phase' | 'agenda' | 'subtask' | 'actionItem';

export interface DraftCardInfo {
  label: string;
  value: string;
}

export interface DraftCardData {
  type: DraftCardType;
  title: string;
  info: DraftCardInfo[];
  placeholder: string;
  promptTemplate: string;
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
  const [instruction, setInstruction] = useState('');

  const handleSend = () => {
    const message = data.promptTemplate.replace('{instruction}', instruction.trim());
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
