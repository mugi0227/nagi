import { useState, useCallback } from 'react';
import { FaPlay, FaPause, FaStepForward, FaStepBackward, FaStop, FaClock, FaExclamationTriangle, FaTimes, FaUndo } from 'react-icons/fa';
import type { MeetingAgendaItem } from '../../api/types';
import type { MeetingSession } from '../../types/session';
import { useMeetingTimer } from '../../contexts/MeetingTimerContext';
import './MeetingInProgress.css';

interface MeetingInProgressProps {
    session: MeetingSession;
    agendaItems: MeetingAgendaItem[];
    meetingTitle: string;
    meetingDate: string;
    onNextAgenda: () => void;
    onPrevAgenda: () => void;
    onEndMeeting: () => void;
    onUpdateTranscript: (transcript: string) => void;
    onReset?: () => void;
    onClose?: () => void;
}

export function MeetingInProgress({
    session,
    agendaItems,
    meetingTitle,
    meetingDate,
    onNextAgenda,
    onPrevAgenda,
    onEndMeeting,
    onUpdateTranscript,
    onReset,
    onClose,
}: MeetingInProgressProps) {
    const currentIndex = session.current_agenda_index ?? 0;
    const currentAgenda = agendaItems[currentIndex];
    const isLastAgenda = currentIndex >= agendaItems.length - 1;
    const isFirstAgenda = currentIndex <= 0;

    // Use global timer context for synchronized state
    const {
        elapsedSeconds,
        isPaused,
        pauseTimer,
        resumeTimer,
        resetTimer,
    } = useMeetingTimer();

    const [transcript, setTranscript] = useState(session.transcript || '');

    // Calculate duration for current agenda in seconds
    const durationSeconds = (currentAgenda?.duration_minutes || 5) * 60;
    const remainingSeconds = durationSeconds - elapsedSeconds;
    const isOvertime = remainingSeconds < 0;
    const isWarning = remainingSeconds <= 120 && remainingSeconds > 0; // 2 minutes warning

    const formatTime = (seconds: number) => {
        const absSeconds = Math.abs(seconds);
        const mins = Math.floor(absSeconds / 60);
        const secs = absSeconds % 60;
        const sign = seconds < 0 ? '-' : '';
        return `${sign}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleTranscriptChange = useCallback((value: string) => {
        setTranscript(value);
    }, []);

    const handleTranscriptBlur = useCallback(() => {
        onUpdateTranscript(transcript);
    }, [transcript, onUpdateTranscript]);

    const handleReset = useCallback(() => {
        resetTimer();
        resumeTimer();
        onReset?.();
    }, [resetTimer, resumeTimer, onReset]);

    const togglePause = useCallback(() => {
        if (isPaused) {
            resumeTimer();
        } else {
            pauseTimer();
        }
    }, [isPaused, pauseTimer, resumeTimer]);

    return (
        <div className="meeting-modal-overlay">
            <div className="meeting-modal">
                {/* Header */}
                <div className="meeting-modal-header">
                    <div className="meeting-modal-title-section">
                        <h2 className="meeting-modal-title">{meetingTitle}</h2>
                        <span className="meeting-modal-date">{meetingDate}</span>
                    </div>
                    <div className="meeting-modal-header-actions">
                        <span className="meeting-status-indicator">
                            <span className="pulse-dot"></span>
                            ミーティング中
                        </span>
                        {onClose && (
                            <button className="modal-close-btn" onClick={onClose} title="最小化">
                                <FaTimes />
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Content - Two Column Layout */}
                <div className="meeting-modal-content">
                    {/* Left Column - Timer & Current Agenda */}
                    <div className="meeting-modal-left">
                        {/* Timer Section */}
                        <div className={`meeting-timer-section ${isOvertime ? 'overtime' : isWarning ? 'warning' : ''}`}>
                            <div className="meeting-timer-display">
                                <FaClock className="timer-icon" />
                                <span className="timer-value">{formatTime(remainingSeconds)}</span>
                                {isOvertime && <span className="overtime-label">超過</span>}
                            </div>
                            <div className="timer-controls">
                                <button
                                    className="timer-btn"
                                    onClick={togglePause}
                                    title={isPaused ? '再開' : '一時停止'}
                                >
                                    {isPaused ? <FaPlay /> : <FaPause />}
                                </button>
                                <button
                                    className="timer-btn reset"
                                    onClick={handleReset}
                                    title="リセット"
                                >
                                    <FaUndo />
                                </button>
                            </div>
                            {isWarning && !isOvertime && (
                                <div className="timer-warning">
                                    <FaExclamationTriangle /> 残り2分以内です
                                </div>
                            )}
                        </div>

                        {/* Current Agenda */}
                        <div className="current-agenda-section">
                            <div className="current-agenda-header">
                                <span className="agenda-badge">議題 {currentIndex + 1} / {agendaItems.length}</span>
                                {currentAgenda?.duration_minutes && (
                                    <span className="agenda-duration">{currentAgenda.duration_minutes}分</span>
                                )}
                            </div>
                            <h3 className="current-agenda-title">
                                {currentAgenda?.title || '議題なし'}
                            </h3>
                            {currentAgenda?.description && (
                                <p className="current-agenda-description">{currentAgenda.description}</p>
                            )}
                        </div>

                        {/* Navigation Controls */}
                        <div className="agenda-navigation">
                            <button
                                className="nav-btn prev"
                                onClick={onPrevAgenda}
                                disabled={isFirstAgenda}
                                title="前の議題"
                            >
                                <FaStepBackward /> 前の議題
                            </button>
                            <button
                                className="nav-btn next"
                                onClick={onNextAgenda}
                                disabled={isLastAgenda}
                                title="次の議題"
                            >
                                次の議題 <FaStepForward />
                            </button>
                        </div>

                        {/* Agenda List */}
                        <div className="agenda-list-mini">
                            <h4>アジェンダ一覧</h4>
                            <div className="agenda-items-mini">
                                {agendaItems.map((item, index) => (
                                    <div
                                        key={item.id}
                                        className={`agenda-item-mini ${index === currentIndex ? 'active' : ''} ${index < currentIndex ? 'completed' : ''}`}
                                    >
                                        <span className="item-number">{index + 1}</span>
                                        <span className="item-title">{item.title}</span>
                                        {item.duration_minutes && (
                                            <span className="item-duration">{item.duration_minutes}分</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Transcript */}
                    <div className="meeting-modal-right">
                        <div className="transcript-section">
                            <h4>議事録メモ</h4>
                            <textarea
                                className="transcript-input"
                                value={transcript}
                                onChange={(e) => handleTranscriptChange(e.target.value)}
                                onBlur={handleTranscriptBlur}
                                placeholder="会議中のメモをここに入力してください...

・決定事項
・アクションアイテム
・議論のポイント"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="meeting-modal-footer">
                    <button className="end-meeting-btn" onClick={onEndMeeting}>
                        <FaStop /> 会議を終了
                    </button>
                </div>
            </div>
        </div>
    );
}
