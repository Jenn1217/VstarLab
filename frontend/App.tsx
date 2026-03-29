import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import KnowledgeBaseList from './components/KnowledgeBaseList';
import KnowledgeBaseDetail from './components/KnowledgeBaseDetail';
import FileViewer from './components/FileViewer';
import TableQuery from './components/TableQuery';
import Login from './components/Login';
import DigitalIntelligence from './components/DigitalIntelligence';
import { KnowledgeBase, KBFile, Employee } from './types';

import CommunityLayout from './components/Community/CommunityLayout';
import ReverseTracking from './components/ReverseTracking/ReverseTracking';
import UserPageLayout from './components/UserPage/UserPageLayout';
import FavoritesPage from './components/Favorites/FavoritesPage';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Navigation State
  const [currentView, setCurrentView] = useState<string>('chat');
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [selectedFile, setSelectedFile] = useState<KBFile | null>(null);

  const [chatKey, setChatKey] = useState(0);
  const [sessionId, setSessionId] = useState(() => `session-${Date.now()}`);

  if (!currentUser) {
    return <Login onLoginSuccess={setCurrentUser} />;
  }

  const handleNavigate = (view: string) => {
    setCurrentView(view);
    // Reset specific selections when navigating to top levels
    if (view === 'kb_list') {
      setSelectedKb(null);
      setSelectedFile(null);
    }
  };

  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    setSessionId(newId);
    setChatKey(prev => prev + 1);
    setCurrentView('chat');
  };

  const handleSessionSelect = (id: string) => {
    setSessionId(id);
    setChatKey(prev => prev + 1); // Force re-render ChatInterface to reload messages
    setCurrentView('chat');
  };

  const handleKbSelect = (kb: KnowledgeBase) => {
    setSelectedKb(kb);
    setCurrentView('kb_detail');
  };

  const handleFileSelect = (file: KBFile) => {
    setSelectedFile(file);
    setCurrentView('file_viewer');
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };

  // Render Content based on View State
  const renderContent = () => {
    switch (currentView) {
      case 'kb_list':
        return <KnowledgeBaseList onSelectKb={handleKbSelect} currentUser={currentUser} />;

      case 'kb_detail':
        if (!selectedKb) return <KnowledgeBaseList onSelectKb={handleKbSelect} currentUser={currentUser} />;
        return (
          <KnowledgeBaseDetail
            kb={selectedKb}
            onBack={() => setCurrentView('kb_list')}
            onSelectFile={handleFileSelect}
            currentUser={currentUser}
          />
        );

      case 'file_viewer':
        if (!selectedFile) return null; // Should ideally go back
        return (
          <FileViewer
            file={selectedFile}
            kbId={selectedKb?.id || ''}
            kbName={selectedKb?.title || ''}
            onBack={() => setCurrentView('kb_detail')}
            currentUser={currentUser}
          />
        );

      case 'table':
        return <TableQuery />;

      case 'digital_intelligence':
        return <DigitalIntelligence />;

      case 'community':
        return <CommunityLayout onBack={() => setCurrentView('chat')} currentUser={currentUser} />;

      case 'reverse_tracking':
        return <ReverseTracking />;

      case 'user_page':
        return <UserPageLayout onBack={() => setCurrentView('chat')} onLogout={handleLogout} currentUser={currentUser} />;

      case 'favorites':
        return <FavoritesPage onNavigate={handleNavigate} onSelectSession={handleSessionSelect} currentUser={currentUser} />;

      case 'chat':
      default:
        return (
          <ChatInterface
            key={chatKey}
            sessionId={sessionId}
            onNavigate={handleNavigate}
            currentUser={currentUser}
          />
        );
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      {currentView !== 'user_page' && (
        <Sidebar
          isOpen={isSidebarOpen}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          activeView={currentView}
          onNavigate={handleNavigate}
          onNewChat={handleNewChat}
          onSelectSession={handleSessionSelect}
          currentSessionId={sessionId}
          currentUser={currentUser}
        />
      )}
      <main className="flex-1 h-full relative overflow-hidden">
        {/* Global User Profile Button */}
        {currentUser && currentView !== 'user_page' && currentView !== 'favorites' && currentView !== 'kb_detail' && currentView !== 'digital_intelligence' && (
          <div className="absolute top-6 right-8 z-50">
            <button
              onClick={() => handleNavigate('user_page')}
              className="flex items-center gap-3 p-2 rounded-xl bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer text-left group"
            >
              <div className="w-10 h-10 rounded-full bg-[#FF8C00] flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm border-2 border-white ring-1 ring-slate-100">
                {currentUser.name.slice(-2)}
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-sm font-bold text-slate-800 truncate">{currentUser.name}</p>
                <p className="text-xs text-slate-500 truncate">{currentUser.department}</p>
              </div>
            </button>
          </div>
        )}
        {renderContent()}
      </main>

      {/* Global CSS Animation Definitions */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default App;