import { useState } from 'react';
import { useCaptures } from '../../hooks/useCaptures';
import { useTaskModal } from '../../hooks/useTaskModal';
import { useTimezone } from '../../hooks/useTimezone';
import './InboxWidget.css';
import type { Capture } from '../../api/types';
import { formatDate } from '../../utils/dateTime';

export function InboxWidget() {
    const { unprocessedCaptures: allCaptures, isLoading, error, deleteCapture, processCapture, analyzeCapture, isAnalyzing } = useCaptures();
    const timezone = useTimezone();

    const [analyzingId, setAnalyzingId] = useState<string | null>(null);

    // useTaskModal for task creation and detail modal
    const taskModal = useTaskModal({
        tasks: [],
        onCreateTask: async (data) => {
            // Mark capture as processed after task creation
            if (data.source_capture_id) {
                processCapture(data.source_capture_id);
            }
        },
    });

    const handleAnalyze = async (captureId: string) => {
        setAnalyzingId(captureId);
        try {
            const result = await analyzeCapture(captureId);
            // Create task with analyzed data and open detail modal for inline editing
            await taskModal.openCreateForm({
                ...result,
                source_capture_id: captureId,
            });
        } catch (e) {
            console.error(e);
            alert('解析に失敗しました');
        } finally {
            setAnalyzingId(null);
        }
    };

    // Filter out regular chat messages, only show Extension captures
    const unprocessedCaptures = allCaptures.filter(c => {
        if (c.content_type === 'IMAGE') return true;
        if (c.content_type === 'TEXT' && c.raw_text) {
            try {
                const data = JSON.parse(c.raw_text);
                return data.type === 'EXT_CAPTURE';
            } catch {
                return false;
            }
        }
        return false;
    });

    if (isLoading) {
        return <div className="inbox-widget loading">Loading inbox...</div>;
    }

    if (error) {
        return <div className="inbox-widget error">Failed to load inbox</div>;
    }

    if (unprocessedCaptures.length === 0) {
        // Don't show anything if empty (Clean Dashboard Philosophy)
        return null;
    }

    return (
        <div className="inbox-widget">
            <div className="widget-header">
                <h3>Inbox (Unprocessed)</h3>
                <span className="badge">{unprocessedCaptures.length}</span>
            </div>

            <div className="capture-list">
                {unprocessedCaptures.map((capture) => (
                    <div key={capture.id} className="capture-item">
                        <div className="capture-icon">
                            {capture.content_type === 'IMAGE' ? '📸' : '📝'}
                        </div>

                        <div className="capture-content">
                            <div className="capture-meta">
                                {formatDate(
                                    capture.created_at,
                                    { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' },
                                    timezone,
                                )}
                            </div>
                            <div className="capture-text">
                                {getDisplayText(capture)}
                            </div>
                        </div>

                        <div className="capture-actions">
                            <button
                                className="action-btn process"
                                onClick={() => handleAnalyze(capture.id)}
                                disabled={isAnalyzing && analyzingId === capture.id}
                                title="タスク化 (AI解析)"
                            >
                                {isAnalyzing && analyzingId === capture.id ? '⏳' : '✨'}
                            </button>
                            <button
                                className="action-btn delete"
                                onClick={() => deleteCapture(capture.id)}
                                title="削除"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {taskModal.renderModals()}
        </div>
    );
}

function getDisplayText(capture: Capture) {
    if (capture.content_type === 'TEXT' && capture.raw_text) {
        try {
            // Chrome Extension sends JSON in raw_text
            const data = JSON.parse(capture.raw_text);
            return data.title || data.url || capture.raw_text;
        } catch {
            return capture.raw_text;
        }
    }
    return capture.content_url || 'Captured Item';
}
