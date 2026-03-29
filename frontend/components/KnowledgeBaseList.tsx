import React, { useState, useEffect } from 'react';
import { Folder, Plus, FileText, Trash2 } from 'lucide-react';
import { KnowledgeBase, Employee } from '../types';
import CreateKBModal from './CreateKBModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import { fetchKBs, createKB, deleteKB } from '../services/backendService';
import { FavoriteStar } from './FavoriteStar';

interface KnowledgeBaseListProps {
  onSelectKb: (kb: KnowledgeBase) => void;
  currentUser: Employee | null;
}

const KnowledgeBaseList: React.FC<KnowledgeBaseListProps> = ({ onSelectKb, currentUser }) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);

  // Delete State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [kbToDelete, setKbToDelete] = useState<KnowledgeBase | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadKBs = async () => {
    setLoading(true);
    const data = await fetchKBs(currentUser?.id);
    setKbs(data);
    setLoading(false);
  };

  useEffect(() => {
    loadKBs();
  }, [currentUser]);

  const handleCreate = async (data: { title: string; description: string; visibility: string }) => {
    try {
      if (!currentUser?.id) return;
      await createKB({ ...data, userId: currentUser.id });
      setShowCreateModal(false);
      loadKBs();
    } catch (e) {
      alert("创建失败，请重试");
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, kb: KnowledgeBase) => {
    e.stopPropagation();
    setKbToDelete(kb);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!kbToDelete || !currentUser?.id) return;

    setIsDeleting(true);
    try {
      await deleteKB(kbToDelete.id, currentUser.id);
      await loadKBs(); // Reload list
      setShowDeleteModal(false);
      setKbToDelete(null);
    } catch (error) {
      console.error("Delete failed:", error);
      alert("删除失败，或您没有权限删除此知识库");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
          知识库
        </h1>
        <p className="text-slate-500 text-sm mt-1">管理和查询您的知识库文档</p>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto">
          {/* KB Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full text-center text-slate-500">加载中...</div>
            ) : (
              kbs.map((kb) => (
                <button
                  key={kb.id}
                  onClick={() => onSelectKb(kb)}
                  className="group relative flex flex-col w-full aspect-[4/3] rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 text-left"
                >
                  {/* Cover Image Area */}
                  <div className={`h-2/5 w-full bg-gradient-to-r ${kb.coverColor || 'from-blue-400 to-blue-600'} p-4 flex items-start justify-between`}>
                    <div />

                    {/* Actions Container */}
                    <div className="flex items-center gap-2">
                      {/* Delete Button for Non-System KBs */}
                      {!kb.is_system && (
                        <div
                          role="button"
                          onClick={(e) => handleDeleteClick(e, kb)}
                          className="w-[28px] h-[28px] flex items-center justify-center rounded-md bg-white/25 hover:bg-red-500/80 text-white transition-all cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </div>
                      )}

                      {/* Folder Icon (View) */}
                      <div className="w-[28px] h-[28px] flex items-center justify-center rounded-md bg-white/25 text-white">
                        <Folder size={16} />
                      </div>

                      {/* Favorite Star Icon */}
                      <div className="w-[28px] h-[28px] flex items-center justify-center rounded-md bg-white/25 hover:bg-white/40 transition-all cursor-pointer" onClick={(e) => e.stopPropagation()}>
                        <FavoriteStar
                          favoriteRef={{ type: 'KNOWLEDGE_BASE', id: kb.id }}
                          meta={{
                            title: kb.title,
                            summary: kb.description,
                            subtitle: '知识库',
                            tags: ['知识库'],
                            sourceId: kb.id,
                            actions: { canView: true }
                          }}
                          className="text-white hover:scale-110"
                          size={16}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5 flex-1 relative flex flex-col">
                    <div className="w-full">
                      <h3 className="text-xl font-bold text-slate-800 mb-2 line-clamp-1 group-hover:text-blue-600 transition-colors">{kb.title}</h3>
                      <p className="text-base text-slate-500 line-clamp-4 mb-4">{kb.description}</p>
                    </div>

                    <div className="absolute bottom-5 left-5 right-5 flex items-center gap-2 text-xs text-slate-400 pt-3 border-t border-slate-100 bg-white">
                      <FileText size={14} />
                      <span>{kb.fileCount} 个文档</span>
                    </div>
                  </div>
                </button>
              ))
            )}

            {/* Create Card Render Logic... */}
            {currentUser && parseInt(currentUser.security_level || "0") >= 3 && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="aspect-[4/3] rounded-2xl border-2 border-dashed bg-white hover:bg-blue-50/30 transition-all flex flex-col items-center justify-center group"
                style={{ borderColor: 'rgba(59, 130, 246, 0.5)' }}
              >
                {/* ... */}
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'rgba(59, 130, 246, 1)' }}>
                  <Plus size={24} />
                </div>
                <span className="font-medium" style={{ color: 'rgba(59, 130, 246, 1)' }}>新建知识库</span>
              </button>
            )}

          </div>
        </div>

        {/* Modals ... */}
        {showCreateModal && <CreateKBModal onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />}
        <DeleteConfirmModal isOpen={showDeleteModal} title={kbToDelete?.title || ''} onClose={() => { if (!isDeleting) { setShowDeleteModal(false); setKbToDelete(null); } }} onConfirm={handleConfirmDelete} loading={isDeleting} />

      </div>
    </div>
  );
};

export default KnowledgeBaseList;
