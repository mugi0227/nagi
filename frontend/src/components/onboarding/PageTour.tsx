import Joyride from 'react-joyride';
import type { CallBackProps } from 'react-joyride';
import { useTheme } from '../../context/ThemeContext';
import type { TourStep } from '../../tours/types';
import './PageTour.css';

interface PageTourProps {
  run: boolean;
  steps: TourStep[];
  stepIndex: number;
  onCallback: (data: CallBackProps) => void;
}

export function PageTour({ run, steps, stepIndex, onCallback }: PageTourProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (steps.length === 0) return null;

  return (
    <Joyride
      run={run}
      steps={steps}
      stepIndex={stepIndex}
      callback={onCallback}
      continuous
      showSkipButton
      showProgress
      scrollToFirstStep
      scrollOffset={80}
      disableOverlayClose
      disableScrollParentFix
      floaterProps={{
        disableAnimation: true,
      }}
      locale={{
        back: '戻る',
        close: '閉じる',
        last: '完了',
        next: '次へ',
        open: '開く',
        skip: 'スキップ',
      }}
      styles={{
        options: {
          arrowColor: isDark ? '#1e293b' : '#ffffff',
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          overlayColor: isDark
            ? 'rgba(0, 0, 0, 0.6)'
            : 'rgba(15, 23, 42, 0.4)',
          primaryColor: '#0ea5e9',
          textColor: isDark ? '#f8fafc' : '#334155',
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 16,
          padding: '20px 24px',
          maxWidth: 380,
          boxShadow: isDark
            ? '0 20px 60px rgba(0, 0, 0, 0.6)'
            : '0 20px 60px rgba(148, 163, 184, 0.35)',
        },
        tooltipTitle: {
          fontSize: '1.0625rem',
          fontWeight: 700,
          marginBottom: 8,
        },
        tooltipContent: {
          fontSize: '0.875rem',
          lineHeight: 1.6,
          padding: '8px 0',
        },
        buttonNext: {
          backgroundColor: '#0ea5e9',
          borderRadius: 9999,
          padding: '8px 20px',
          fontSize: '0.8125rem',
          fontWeight: 600,
        },
        buttonBack: {
          color: isDark ? '#94a3b8' : '#64748b',
          fontSize: '0.8125rem',
        },
        buttonSkip: {
          color: '#94a3b8',
          fontSize: '0.8125rem',
        },
        spotlight: {
          borderRadius: 12,
        },
      }}
    />
  );
}
