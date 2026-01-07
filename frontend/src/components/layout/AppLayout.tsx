import { useState, useCallback, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { ChatWindow } from '../chat/ChatWindow';
import { ChatWidget } from '../chat/ChatWidget';
import './AppLayout.css';

const CHAT_STORAGE_KEY = 'secretary_chat_state';

interface ChatState {
  isOpen: boolean;
  width: number;
}

export function AppLayout() {
  const location = useLocation();
  const [isChatOpen, setIsChatOpen] = useState(() => {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);
    if (saved) {
      try {
        return (JSON.parse(saved) as ChatState).isOpen;
      } catch (e) {
        return false;
      }
    }
    return false;
  });

  const [chatWidth, setChatWidth] = useState(() => {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);
    if (saved) {
      try {
        return (JSON.parse(saved) as ChatState).width;
      } catch (e) {
        return 400;
      }
    }
    return 400;
  });

  const isResizing = useRef(false);

  // Persist state changes
  useEffect(() => {
    const state: ChatState = { isOpen: isChatOpen, width: chatWidth };
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(state));
  }, [isChatOpen, chatWidth]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'default';
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 300 && newWidth < 800) {
      setChatWidth(newWidth);
    }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResizing);
    };
  }, [handleMouseMove, stopResizing]);

  const toggleChat = () => setIsChatOpen(!isChatOpen);

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            className="content-area"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {isChatOpen && (
        <>
          <div
            className="resize-handle"
            onMouseDown={startResizing}
          />
          <aside
            className="chat-sidebar"
            style={{ width: `${chatWidth}px` }}
          >
            <ChatWindow isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
          </aside>
        </>
      )}

      {!isChatOpen && <ChatWidget forceOpen={toggleChat} />}
    </div>
  );
}
