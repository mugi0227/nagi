import { FaCircleQuestion } from 'react-icons/fa6';
import './TourHelpButton.css';

interface TourHelpButtonProps {
  onClick: () => void;
}

export function TourHelpButton({ onClick }: TourHelpButtonProps) {
  return (
    <button
      className="tour-help-btn"
      onClick={onClick}
      title="ガイドを見る"
      type="button"
      aria-label="ガイドを見る"
    >
      <FaCircleQuestion />
    </button>
  );
}
