import { useState } from 'react';
import { FaCircleQuestion, FaChevronLeft, FaChevronRight } from 'react-icons/fa6';
import type { PendingQuestion } from '../../api/types';
import './QuestionsPanel.css';

const OTHER_OPTION = 'その他（自由入力）';

interface QuestionState {
  selectedOptions: string[];
  otherText: string;
}

interface QuestionsPanelProps {
  questions: PendingQuestion[];
  context?: string;
  onSubmit: (answers: string) => void;
  onCancel?: () => void;
}

export function QuestionsPanel({ questions, context, onSubmit, onCancel }: QuestionsPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuestionState>>(() => {
    const initial: Record<string, QuestionState> = {};
    questions.forEach((q) => {
      initial[q.id] = { selectedOptions: [], otherText: '' };
    });
    return initial;
  });

  if (questions.length === 0) {
    return null;
  }

  const currentQuestion = questions[currentIndex];
  const hasMultiple = questions.length > 1;

  const handlePrev = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1));
  };

  const handleOptionChange = (questionId: string, option: string, isMultiple: boolean) => {
    setAnswers((prev) => {
      const current = prev[questionId];
      let newSelected: string[];

      if (isMultiple) {
        if (current.selectedOptions.includes(option)) {
          newSelected = current.selectedOptions.filter((o) => o !== option);
        } else {
          newSelected = [...current.selectedOptions, option];
        }
      } else {
        newSelected = [option];
      }

      return {
        ...prev,
        [questionId]: { ...current, selectedOptions: newSelected },
      };
    });
  };

  const handleOtherTextChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], otherText: text },
    }));
  };

  const formatAnswersAsText = (): string => {
    const lines: string[] = [];

    questions.forEach((q) => {
      const answer = answers[q.id];
      const selected = answer.selectedOptions.filter((o) => o !== OTHER_OPTION);
      const hasOther = answer.selectedOptions.includes(OTHER_OPTION) && answer.otherText.trim();

      let answerText: string;
      if (selected.length === 0 && hasOther) {
        answerText = answer.otherText.trim();
      } else if (selected.length > 0 && hasOther) {
        answerText = [...selected, answer.otherText.trim()].join('、');
      } else if (selected.length > 0) {
        answerText = selected.join('、');
      } else {
        answerText = '（未回答）';
      }

      lines.push(`${q.question}: ${answerText}`);
    });

    return lines.join('\n');
  };

  const handleSubmit = () => {
    const formattedText = formatAnswersAsText();
    onSubmit(formattedText);
  };

  const isCurrentValid = () => {
    const answer = answers[currentQuestion.id];
    const hasSelection = answer.selectedOptions.length > 0;
    const hasValidOther = answer.selectedOptions.includes(OTHER_OPTION)
      ? answer.otherText.trim().length > 0
      : true;
    return hasSelection && hasValidOther;
  };

  const isAllValid = questions.every((q) => {
    const answer = answers[q.id];
    const hasSelection = answer.selectedOptions.length > 0;
    const hasValidOther = answer.selectedOptions.includes(OTHER_OPTION)
      ? answer.otherText.trim().length > 0
      : true;
    return hasSelection && hasValidOther;
  });

  const currentAnswer = answers[currentQuestion.id];

  return (
    <div className="questions-panel">
      <div className="questions-panel-header">
        <div className="questions-panel-title-area">
          <FaCircleQuestion className="questions-panel-icon" />
          <span className="questions-panel-badge">確認事項</span>
        </div>
        {hasMultiple && (
          <div className="questions-panel-pagination">
            <button
              className="questions-panel-nav-btn"
              onClick={handlePrev}
              disabled={currentIndex === 0}
            >
              <FaChevronLeft />
            </button>
            <span className="questions-panel-page">
              {currentIndex + 1} / {questions.length}
            </span>
            <button
              className="questions-panel-nav-btn"
              onClick={handleNext}
              disabled={currentIndex === questions.length - 1}
            >
              <FaChevronRight />
            </button>
          </div>
        )}
      </div>

      <div className="questions-panel-body">
        {context && currentIndex === 0 && (
          <div className="questions-panel-context">{context}</div>
        )}

        <div className="questions-panel-question">
          {hasMultiple && <span className="questions-panel-number">{currentIndex + 1}.</span>}
          {currentQuestion.question}
        </div>

        <div className="questions-panel-options">
          {currentQuestion.options.map((option) => (
            <label key={option} className="questions-panel-option">
              <input
                type={currentQuestion.allow_multiple ? 'checkbox' : 'radio'}
                name={`question-${currentQuestion.id}`}
                checked={currentAnswer.selectedOptions.includes(option)}
                onChange={() => handleOptionChange(currentQuestion.id, option, currentQuestion.allow_multiple)}
              />
              <span className="questions-panel-option-text">{option}</span>
            </label>
          ))}
          <label className="questions-panel-option">
            <input
              type={currentQuestion.allow_multiple ? 'checkbox' : 'radio'}
              name={`question-${currentQuestion.id}`}
              checked={currentAnswer.selectedOptions.includes(OTHER_OPTION)}
              onChange={() => handleOptionChange(currentQuestion.id, OTHER_OPTION, currentQuestion.allow_multiple)}
            />
            <span className="questions-panel-option-text">{OTHER_OPTION}</span>
          </label>
          {currentAnswer.selectedOptions.includes(OTHER_OPTION) && (
            <input
              type="text"
              className="questions-panel-other-input"
              placeholder="自由に入力してください"
              value={currentAnswer.otherText}
              onChange={(e) => handleOtherTextChange(currentQuestion.id, e.target.value)}
              autoFocus
            />
          )}
        </div>
      </div>

      <div className="questions-panel-actions">
        {onCancel && (
          <button className="questions-panel-btn cancel" onClick={onCancel}>
            スキップ
          </button>
        )}
        <button
          className="questions-panel-btn submit"
          onClick={handleSubmit}
          disabled={!isAllValid}
          title={!isAllValid ? '全ての質問に回答してください' : undefined}
        >
          {hasMultiple && !isCurrentValid && currentIndex < questions.length - 1
            ? '次へ'
            : '回答する'}
        </button>
      </div>
    </div>
  );
}