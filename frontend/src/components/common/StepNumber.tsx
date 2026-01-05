import './StepNumber.css';

interface StepNumberProps {
  stepNumber: number;
  className?: string;
}

/**
 * Display a step number with a square icon style.
 * Used for subtasks that have an order_in_parent field.
 */
export function StepNumber({ stepNumber, className = '' }: StepNumberProps) {
  return (
    <span className={`step-number-icon ${className}`}>
      {stepNumber}
    </span>
  );
}
