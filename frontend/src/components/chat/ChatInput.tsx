import {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
  ChangeEvent,
  ClipboardEvent,
} from 'react';
import { FaMicrophone, FaPaperPlane, FaImage, FaXmark, FaStop } from 'react-icons/fa6';
import { ApiError } from '../../api/client';
import { chatApi } from '../../api/chat';
import { ModelSelector } from './ModelSelector';
import './ChatInput.css';

interface ChatInputProps {
  onSend: (
    message: string,
    imageBase64?: string,
    audioBase64?: string,
    audioMimeType?: string,
  ) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  externalImage?: string | null;
  onImageClear?: () => void;
  initialValue?: string | null;
  onInitialValueConsumed?: () => void;
  selectedModel?: string;
  onModelChange?: (model?: string) => void;
}

const MAX_HISTORY = 50;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_AUDIO_SIZE = 10 * 1024 * 1024;
const PTT_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('audio_read_failed'));
    reader.readAsDataURL(blob);
  });

const getVoiceInputErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    const data = error.data;
    if (data && typeof data === 'object' && 'detail' in data) {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === 'string' && detail.trim()) {
        return `Voice transcription failed: ${detail}`;
      }
    }
    return `Voice transcription failed: HTTP ${error.status}`;
  }
  if (error instanceof Error && error.message.trim()) {
    return `Voice transcription failed: ${error.message}`;
  }
  return 'Voice transcription failed.';
};

const resolveSpeechLanguage = (languageHint?: string): string => {
  const raw = String(languageHint || '').trim();
  if (!raw) {
    return 'ja-JP';
  }
  const normalized = raw.replace('_', '-');
  const lower = normalized.toLowerCase();
  if (lower === 'ja') {
    return 'ja-JP';
  }
  if (lower === 'en') {
    return 'en-US';
  }
  return normalized;
};

export function ChatInput({
  onSend,
  onCancel,
  disabled,
  isStreaming,
  externalImage,
  onImageClear,
  initialValue,
  onInitialValueConsumed,
  selectedModel,
  onModelChange,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempInput, setTempInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const effectiveImage = externalImage ?? selectedImage;
  const hasExternalImage = Boolean(externalImage);
  const isPttSupported =
    typeof navigator !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);

  const clearComposer = useCallback(() => {
    setInput('');
    setSelectedImage(null);
    if (hasExternalImage && onImageClear) {
      onImageClear();
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [hasExternalImage, onImageClear]);

  const releaseMediaStream = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream) {
      return;
    }
    stream.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    if (!isRecording) {
      return;
    }
    setIsRecording(false);
    try {
      mediaRecorderRef.current?.stop();
    } catch (error) {
      console.error('Failed to stop recorder:', error);
      releaseMediaStream();
    }
  }, [isRecording, releaseMediaStream]);

  const appendTranscriptionToInput = useCallback((transcription: string) => {
    const normalized = transcription.trim();
    if (!normalized) {
      return;
    }
    setInput((prev) => {
      if (!prev.trim()) {
        return normalized;
      }
      const separator = prev.endsWith('\n') || prev.endsWith(' ') ? '' : '\n';
      return `${prev}${separator}${normalized}`;
    });
    window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    }, 0);
  }, []);

  const startRecording = useCallback(async () => {
    if (!isPttSupported || isRecording || isTranscribing || disabled || isStreaming) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType =
        PTT_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        void (async () => {
          setIsTranscribing(true);
          try {
            const blobType = recorder.mimeType || mimeType || 'audio/webm';
            const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
            audioChunksRef.current = [];
            releaseMediaStream();

            if (audioBlob.size === 0) {
              return;
            }
            if (audioBlob.size > MAX_AUDIO_SIZE) {
              alert('Voice input is too large. Please keep it shorter.');
              return;
            }

            const audioBase64 = await blobToDataUrl(audioBlob);
            const response = await chatApi.transcribeAudio({
              audio_base64: audioBase64,
              audio_mime_type: blobType,
              audio_language: resolveSpeechLanguage(navigator.language),
            });
            appendTranscriptionToInput(response.transcription);
          } catch (error) {
            console.error('Failed to process recorded audio:', error);
            alert(getVoiceInputErrorMessage(error));
          } finally {
            setIsTranscribing(false);
          }
        })();
      };

      recorder.onerror = (event) => {
        console.error('Audio recorder error:', event);
        releaseMediaStream();
        setIsRecording(false);
        setIsTranscribing(false);
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone access denied or unavailable:', error);
      alert('Microphone access failed. Please check browser permission settings.');
      releaseMediaStream();
      setIsRecording(false);
      setIsTranscribing(false);
    }
  }, [
    appendTranscriptionToInput,
    disabled,
    isPttSupported,
    isRecording,
    isTranscribing,
    isStreaming,
    releaseMediaStream,
  ]);

  useEffect(() => {
    if (!initialValue) {
      return;
    }
    setInput(initialValue);
    onInitialValueConsumed?.();
    window.setTimeout(() => textareaRef.current?.focus(), 100);
  }, [initialValue, onInitialValueConsumed]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const chatWindow = textarea.closest('.chat-window');
    const maxHeight = chatWindow
      ? Math.max(chatWindow.clientHeight / 3, 120)
      : 120;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [input]);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // no-op
      }
      releaseMediaStream();
    };
  }, [releaseMediaStream]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (isRecording) {
        event.preventDefault();
        stopRecording();
        return;
      }
      if (isStreaming && onCancel) {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isRecording, isStreaming, onCancel, stopRecording]);

  const pushHistory = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setInputHistory((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)];
      return next.slice(0, MAX_HISTORY);
    });
  };

  const handleSubmit = () => {
    if (disabled || isRecording || isTranscribing || isStreaming) {
      return;
    }
    if (!input.trim() && !effectiveImage) {
      return;
    }
    pushHistory(input);
    setHistoryIndex(-1);
    setTempInput('');
    onSend(input.trim(), effectiveImage || undefined);
    clearComposer();
  };

  const processImageFile = (file: File) => {
    if (file.size > MAX_IMAGE_SIZE) {
      alert('Image file must be 5MB or smaller.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (hasExternalImage && onImageClear) {
      onImageClear();
    }
    processImageFile(file);
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) {
      return;
    }

    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) {
      return;
    }

    const pastedText = event.clipboardData?.getData('text/plain');
    if (!pastedText) {
      event.preventDefault();
    }

    const file = imageItem.getAsFile();
    if (!file) {
      return;
    }
    if (hasExternalImage && onImageClear) {
      onImageClear();
    }
    processImageFile(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    if (hasExternalImage && onImageClear) {
      onImageClear();
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      if (isRecording) {
        event.preventDefault();
        stopRecording();
        return;
      }
      if (isStreaming && onCancel) {
        event.preventDefault();
        onCancel();
      }
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
      return;
    }

    if (event.key === 'ArrowUp' && inputHistory.length > 0) {
      const textarea = textareaRef.current;
      const cursorAtStart =
        textarea !== null && textarea.selectionStart === 0 && textarea.selectionEnd === 0;
      const isEmpty = input === '';
      if (cursorAtStart || isEmpty) {
        event.preventDefault();
        if (historyIndex === -1) {
          setTempInput(input);
        }
        const nextIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
        setHistoryIndex(nextIndex);
        setInput(inputHistory[nextIndex]);
      }
      return;
    }

    if (event.key === 'ArrowDown' && historyIndex >= 0) {
      const textarea = textareaRef.current;
      const cursorAtEnd = textarea !== null
        && textarea.selectionStart === textarea.value.length
        && textarea.selectionEnd === textarea.value.length;
      if (cursorAtEnd) {
        event.preventDefault();
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        if (nextIndex === -1) {
          setInput(tempInput);
        } else {
          setInput(inputHistory[nextIndex]);
        }
      }
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  return (
    <div className="chat-input-container">
      {onModelChange && (
        <ModelSelector selectedModel={selectedModel} onModelChange={onModelChange} />
      )}
      {effectiveImage && (
        <div className="image-preview">
          <img src={effectiveImage} alt="Selected" />
          <button className="remove-image-btn" onClick={handleRemoveImage} title="Remove image">
            <FaXmark />
          </button>
        </div>
      )}
      <div className="chat-input-area">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />
        <button
          className="input-action-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isRecording || isTranscribing || Boolean(isStreaming)}
          title="Attach image"
        >
          <FaImage />
        </button>
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isRecording
                ? 'Listening...'
                : isTranscribing
                  ? 'Thinking... transcribing speech to text...'
                : 'Type a message... (Shift+Enter for newline)'
            }
            disabled={disabled || isRecording || isTranscribing}
            rows={1}
          />
        </div>
        <button
          className={`mic-btn ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
          onClick={handleMicClick}
          title={
            isPttSupported
              ? isRecording
                ? 'Recording... click to stop'
                : isTranscribing
                  ? 'Transcribing voice...'
                : 'Click to start voice input'
              : 'Voice input is not supported in this browser'
          }
          disabled={disabled || isTranscribing || Boolean(isStreaming) || !isPttSupported}
        >
          {isRecording ? <FaStop /> : <FaMicrophone />}
        </button>
        {isStreaming ? (
          <button className="send-btn stop-btn" onClick={onCancel} title="Stop (Esc)">
            <FaStop />
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={handleSubmit}
            disabled={(!input.trim() && !effectiveImage) || disabled || isRecording || isTranscribing}
            title="Send"
          >
            <FaPaperPlane />
          </button>
        )}
      </div>
    </div>
  );
}
