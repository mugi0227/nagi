import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { ChatWidget } from '../chat/ChatWidget';
import './AppLayout.css';

export function AppLayout() {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <motion.div
          className="content-area"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <Outlet />
        </motion.div>
      </main>
      <ChatWidget />
    </div>
  );
}
