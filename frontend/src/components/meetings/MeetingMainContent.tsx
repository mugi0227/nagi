import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FaMagic, FaPlay } from 'react-icons/fa';
import { meetingAgendaApi } from '../../api/meetingAgenda';
import { RecurringMeeting } from '../../api/types';

interface MeetingMainContentProps {
    projectId: string;
    selectedDate: Date | null;
    selectedMeeting: RecurringMeeting | null;
}

export function MeetingMainContent({
    projectId,
    selectedDate,
    selectedMeeting
}: MeetingMainContentProps) {
    const getDateStr = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const dateStr = selectedDate ? getDateStr(selectedDate) : '';

    const { data: agendaItems = [], isLoading: isAgendaLoading } = useQuery({
        queryKey: ['meeting-agendas', selectedMeeting?.id, dateStr],
        queryFn: () => meetingAgendaApi.listByMeeting(selectedMeeting!.id, dateStr),
        enabled: !!selectedMeeting && !!selectedDate && !!dateStr,
    });

    const [mode, setMode] = useState<'PREPARATION' | 'MEETING' | 'ARCHIVE'>('PREPARATION');

    useEffect(() => {
        if (!selectedMeeting || !selectedDate) {
            return;
        }

        const dateStr = getDateStr(selectedDate);
        const today = new Date();
        const todayStr = getDateStr(today);

        if (dateStr < todayStr) {
            setMode('ARCHIVE');
        } else if (dateStr === todayStr) {
            setMode('PREPARATION');
        } else {
            setMode('PREPARATION');
        }
    }, [selectedMeeting, selectedDate]);

    const handleGenerateDraft = async () => {
        if (!selectedMeeting || !selectedDate) return;

        const dateStr = getDateStr(selectedDate);
        const prompt = `
定例ミーティング「${selectedMeeting.title}」(${dateStr}) のアジェンダドラフトを作成してください。
プロジェクトID: ${projectId}
ミーティングID: ${selectedMeeting.id}

以下の手順で実行してください：
1. \`fetch_meeting_context\` ツールを使って、プロジェクトとミーティングのコンテキストを取得してください。
   **必ず meeting_id も指定してください。** これにより、ミーティングの所要時間や説明も取得できます。
   パラメータ例: project_id="${projectId}", meeting_id="${selectedMeeting.id}", start_date="(1週間前)", end_date="${dateStr}"
2. 取得したプロジェクト目標、キーポイント、チェックイン状況、タスク進捗を基に、議論すべきアジェンダ項目を特定してください。
3. まずはチャットでアジェンダ案を提示し、ユーザーに確認を求めてください。
   **注意: まだ \`add_agenda_item\` ツールは実行しないでください。ユーザーの承認を得てから実行してください。**
4. ユーザーが承認('Yes'など)したら、\`add_agenda_item\` ツールを使ってデータベースに追加してください。
        `.trim();

        const event = new CustomEvent('secretary:chat-open', { detail: { message: prompt } });
        window.dispatchEvent(event);
    };

    if (!selectedDate || !selectedMeeting) {
        return (
            <div className="meetings-main justify-center items-center">
                <div className="empty-state">
                    <p>左側のリストからミーティングを選択してください。</p>
                </div>
            </div>
        );
    }

    return (
        <div className="meetings-main">
            <div className="meetings-main-header">
                <div className="meeting-header-info">
                    <h2>{selectedDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</h2>
                    <div className="meeting-header-meta">
                        <span>{selectedMeeting.title}</span>
                        <span>{selectedMeeting.start_time}~</span>
                    </div>
                </div>
                <div className={`meeting-status-badge ${mode === 'MEETING' ? 'status-meeting' : 'status-preparation'}`}>
                    {mode === 'MEETING' ? 'ミーティング中' : '準備中'}
                </div>
            </div>

            <div className="meetings-main-scroll">
                {mode === 'PREPARATION' && (
                    <div className="agenda-section">
                        <div className="agenda-actions">
                            <button className="btn-ai-generate" onClick={handleGenerateDraft}>
                                <FaMagic /> AIでドラフト作成
                            </button>
                        </div>

                        <div className="agenda-list">
                            {agendaItems.length === 0 ? (
                                <div className="empty-state">
                                    <p>アジェンダがまだありません。「AIでドラフト作成」を試すか、手動で追加してください。</p>
                                </div>
                            ) : (
                                agendaItems.map((item) => (
                                    <div key={item.id} className="agenda-item">
                                        <input
                                            type="checkbox"
                                            className="agenda-checkbox"
                                            checked={item.is_completed}
                                            onChange={() => { }}
                                        />
                                        <div className="agenda-content">
                                            <div className="agenda-title">
                                                {item.title}
                                                {item.duration_minutes && (
                                                    <span className="ml-2 text-sm text-gray-500 font-normal">
                                                        ({item.duration_minutes} min)
                                                    </span>
                                                )}
                                            </div>
                                            {item.description && <div className="agenda-desc">{item.description}</div>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {mode === 'MEETING' && (
                    <div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                            <div className="font-bold text-yellow-800 flex items-center gap-2">
                                <FaPlay className="text-sm" /> 進行中
                            </div>
                            <div className="text-sm text-yellow-700 mt-1">
                                現在のアジェンダアイテムを表示・タイマー機能などをここに実装予定
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
