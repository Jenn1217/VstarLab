import React, { useEffect, useState } from 'react';
import { ArrowLeft, Download, Share2, ZoomIn, ZoomOut } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { KBFile, Employee } from '../types';
import { fetchKBFileContent } from '../services/backendService';
import mammoth from 'mammoth';
import DOMPurify from 'dompurify';

interface FileViewerProps {
  file: KBFile;
  kbId: string;
  kbName: string;
  onBack: () => void;
  currentUser: Employee | null;
}

const FileViewer: React.FC<FileViewerProps> = ({ file, kbId, kbName, onBack, currentUser }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [shareText, setShareText] = useState('分享');

  const isPdf = file.name.toLowerCase().endsWith('.pdf');
  const isDocx = file.name.toLowerCase().endsWith('.docx');
  const isMarkdown = file.name.toLowerCase().endsWith('.md');
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
  const rawUrl = `${apiBaseUrl}/kb/${kbId}/file/raw?filename=${encodeURIComponent(file.name)}`;

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = rawUrl;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    try {
      const link = `${window.location.origin}${window.location.pathname}?kbId=${kbId}&file=${encodeURIComponent(file.name)}`;
      await navigator.clipboard.writeText(link);
      setShareText('已复制');
      setTimeout(() => setShareText('分享'), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    if (isPdf) {
      setLoading(false);
      return;
    }

    const loadContent = async () => {
      setLoading(true);
      try {
        if (isDocx) {
          const response = await fetch(rawUrl);
          const arrayBuffer = await response.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setContent(DOMPurify.sanitize(result.value));
        } else {
          const data = await fetchKBFileContent(kbId, file.name, currentUser?.id);
          setContent(data);
        }
      } catch (error) {
        console.error("Error loading file:", error);
        setContent("无法加载文件内容");
      }
      setLoading(false);
    };

    if (kbId && file.name) {
      loadContent();
    }
  }, [kbId, file.name, isPdf, isDocx, rawUrl]);

  return (
    <div className="flex flex-col h-full w-full bg-slate-50">
      {/* Enhanced Header matching the reference */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10 sticky top-0">
        <div className="flex items-start gap-4">
          <button
            onClick={onBack}
            className="mt-1 p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            title="返回上一级"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="flex flex-col gap-1">
            {/* Breadcrumbs / Context Info */}
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">{kbName}</span>
              </span>
              <span>/</span>
              <span className="text-slate-400">{file.name}</span>
            </div>

            {/* Main Title */}
            <h1 className="text-xl font-bold text-slate-900 leading-tight">
              {file.name}
            </h1>

            {/* Metadata line */}
            <div className="flex items-center gap-4 text-xs text-slate-400 mt-1">
              <span>最后修改: {file.uploadDate}</span>
              <span>•</span>
              <span>{file.size}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Primary Action: Share (Blue Button) */}
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Share2 size={16} />
            <span>{shareText}</span>
          </button>

          <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>

          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            title="缩小"
          >
            <ZoomOut size={18} />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            title="放大"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            title="下载"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Content Viewer */}
      <div className="flex-1 overflow-y-auto p-0 bg-slate-100/50">
        {/* For PDF, use full width/height container minus some margin if desired, or full viewport style */}
        <div className={`w-full mx-auto ${isPdf ? 'h-full max-w-full' : 'max-w-5xl py-8 px-8'}`}>
          <div
            className={`bg-white shadow-sm border border-slate-200 ${isPdf ? 'h-full w-full border-0' : 'min-h-[800px] p-12 rounded-xl'}`}
            style={{ zoom: zoom } as any}
          >
            {loading ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span>加载内容中...</span>
                </div>
              </div>
            ) : isPdf ? (
              <iframe
                src={`${rawUrl}#toolbar=0&navpanes=0`}
                className="w-full h-full rounded-xl"
                title={file.name}
              />
            ) : isDocx ? (
              <div
                className="prose prose-slate max-w-none bg-white p-8 min-h-full"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            ) : (
              <div className="prose prose-slate max-w-none">
                {isMarkdown ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      img: ({ node, ...props }) => <img style={{ maxWidth: '100%' }} {...props} alt={props.alt || ''} />
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">
                    {content}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileViewer;
