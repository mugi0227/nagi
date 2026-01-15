import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent, ClipboardEvent } from 'react';
import { FaMicrophone, FaPaperPlane, FaImage, FaXmark, FaStop } from 'react-icons/fa6';
import './ChatInput.css';

interface ChatInputProps {
  onSend: (message: string, imageBase64?: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  externalImage?: string | null;
  onImageClear?: () => void;
}

const MAX_HISTORY = 50;

export function ChatInput({ onSend, onCancel, disabled, isStreaming, externalImage, onImageClear }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempInput, setTempInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const effectiveImage = externalImage ?? selectedImage;
  const hasExternalImage = Boolean(externalImage);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Global Escape key handler for cancelling stream
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isStreaming && onCancel) {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isStreaming, onCancel]);

  const handleSubmit = () => {
    if ((input.trim() || effectiveImage) && !disabled) {
      const trimmed = input.trim();
      // Add to input history
      if (trimmed) {
        setInputHistory((prev) => {
          const newHistory = [trimmed, ...prev.filter((h) => h !== trimmed)];
          return newHistory.slice(0, MAX_HISTORY);
        });
      }
      setHistoryIndex(-1);
      setTempInput('');
      onSend(trimmed, effectiveImage || undefined);
      setInput('');
      setSelectedImage(null);
      if (hasExternalImage && onImageClear) {
        onImageClear();
      }
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (hasExternalImage && onImageClear) {
        onImageClear();
      }
      processImageFile(file);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) {
      return;
    }
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) {
      return;
    }

    const pastedText = e.clipboardData?.getData('text/plain');
    if (!pastedText) {
      e.preventDefault();
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

  const processImageFile = (file: File) => {
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('画像ファイルは5MB以下にしてください');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください');
      return;
    }

    // Convert to Base64
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Escape = Cancel streaming
    if (e.key === 'Escape') {
      if (isStreaming && onCancel) {
        e.preventDefault();
        onCancel();
      }
      return;
    }

    // Enter without Shift = Submit
    // Shift+Enter = New line (default behavior)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Arrow Up = Previous history (when cursor is at start or input is empty)
    if (e.key === 'ArrowUp' && inputHistory.length > 0) {
      const textarea = textareaRef.current;
      const cursorAtStart = textarea && textarea.selectionStart === 0 && textarea.selectionEnd === 0;
      const isEmpty = input === '';

      if (cursorAtStart || isEmpty) {
        e.preventDefault();
        if (historyIndex === -1) {
          setTempInput(input);
        }
        const newIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
        setHistoryIndex(newIndex);
        setInput(inputHistory[newIndex]);
      }
      return;
    }

    // Arrow Down = Next history (when cursor is at end and navigating history)
    if (e.key === 'ArrowDown' && historyIndex >= 0) {
      const textarea = textareaRef.current;
      const cursorAtEnd = textarea &&
        textarea.selectionStart === textarea.value.length &&
        textarea.selectionEnd === textarea.value.length;

      if (cursorAtEnd) {
        e.preventDefault();
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        if (newIndex === -1) {
          setInput(tempInput);
        } else {
          setInput(inputHistory[newIndex]);
        }
      }
    }
  };

  return (
    <div className="chat-input-container">
      {effectiveImage && (
        <div className="image-preview">
          <img src={effectiveImage} alt="Selected" />
          <button className="remove-image-btn" onClick={handleRemoveImage} title="画像を削除">
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
          disabled={disabled}
          title="画像を添付"
        >
          <FaImage />
        </button>
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="メッセージを入力... (Shift+Enterで改行)"
            disabled={disabled}
            rows={1}
          />
        </div>
        <button className="mic-btn" title="音声入力" disabled>
          <FaMicrophone />
        </button>
        {isStreaming ? (
          <button
            className="send-btn stop-btn"
            onClick={onCancel}
            title="停止 (Esc)"
          >
            <FaStop />
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={handleSubmit}
            disabled={(!input.trim() && !effectiveImage) || disabled}
            title="送信"
          >
            <FaPaperPlane />
          </button>
        )}
      </div>
    </div>
  );
}
