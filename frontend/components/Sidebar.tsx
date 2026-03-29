import React, { useState, useEffect, useRef } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  FileText,
  Database,
  Table,
  MessageSquare,
  Settings,

  History,
  MoreHorizontal,
  Trash2,
  Edit2,
  Pin,
  Users,
  Activity,
  Star
} from 'lucide-react';
import { fetchHistory, deleteSession, renameSession, toggleFavorite } from '../services/backendService';
import DeleteConfirmModal from './DeleteConfirmModal'; // Import the Modal

import { Employee } from '../types';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  activeView: string;
  onNavigate: (view: string) => void;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  currentSessionId?: string;
  currentUser?: Employee | null;
}

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  toggleSidebar,
  activeView,
  onNavigate,
  onNewChat,
  onSelectSession,
  currentSessionId,
  currentUser
}) => {

  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadHistory = async () => {
    // Pass user ID if available
    const data = await fetchHistory(currentUser?.id);
    setHistoryItems(data);
  };

  useEffect(() => {
    loadHistory();
  }, [isOpen, currentSessionId, currentUser?.id]); // Reload when sidebar opens, session changes, or user changes

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside BOTH the menu bubble and the trigger button
      // But standard way is checking if menuRef contains target.
      // We also verify menuOpenId is set.
      if (menuOpenId && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenId]); // Add menuOpenId dependency to ensure up-to-date state access if needed, though ref is stable.

  // Renamed to handle click on delete menu item
  const handleDeleteClick = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    setItemToDelete(item);
    setShowDeleteModal(true);
    setMenuOpenId(null);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    setIsDeleting(true);
    try {
      await deleteSession(itemToDelete.id);
      await loadHistory();
      if (currentSessionId === itemToDelete.id) {
        onNewChat();
      }
      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (e) {
      console.error("Delete failed", e);
      alert("删除失败，请重试");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRenameStart = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditTitle(item.title);
    setMenuOpenId(null);
  };

  const handleRenameSubmit = async (id: string) => {
    if (editTitle.trim()) {
      await renameSession(id, editTitle);
      loadHistory();
    }
    setEditingId(null);
  };

  const handleToggleFavorite = async (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    try {
      if (!currentUser?.id) {
        alert("请先登录");
        return;
      }
      await toggleFavorite(currentUser.id, item.id, 'session');
      // Optimistic update
      setHistoryItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, is_favorite: !i.is_favorite } : i
      ));
      setMenuOpenId(null);
    } catch (error) {
      console.error("Failed to toggle favorite", error);
      alert("收藏失败，请重试");
    }
  };

  return (
    <div
      className={`
        h-full bg-slate-50 border-r border-slate-200 flex flex-col transition-all duration-300 ease-in-out
        ${isOpen ? 'w-64' : 'w-16'}
      `}
    >
      {/* Header / Collapse Toggle */}
      <div className="p-4 flex items-center justify-between">
        {isOpen && (
          <button
            onClick={toggleSidebar}
            className="font-bold text-xl tracking-tight hover:opacity-80 transition-opacity text-left"
            style={{ color: '#0081E5' }}
            title="收起侧边栏"
          >
            财析入微
          </button>
        )}
        <button
          onClick={() => { }}
          className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
          title="搜索历史对话"
        >
          {isOpen ? <History size={20} /> : <PanelLeftOpen size={20} onClick={toggleSidebar} />}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">

        {/* Feature Menu */}
        <div className="px-3 py-2 space-y-1">
          <MenuItem
            icon={<MessageSquare size={18} />}
            label="AI 问答助手"
            isOpen={isOpen}
            isActive={activeView === 'chat'}
            onClick={onNewChat}
          />
          <MenuItem
            icon={<Activity size={18} />}
            label="账务不平分析"
            isOpen={isOpen}
            isActive={activeView === 'reverse_tracking'}
            onClick={() => onNavigate('reverse_tracking')}
          />
          <MenuItem
            icon={<Database size={18} />}
            label="知识库"
            isOpen={isOpen}
            isActive={activeView === 'kb_list' || activeView === 'kb_detail' || activeView === 'file_viewer'}
            onClick={() => onNavigate('kb_list')}
          />
          <MenuItem
            icon={<Table size={18} />}
            label="表格查询"
            subLabel="数据分析"
            isOpen={isOpen}
            isActive={activeView === 'table'}
            onClick={() => onNavigate('table')}
          />
        </div>

        {/* History Section */}
        {isOpen && (
          <div className="pt-4 border-t border-slate-200/60">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 px-2">历史记录</h3>
            <ul className="space-y-1 pb-10">
              {historyItems.map((item) => (
                <li key={item.id} className="relative group">
                  {editingId === item.id ? (
                    <input
                      autoFocus
                      className="w-full px-3 py-2 rounded-lg border border-blue-300 text-sm outline-none"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleRenameSubmit(item.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(item.id)}
                    />
                  ) : (
                    <button
                      onClick={() => onSelectSession(item.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg hover:bg-slate-200/50 text-[15px] truncate flex items-center gap-2 transition-colors
                        ${currentSessionId === item.id ? 'bg-slate-200 text-slate-900 font-bold' : 'text-slate-900 font-bold'}
                      `}
                    >
                      <MessageSquare size={14} className="opacity-50 flex-shrink-0" />
                      <span className="truncate flex-1 flex items-center gap-1">
                        {item.title}
                        {item.is_favorite && <Star size={10} className="fill-yellow-400 text-yellow-500" />}
                      </span>

                      {/* Menu Trigger */}
                      <div
                        className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-300 rounded ${menuOpenId === item.id ? 'opacity-100' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === item.id ? null : item.id);
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </div>
                    </button>
                  )}

                  {/* Context Menu */}
                  {menuOpenId === item.id && (
                    <div
                      ref={menuRef}
                      className="absolute right-0 top-8 z-50 w-32 bg-white rounded-lg shadow-xl border border-slate-100 py-1 animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        onClick={(e) => handleRenameStart(e, item)}
                        className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Edit2 size={12} /> 重命名
                      </button>
                      <button
                        onClick={(e) => handleToggleFavorite(e, item)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 ${item.is_favorite ? 'text-yellow-600 font-medium' : 'text-slate-600'}`}
                      >
                        <Star size={12} className={item.is_favorite ? "fill-yellow-400 text-yellow-500" : ""} />
                        {item.is_favorite ? "取消收藏" : "收藏"}
                      </button>
                      <div className="h-px bg-slate-100 my-1" />
                      <button
                        onClick={(e) => handleDeleteClick(e, item)}
                        className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 size={12} /> 删除
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Bottom Profile & Community */}
      <div className="p-3 border-t border-slate-200 bg-slate-100/50 space-y-2">


        {/* Favorites Button */}
        <button
          onClick={() => onNavigate('favorites')}
          className={`w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all text-slate-900 ${!isOpen && 'justify-center'}`}
        >
          <Star size={20} />
          {isOpen && <span className="text-base font-bold">收藏夹</span>}
        </button>

        {/* Community Button (The "Little House") */}
        <button
          onClick={() => onNavigate('community')}
          className={`w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all text-slate-900 ${!isOpen && 'justify-center'}`}
        >
          <Users size={20} />
          {isOpen && <span className="text-base font-bold">社区</span>}
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        title={itemToDelete ? `“${itemToDelete.title}”` : "此对话"}
        onClose={() => {
          if (!isDeleting) {
            setShowDeleteModal(false);
            setItemToDelete(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        loading={isDeleting}
      />
    </div >
  );
};

const MenuItem = ({ icon, label, subLabel, isOpen, isActive, onClick }: any) => (
  <button
    onClick={onClick}
    className={`
      w-full flex items-center gap-3 p-2.5 rounded-lg transition-all group
      ${isActive ? 'bg-[#0081E5] text-white shadow-sm' : 'hover:bg-slate-200/50 text-slate-900'}
      ${!isOpen && 'justify-center'}
    `}
  >
    <div className={`${isActive ? 'text-white' : 'text-slate-900 group-hover:text-black'}`}>
      {icon}
    </div>
    {isOpen && (
      <div className="flex-1 text-left">
        <div className="text-base font-bold">{label}</div>
      </div>
    )}
    {isOpen && <div className={`${isActive ? 'text-white/80' : 'text-slate-400'} opacity-0 group-hover:opacity-100 transition-opacity`}>›</div>}
  </button>
);

export default Sidebar;
