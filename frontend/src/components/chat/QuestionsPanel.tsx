import { useState, useCallback, useRef } from 'react';
import { FaCircleQuestion, FaChevronLeft, FaChevronRight } from 'react-icons/fa6';
import type { PendingQuestion } from '../../api/types';
import './QuestionsPanel.css';

const OTHER_OPTION = 'その他（自由入力）';

interface QuestionState {
  selectedOptions: string[];
  otherText: string;
  freeText: string; // for free-text questions (no options)
}

interface QuestionsPanelProps {
  questions: PendingQuestion[];
  context?: string;
  onSubmit: (answers: string) => void;
  onCancel?: () => void;
}

/** Single question, ≤3 options, single-select → compact button UI */
function isSimpleConfirmation(questions: PendingQuestion[]): boolean {
  return (
    questions.length === 1 &&
    questions[0].options.length > 0 &&
    questions[0].options.length <= 3 &&
    !questions[0].allow_multiple
  );
}

/** Single question, no options → free-text input UI */
function isFreeTextOnly(questions: PendingQuestion[]): boolean {
  return questions.length === 1 && questions[0].options.length === 0;
}

/** Question has no predefined options */
function isFreeTextQuestion(q: PendingQuestion): boolean {
  return q.options.length === 0;
}

export function QuestionsPanel({ questions, context, onSubmit, onCancel }: QuestionsPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [simpleOtherText, setSimpleOtherText] = useState('');
  const [declineOption, setDeclineOption] = useState<string | null>(null);
  const [declineText, setDeclineText] = useState('');
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [answers, setAnswers] = useState<Record<string, QuestionState>>(() => {
    const initial: Record<string, QuestionState> = {};
    questions.forEach((q) => {
      initial[q.id] = { selectedOptions: [], otherText: '', freeText: '' };
    });
    return initial;
  });

  const formatAnswersAsText = useCallback(
    (overrideAnswers?: Record<string, QuestionState>): string => {
      const data = overrideAnswers ?? answers;
      const lines: string[] = [];

      questions.forEach((q) => {
        const answer = data[q.id];

        // Free-text question
        if (isFreeTextQuestion(q)) {
          lines.push(`${q.question}: ${answer.freeText.trim() || '（未回答）'}`);
          return;
        }

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
    },
    [answers, questions],
  );

  if (questions.length === 0) {
    return null;
  }

  // ============================================
  // Mode 1: Simple confirmation (1 question, ≤3 options, single-select)
  // ============================================
  if (isSimpleConfirmation(questions)) {
    const question = questions[0];
    const isBinaryChoice = question.options.length === 2;

    const handleSimpleSubmit = (option: string) => {
      onSubmit(`${question.question}: ${option}`);
    };

    const handleDeclineSubmit = () => {
      if (!declineOption) return;
      const text = declineText.trim();
      if (text) {
        onSubmit(`${question.question}: ${declineOption}。${text}`);
      } else {
        onSubmit(`${question.question}: ${declineOption}`);
      }
    };

    const handleSimpleClick = (option: string, index: number) => {
      // For binary choices, the second option opens a free text input
      if (isBinaryChoice && index === 1) {
        setDeclineOption(option);
        setDeclineText('');
      } else {
        handleSimpleSubmit(option);
      }
    };

    if (showOtherInput) {
      return (
        <div className="questions-panel questions-panel--simple">
          <div className="questions-panel-simple-body">
            <div className="questions-panel-simple-question">{question.question}</div>
            <div className="questions-panel-simple-other-area">
              <input
                type="text"
                className="questions-panel-simple-other-input"
                placeholder="自由に入力してください"
                value={simpleOtherText}
                onChange={(e) => setSimpleOtherText(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && simpleOtherText.trim()) {
                    handleSimpleSubmit(simpleOtherText.trim());
                  }
                }}
              />
              <button
                className="questions-panel-simple-send"
                onClick={() => handleSimpleSubmit(simpleOtherText.trim())}
                disabled={!simpleOtherText.trim()}
              >
                送信
              </button>
            </div>
            <div className="questions-panel-simple-footer">
              <button
                className="questions-panel-simple-other-link"
                onClick={() => setShowOtherInput(false)}
              >
                選択肢に戻る
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Decline option selected: show free text input with the option to add context
    if (declineOption) {
      return (
        <div className="questions-panel questions-panel--simple">
          <div className="questions-panel-simple-body">
            <div className="questions-panel-simple-question">{question.question}</div>
            <div className="questions-panel-decline-selected">
              <span className="questions-panel-decline-tag">{declineOption}</span>
            </div>
            <div className="questions-panel-simple-other-area">
              <input
                type="text"
                className="questions-panel-simple-other-input"
                placeholder="理由や代わりの提案があれば入力（任意）"
                value={declineText}
                onChange={(e) => setDeclineText(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleDeclineSubmit();
                  }
                }}
              />
              <button
                className="questions-panel-simple-send"
                onClick={handleDeclineSubmit}
              >
                送信
              </button>
            </div>
            <div className="questions-panel-simple-footer">
              <button
                className="questions-panel-simple-other-link"
                onClick={() => setDeclineOption(null)}
              >
                選択肢に戻る
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="questions-panel questions-panel--simple">
        <div className="questions-panel-simple-body">
          {context && <div className="questions-panel-simple-context">{context}</div>}
          <div className="questions-panel-simple-question">{question.question}</div>
          <div className="questions-panel-simple-buttons">
            {question.options.map((option, index) => (
              <button
                key={option}
                className="questions-panel-simple-btn"
                onClick={() => handleSimpleClick(option, index)}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="questions-panel-simple-footer">
            <button
              className="questions-panel-simple-other-link"
              onClick={() => setShowOtherInput(true)}
            >
              その他の回答を入力
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // Mode 2: Free-text only (1 question, no options)
  // ============================================
  if (isFreeTextOnly(questions)) {
    const question = questions[0];
    const freeText = answers[question.id]?.freeText ?? '';

    const handleFreeTextSubmit = () => {
      if (freeText.trim()) {
        onSubmit(`${question.question}: ${freeText.trim()}`);
      }
    };

    return (
      <div className="questions-panel questions-panel--simple">
        <div className="questions-panel-simple-body">
          {context && <div className="questions-panel-simple-context">{context}</div>}
          <div className="questions-panel-simple-question">{question.question}</div>
          <div className="questions-panel-simple-other-area">
            <input
              type="text"
              className="questions-panel-simple-other-input"
              placeholder={question.placeholder ?? '入力してください'}
              value={freeText}
              onChange={(e) =>
                setAnswers((prev) => ({
                  ...prev,
                  [question.id]: { ...prev[question.id], freeText: e.target.value },
                }))
              }
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && freeText.trim()) {
                  handleFreeTextSubmit();
                }
              }}
            />
            <button
              className="questions-panel-simple-send"
              onClick={handleFreeTextSubmit}
              disabled={!freeText.trim()}
            >
              送信
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // Mode 3: Full mode (multiple questions, many options, multi-select, or mixed)
  // ============================================
  const currentQuestion = questions[currentIndex];
  const hasMultiple = questions.length > 1;
  const isLastQuestion = currentIndex === questions.length - 1;

  const handlePrev = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1));
  };

  const handleOptionChange = (questionId: string, option: string, isMultiple: boolean) => {
    // Clear any pending auto-advance
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }

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

      const newAnswers = {
        ...prev,
        [questionId]: { ...current, selectedOptions: newSelected },
      };

      // Auto-advance for single-select (not "Other", not multi-select)
      if (!isMultiple && option !== OTHER_OPTION) {
        autoAdvanceTimer.current = setTimeout(() => {
          if (!isLastQuestion) {
            // Go to next question
            setCurrentIndex((prevIdx) => Math.min(questions.length - 1, prevIdx + 1));
          } else {
            // Last question: check if all answered, then auto-submit
            const allValid = questions.every((q) => {
              const a = newAnswers[q.id];
              if (isFreeTextQuestion(q)) return a.freeText.trim().length > 0;
              const hasSel = a.selectedOptions.length > 0;
              const validOther = a.selectedOptions.includes(OTHER_OPTION)
                ? a.otherText.trim().length > 0
                : true;
              return hasSel && validOther;
            });
            if (allValid) {
              onSubmit(formatAnswersAsText(newAnswers));
            }
          }
        }, 350);
      }

      return newAnswers;
    });
  };

  const handleOtherTextChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], otherText: text },
    }));
  };

  const handleFreeTextChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], freeText: text },
    }));
  };

  const handleSubmit = () => {
    onSubmit(formatAnswersAsText());
  };

  const isCurrentAnswered = (): boolean => {
    if (isFreeTextQuestion(currentQuestion)) {
      return answers[currentQuestion.id].freeText.trim().length > 0;
    }
    const answer = answers[currentQuestion.id];
    const hasSelection = answer.selectedOptions.length > 0;
    const hasValidOther = answer.selectedOptions.includes(OTHER_OPTION)
      ? answer.otherText.trim().length > 0
      : true;
    return hasSelection && hasValidOther;
  };

  const isAllValid = questions.every((q) => {
    const answer = answers[q.id];
    if (isFreeTextQuestion(q)) return answer.freeText.trim().length > 0;
    const hasSelection = answer.selectedOptions.length > 0;
    const hasValidOther = answer.selectedOptions.includes(OTHER_OPTION)
      ? answer.otherText.trim().length > 0
      : true;
    return hasSelection && hasValidOther;
  });

  const currentAnswer = answers[currentQuestion.id];
  const currentIsFreeText = isFreeTextQuestion(currentQuestion);

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

        {currentIsFreeText ? (
          /* Free-text input for this question */
          <div className="questions-panel-freetext">
            <input
              type="text"
              className="questions-panel-other-input"
              placeholder={currentQuestion.placeholder ?? '入力してください'}
              value={currentAnswer.freeText}
              onChange={(e) => handleFreeTextChange(currentQuestion.id, e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && currentAnswer.freeText.trim()) {
                  if (!isLastQuestion) {
                    handleNext();
                  } else if (isAllValid) {
                    handleSubmit();
                  }
                }
              }}
            />
          </div>
        ) : (
          /* Options list */
          <div className="questions-panel-options">
            {currentQuestion.options.map((option) => (
              <label key={option} className="questions-panel-option">
                <input
                  type={currentQuestion.allow_multiple ? 'checkbox' : 'radio'}
                  name={`question-${currentQuestion.id}`}
                  checked={currentAnswer.selectedOptions.includes(option)}
                  onChange={() =>
                    handleOptionChange(currentQuestion.id, option, currentQuestion.allow_multiple)
                  }
                />
                <span className="questions-panel-option-text">{option}</span>
              </label>
            ))}
            <label className="questions-panel-option">
              <input
                type={currentQuestion.allow_multiple ? 'checkbox' : 'radio'}
                name={`question-${currentQuestion.id}`}
                checked={currentAnswer.selectedOptions.includes(OTHER_OPTION)}
                onChange={() =>
                  handleOptionChange(currentQuestion.id, OTHER_OPTION, currentQuestion.allow_multiple)
                }
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
        )}
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
          {hasMultiple && !isCurrentAnswered() && !isLastQuestion ? '次へ' : '回答する'}
        </button>
      </div>
    </div>
  );
}
