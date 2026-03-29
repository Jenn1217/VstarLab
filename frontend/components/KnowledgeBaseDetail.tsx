
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, FileText, Search, Plus, MoreVertical } from 'lucide-react';
import { KnowledgeBase, KBFile } from '../types';
import ChatInterface from './ChatInterface';
import { fetchKBFiles, uploadKBFile } from '../services/backendService';
import { Employee } from '../types'; // Assuming Employee type is defined here or needs to be imported
import { FavoriteStar } from './FavoriteStar';
import { RiskMonitorModal, MonitorStatus } from './RiskMonitorModal';

interface KnowledgeBaseDetailProps {
  kb: KnowledgeBase;
  onBack: () => void;
  onSelectFile: (file: KBFile) => void;
  currentUser: Employee | null;
}

const KnowledgeBaseDetail: React.FC<KnowledgeBaseDetailProps> = ({ kb, onBack, onSelectFile, currentUser }) => {
  const [files, setFiles] = useState<KBFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus>('idle');
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async () => {
    setLoading(true);
    const data = await fetchKBFiles(kb.id, currentUser?.id);
    setFiles(data);
    setLoading(false);
  };

  useEffect(() => {
    loadFiles();
  }, [kb.id, currentUser?.id]);

  const handleUploadClick = () => {
    // System KBs (1, 2, 3, 4) require security_level >= 4 to upload
    const systemKbIds = ["1", "2", "3", "4"];
    if (systemKbIds.includes(kb.id)) {
      const securityLevel = parseInt(currentUser?.security_level || "0", 10);
      if (securityLevel < 4) {
        alert("安全等级不够，不可以上传。");
        return;
      }
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isRiskFile = file.name === "IBS_PMO016_功能规格说明书_清算总账.docx";

    try {
      if (!currentUser?.id) {
        alert("User not authenticated for upload.");
        return;
      }

      // Start Scanning State
      setMonitorStatus('scanning');

      // Enforce minimum 5 seconds scanning time as requested
      const minScanTime = new Promise(resolve => setTimeout(resolve, 5000));
      const uploadPromise = uploadKBFile(kb.id, file, currentUser.id);

      // Wait for both upload and minimum 5s time
      await Promise.all([minScanTime, uploadPromise]);

      if (isRiskFile) {
        // Risk State
        setMonitorStatus('risk');
        loadFiles();

        // Show risk message for 5 seconds then close
        setTimeout(() => {
          setMonitorStatus('idle');
        }, 5000);
      } else {
        // Success State
        loadFiles();
        setMonitorStatus('success');

        // Show success message for 3 seconds then close
        setTimeout(() => {
          setMonitorStatus('idle');
        }, 3000);
      }

    } catch (error) {
      alert("Upload failed");
      setMonitorStatus('idle');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };



  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-full w-full bg-white">
      {/* Left Sidebar: File List */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50">

        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-800 text-sm mb-3 transition-colors">
            <ArrowLeft size={16} className="mr-1" />
            返回列表
          </button>
          <h2 className="text-lg font-bold text-slate-800 truncate" title={kb.title}>{kb.title}</h2>
          <p className="text-sm text-slate-500 mt-1 truncate">{kb.description}</p>
        </div>

        {/* Tools */}
        <div className="p-3 gap-2 flex">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={handleUploadClick}
            className="flex-1 bg-blue-600 text-white text-sm py-2 px-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-1 shadow-sm"
          >
            <Plus size={16} />
            上传文档
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索文档..."
              className="w-full bg-white border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {loading ? (
            <div className="p-4 text-center text-slate-400 text-sm">加载中...</div>
          ) : filteredFiles.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-sm">
              {searchTerm ? "未找到相关文档" : "暂无文档"}
            </div>
          ) : (
            filteredFiles.map(file => (
              <div
                key={file.id}
                onClick={() => onSelectFile(file)}
                className="p-3 rounded-lg hover:bg-white hover:shadow-sm cursor-pointer border border-transparent hover:border-slate-100 transition-all group relative pr-8"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 text-blue-600">
                    <FileText size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate group-hover:text-blue-600 transition-colors py-0.5">{file.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>{file.size}</span>
                      <span>•</span>
                      <span>{file.uploadDate}</span>
                    </div>
                  </div>
                </div>

                {/* Favorite Star using Component */}
                <div className="absolute right-2 top-3">
                  <FavoriteStar
                    favoriteRef={{
                      type: 'KB_ARTICLE',
                      id: file.id
                    }}
                    meta={{
                      title: file.name,
                      subtitle: `${kb.title} • ${file.size}`,
                      summary: `知识库文档: ${file.name}`,
                      tags: ['文档', file.type || 'file'],
                      sourceId: kb.id,
                      actions: { canView: true, canExport: true }
                    }}
                    className="opacity-0 group-hover:opacity-100" // Only match hover visibility if desired, but generic component handles base states
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Area: Scoped Chat */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Context Header */}
        <div className="h-14 border-b border-slate-100 flex items-center justify-between px-6 bg-white shrink-0">
          <span className="text-sm font-medium text-slate-500">正在与 <span className="text-slate-800 font-semibold">"{kb.title}"</span> 对话</span>
          <button className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
            <MoreVertical size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          <ChatInterface mode="knowledge_base" contextTitle={kb.title} />
        </div>
      </div>

      {/* Risk Monitor Modal */}
      <RiskMonitorModal status={monitorStatus} />
    </div>
  );
};

export default KnowledgeBaseDetail;
