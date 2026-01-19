/**
 * Floating meeting timer widget that persists across pages
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaClock, FaPlay, FaPause, FaExpand, FaTimes, FaGripVertical, FaExternalLinkAlt } from 'react-icons/fa';
import { useMeetingTimer } from '../../contexts/MeetingTimerContext';
import './FloatingMeetingTimer.css';

interface FloatingMeetingTimerProps {
    onOpenModal?: () => void;
}

interface Position {
    x: number;
    y: number;
}

const STORAGE_KEY = 'floating-timer-position';

function loadPosition(): Position | null {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch {
        // Ignore parse errors
    }
    return null;
}

function savePosition(position: Position): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
    } catch {
        // Ignore storage errors
    }
}

export function FloatingMeetingTimer({ onOpenModal }: FloatingMeetingTimerProps) {
    const navigate = useNavigate();
    const {
        session,
        agendaItems,
        meetingTitle,
        projectId,
        elapsedSeconds,
        isPaused,
        isWidgetVisible,
        pauseTimer,
        resumeTimer,
        hideWidget,
        showModal,
    } = useMeetingTimer();

    // Use context's showModal if no external handler provided
    const handleOpenModal = onOpenModal ?? showModal;

    // Navigate to meeting page
    const handleGoToMeetingPage = useCallback(() => {
        if (projectId) {
            navigate(`/projects/${projectId}/v2?tab=meetings`);
        }
    }, [projectId, navigate]);

    // Draggable state
    const [position, setPosition] = useState<Position | null>(loadPosition);
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ mouseX: number; mouseY: number; elemX: number; elemY: number } | null>(null);

    // Handle drag start
    const handleDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const element = dragRef.current;
        if (!element) return;

        const rect = element.getBoundingClientRect();
        dragStartRef.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            elemX: rect.left,
            elemY: rect.top,
        };
        setIsDragging(true);
    }, []);

    // Handle dragging
    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!dragStartRef.current) return;

            const deltaX = e.clientX - dragStartRef.current.mouseX;
            const deltaY = e.clientY - dragStartRef.current.mouseY;

            const newX = dragStartRef.current.elemX + deltaX;
            const newY = dragStartRef.current.elemY + deltaY;

            // Constrain to viewport
            const maxX = window.innerWidth - 280; // widget width
            const maxY = window.innerHeight - 150; // approximate widget height

            const constrainedX = Math.max(0, Math.min(maxX, newX));
            const constrainedY = Math.max(0, Math.min(maxY, newY));

            setPosition({ x: constrainedX, y: constrainedY });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            if (position) {
                savePosition(position);
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, position]);

    if (!session || session.status !== 'IN_PROGRESS' || !isWidgetVisible) {
        return null;
    }

    const currentIndex = session.current_agenda_index ?? 0;
    const currentAgenda = agendaItems[currentIndex];
    const durationSeconds = (currentAgenda?.duration_minutes || 5) * 60;
    const remainingSeconds = durationSeconds - elapsedSeconds;
    const isOvertime = remainingSeconds < 0;
    const isWarning = remainingSeconds <= 120 && remainingSeconds > 0;

    const formatTime = (seconds: number) => {
        const absSeconds = Math.abs(seconds);
        const mins = Math.floor(absSeconds / 60);
        const secs = absSeconds % 60;
        const sign = seconds < 0 ? '-' : '';
        return `${sign}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Build position style
    const positionStyle: React.CSSProperties = position
        ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
        : {};

    return (
        <div
            ref={dragRef}
            className={`floating-meeting-timer ${isOvertime ? 'overtime' : isWarning ? 'warning' : ''} ${isDragging ? 'dragging' : ''}`}
            style={positionStyle}
        >
            <div className="floating-timer-header">
                <div
                    className="floating-drag-handle"
                    onMouseDown={handleDragStart}
                    title="ドラッグして移動"
                >
                    <FaGripVertical />
                </div>
                <span className="floating-timer-title">{meetingTitle}</span>
                <button className="floating-close-btn" onClick={hideWidget} title="ウィジェットを閉じる">
                    <FaTimes />
                </button>
            </div>
            <div className="floating-timer-content">
                <div className="floating-timer-display">
                    <FaClock className="floating-timer-icon" />
                    <span className="floating-timer-value">{formatTime(remainingSeconds)}</span>
                    {isOvertime && <span className="floating-overtime-label">超過</span>}
                </div>
                <div className="floating-agenda-info">
                    <span className="floating-agenda-number">{currentIndex + 1}/{agendaItems.length}</span>
                    <span className="floating-agenda-title">{currentAgenda?.title || '---'}</span>
                </div>
            </div>
            <div className="floating-timer-actions">
                <button
                    className="floating-action-btn"
                    onClick={isPaused ? resumeTimer : pauseTimer}
                    title={isPaused ? '再開' : '一時停止'}
                >
                    {isPaused ? <FaPlay /> : <FaPause />}
                </button>
                <button
                    className="floating-action-btn expand"
                    onClick={handleOpenModal}
                    title="会議画面を開く"
                >
                    <FaExpand />
                </button>
                {projectId && (
                    <button
                        className="floating-action-btn go-to-page"
                        onClick={handleGoToMeetingPage}
                        title="ミーティングページへ"
                    >
                        <FaExternalLinkAlt />
                    </button>
                )}
            </div>
        </div>
    );
}
