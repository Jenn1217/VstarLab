import React, { useState, useMemo, useEffect } from 'react';
import {
    Search, Filter, Calendar, Tag, MoreHorizontal, Download,
    Trash2, Copy, ExternalLink, ChevronDown, CheckSquare, Square,
    MessageSquare, FileText, Database, Layers, X, Eye, MessageCircle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FavoriteItem, FavoriteType, FilterState } from './types';
import { favoritesService } from '../../services/favoritesService';
import { FavoriteStar } from '../FavoriteStar';
import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
import { fetchKBFileContent } from '../../services/backendService';
import { Employee } from '../../types';

interface FavoritesPageProps {
    onNavigate: (view: string) => void;
    onSelectSession: (id: string) => void;
    currentUser: Employee | null;
}

const FavoritesPage: React.FC<FavoritesPageProps> = ({ onNavigate, onSelectSession, currentUser }) => {
    // --- State ---
    const [items, setItems] = useState<FavoriteItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<FilterState>({
        type: 'ALL',
        source: [],
        tags: [],
        dateRange: null,
        onlyViewable: false
    });
    const [keyword, setKeyword] = useState("");
    const [sortMode, setSortMode] = useState<'createdAt' | 'updatedAt' | 'alpha'>('createdAt');

    // Drawer State
    const [selectedItem, setSelectedItem] = useState<FavoriteItem | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Preview Content State
    const [previewContent, setPreviewContent] = useState<string>('');
    const [contentLoading, setContentLoading] = useState(false);

    useEffect(() => {
        if (isDrawerOpen && selectedItem && selectedItem.type === 'KB_ARTICLE') {
            const loadContent = async () => {
                setContentLoading(true);
                setPreviewContent('');
                try {
                    const isDocx = selectedItem.title.toLowerCase().endsWith('.docx');
                    const kbId = selectedItem.sourceId || '';
                    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
                    if (isDocx && kbId) {
                        const rawUrl = `${apiBaseUrl}/kb/${kbId}/file/raw?filename=${encodeURIComponent(selectedItem.title)}`;
                        const response = await fetch(rawUrl);
                        if (!response.ok) throw new Error("Fetch failed");
                        const arrayBuffer = await response.arrayBuffer();
                        const result = await mammoth.convertToHtml({ arrayBuffer });
                        setPreviewContent(DOMPurify.sanitize(result.value));
                    } else if (kbId) {
                        // Text/Markdown
                        const content = await fetchKBFileContent(kbId, selectedItem.title, currentUser?.id);
                        setPreviewContent(content);
                    } else {
                        setPreviewContent('无法读取文件内容：缺少源信息');
                    }
                } catch (e) {
                    console.error("Failed to load details", e);
                    setPreviewContent(selectedItem.content || '加载预览失败');
                } finally {
                    setContentLoading(false);
                }
            };
            loadContent();
        } else {
            setPreviewContent('');
        }
    }, [isDrawerOpen, selectedItem, currentUser]);

    // --- Helpers ---
    const loadData = async () => {
        setLoading(true);
        try {
            const data = await favoritesService.listFavorites({
                type: filter.type === 'ALL' ? undefined : filter.type,
                query: keyword,
                source: filter.source as any,
                tags: filter.tags
            }, currentUser?.id);
            setItems(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [filter, keyword, sortMode, currentUser?.id]); // Reload when filters change

    const allTags = useMemo(() => Array.from(new Set(items.flatMap(i => i.tags || []))), [items]);

    const getIcon = (type: FavoriteType) => {
        switch (type) {
            case 'AI_ANSWER': return <MessageSquare size={18} className="text-blue-500" />;
            case 'CHAT_THREAD': return <Layers size={18} className="text-indigo-500" />;
            case 'KNOWLEDGE_BASE': return <Database size={18} className="text-emerald-500" />;
            case 'KB_ARTICLE': return <FileText size={18} className="text-orange-500" />;
            case 'COMMUNITY_POST': return <MessageCircle size={18} className="text-pink-500" />;
        }
    };

    const getTypeName = (type: FavoriteType) => {
        switch (type) {
            case 'AI_ANSWER': return 'AI 回答';
            case 'CHAT_THREAD': return '对话';
            case 'KNOWLEDGE_BASE': return '知识库';
            case 'KB_ARTICLE': return '文章';
            case 'COMMUNITY_POST': return '社区帖子';
        }
    };

    // --- Filtering & Sorting ---
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            // Type Filter
            if (filter.type !== 'ALL' && item.type !== filter.type) return false;

            // Source Filter
            if (filter.source.length > 0) {
                const isChatSource = ['AI_ANSWER', 'CHAT_THREAD'].includes(item.type);
                const isKBSource = ['KNOWLEDGE_BASE', 'KB_ARTICLE'].includes(item.type);
                const isCommunitySource = item.type === 'COMMUNITY_POST';

                const matchesSource = filter.source.some(s =>
                    (s === 'CHAT' && isChatSource) || (s === 'KB' && isKBSource) || (s === 'COMMUNITY' && isCommunitySource)
                );
                if (!matchesSource) return false;
            }

            // Keyword Filter
            if (keyword) {
                const lowerKey = keyword.toLowerCase();
                const matchTitle = item.title.toLowerCase().includes(lowerKey);
                const matchSummary = item.summary?.toLowerCase().includes(lowerKey) || false;
                const matchTags = item.tags.some(t => t.toLowerCase().includes(lowerKey));
                if (!matchTitle && !matchSummary && !matchTags) return false;
            }

            // Checkbox Filter: Only Viewable
            if (filter.onlyViewable && !item.actions.canView) return false;

            // Tag Filter
            if (filter.tags.length > 0) {
                if (!filter.tags.some(t => item.tags.includes(t))) return false;
            }

            return true;
        }).sort((a, b) => {
            if (sortMode === 'createdAt') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            if (sortMode === 'updatedAt') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            return a.title.localeCompare(b.title);
        });
    }, [items, filter, keyword, sortMode]);

    // --- Handlers ---
    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredItems.map(i => i.id)));
        }
    };

    const handleOpenDetail = (item: FavoriteItem) => {
        setSelectedItem(item);
        setIsDrawerOpen(true);
    };

    const handleJump = (item: FavoriteItem) => {
        if (item.type === 'AI_ANSWER') {
            if (item.sourceId) {
                onSelectSession(item.sourceId);
            }
        } else if (item.type === 'CHAT_THREAD') {
            onSelectSession(item.id);
        } else if (item.type === 'KNOWLEDGE_BASE' || item.type === 'KB_ARTICLE') {
            // For now, go to KB list as we don't have direct KB ID setter from here easily without refactoring App.tsx
            // Or we could pass a `onSelectKb` prop too, but let's stick to list for now.
            onNavigate('kb_list');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">

            {/* 1. Header & Toolbar */}
            <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">收藏夹</h1>

                    {/* Search & Sort */}
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="搜索标题、摘要、标签..."
                                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-1 focus:ring-[#0081E5] transition-all"
                                value={keyword}
                                onChange={e => setKeyword(e.target.value)}
                            />
                        </div>

                        <select
                            className="p-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-white focus:outline-none"
                            value={sortMode}
                            onChange={(e) => setSortMode(e.target.value as any)}
                        >
                            <option value="createdAt">最近收藏</option>
                            <option value="updatedAt">最近更新</option>
                            <option value="alpha">名称 A-Z</option>
                        </select>
                    </div>
                </div>

                {/* Tabs & Batch Actions */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6 text-sm font-medium text-slate-600">
                        {['ALL', 'AI_ANSWER', 'CHAT_THREAD', 'KNOWLEDGE_BASE', 'KB_ARTICLE', 'COMMUNITY_POST'].map((t) => {
                            const label = t === 'ALL' ? '全部' : getTypeName(t as FavoriteType);
                            const isActive = filter.type === t;
                            return (
                                <button
                                    key={t}
                                    onClick={() => setFilter(prev => ({ ...prev, type: t as any }))}
                                    className={`pb-2 border-b-2 transition-colors ${isActive ? 'border-[#0081E5] text-[#0081E5]' : 'border-transparent hover:text-slate-800'}`}
                                >
                                    {label}
                                </button>
                            )
                        })}
                    </div>

                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-2 animate-[fadeIn_0.2s_ease-out]">
                            <span className="text-xs text-slate-500 mr-2">已选 {selectedIds.size} 项</span>
                            <button className="px-3 py-1.5 text-xs border border-slate-200 rounded hover:bg-slate-50 transition-colors">移动到...</button>
                            <button className="px-3 py-1.5 text-xs border border-slate-200 rounded hover:bg-slate-50 transition-colors">加标签</button>
                            <button className="px-3 py-1.5 text-xs border border-slate-200 rounded hover:bg-slate-50 transition-colors">导出</button>
                            <button className="px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-100 rounded hover:bg-red-100 transition-colors">取消收藏</button>
                        </div>
                    )}
                </div>
            </header>

            {/* Main Content: Sidebar + List */}
            <div className="flex-1 flex overflow-hidden">

                {/* 2. Left Filter Sidebar */}
                <aside className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col gap-6 overflow-y-auto">
                    {/* access toggle */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">仅看我有权限的</span>
                        <button
                            onClick={() => setFilter(prev => ({ ...prev, onlyViewable: !prev.onlyViewable }))}
                            className={`w-10 h-5 rounded-full relative transition-colors ${filter.onlyViewable ? 'bg-[#0081E5]' : 'bg-slate-300'}`}
                        >
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${filter.onlyViewable ? 'left-5.5' : 'left-0.5'}`} />
                        </button>
                    </div>

                    {/* Source Filter (New) */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">来源</h3>
                        <div className="flex flex-col gap-2">
                            {[
                                { id: 'CHAT', label: '对话 (Chat)' },
                                { id: 'KB', label: '知识库 (KB)' },
                                { id: 'COMMUNITY', label: '社区 (Community)' }
                            ].map(src => (
                                <label key={src.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={filter.source.includes(src.id)}
                                        onChange={() => {
                                            const newSource = filter.source.includes(src.id)
                                                ? filter.source.filter(s => s !== src.id)
                                                : [...filter.source, src.id];
                                            setFilter(prev => ({ ...prev, source: newSource }));
                                        }}
                                        className="rounded text-[#0081E5] focus:ring-[#0081E5]"
                                    />
                                    {src.label}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Tags Filter */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">标签</h3>
                        <div className="flex flex-wrap gap-2">
                            {allTags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => {
                                        const newTags = filter.tags.includes(tag)
                                            ? filter.tags.filter(t => t !== tag)
                                            : [...filter.tags, tag];
                                        setFilter(prev => ({ ...prev, tags: newTags }));
                                    }}
                                    className={`px-2 py-1 text-xs rounded-md border transition-all ${filter.tags.includes(tag)
                                        ? 'bg-[#0081E5] text-white border-[#0081E5]'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                                        }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Date Filter (Mock UI) */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">时间范围</h3>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 p-2 rounded bg-slate-50">
                                <Calendar size={14} /> <span>开始日期</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 p-2 rounded bg-slate-50">
                                <Calendar size={14} /> <span>结束日期</span>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* 3. Right List */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    <div className="space-y-3">
                        {/* Header Row */}
                        <div className="flex items-center px-4 mb-2 text-xs font-medium text-slate-400">
                            <div className="w-8 flex justify-center">
                                <button onClick={toggleSelectAll}>
                                    {selectedIds.size > 0 && selectedIds.size === filteredItems.length
                                        ? <CheckSquare size={16} className="text-[#0081E5]" />
                                        : <Square size={16} />
                                    }
                                </button>
                            </div>
                            <div className="flex-1 pl-2">内容</div>
                            <div className="w-24 text-center">类型</div>
                            <div className="w-32 text-center">时间</div>
                            <div className="w-24 text-center">操作</div>
                        </div>

                        {/* List Items */}
                        {filteredItems.map(item => (
                            <div
                                key={item.id}
                                className={`
                   group flex items-start p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-all
                   ${selectedIds.has(item.id) ? 'ring-1 ring-[#0081E5] bg-[#fcfdfa]' : ''}
                 `}
                            >
                                {/* Checkbox */}
                                <div className="w-8 pt-1 flex justify-center flex-shrink-0">
                                    <button onClick={() => toggleSelect(item.id)} className="text-slate-400 hover:text-[#0081E5]">
                                        {selectedIds.has(item.id)
                                            ? <CheckSquare size={18} className="text-[#0081E5]" />
                                            : <Square size={18} />
                                        }
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="flex-1 pl-2 pr-6 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`p-1 rounded-md bg-opacity-10 ${item.type === 'AI_ANSWER' ? 'bg-blue-100' :
                                            item.type === 'CHAT_THREAD' ? 'bg-indigo-100' :
                                                item.type === 'KNOWLEDGE_BASE' ? 'bg-emerald-100' : 'bg-orange-100'
                                            }`}>
                                            {getIcon(item.type)}
                                        </span>
                                        <h3 className="text-base font-bold text-slate-800 truncate cursor-pointer hover:text-[#0081E5]" onClick={() => handleOpenDetail(item)}>
                                            {item.title}
                                        </h3>
                                        {/* Tags */}
                                        {item.tags.map(tag => (
                                            <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-500 rounded border border-slate-200">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="text-xs text-slate-500 mb-2 font-medium">
                                        {item.subtitle}
                                    </div>

                                    <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                                        {item.summary}
                                    </p>
                                </div>

                                {/* Type Badge */}
                                <div className="w-24 pt-1 text-center flex-shrink-0">
                                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                                        {getTypeName(item.type)}
                                    </span>
                                </div>

                                {/* Date */}
                                <div className="w-32 pt-1 text-center flex-shrink-0 text-xs text-slate-400 font-mono">
                                    {new Date(item.createdAt).toLocaleDateString()}
                                </div>

                                {/* Actions */}
                                <div className="w-24 pt-1 flex justify-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleOpenDetail(item)}
                                        className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-[#0081E5]"
                                        title="查看"
                                    >
                                        <Eye size={16} />
                                    </button>
                                    <button
                                        className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600"
                                        title="更多"
                                    >
                                        <MoreHorizontal size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {filteredItems.length === 0 && (
                            <div className="py-20 text-center text-slate-400">
                                <div className="w-16 h-16 bg-slate-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                                    <Search size={32} className="opacity-50" />
                                </div>
                                没有找到符合条件的收藏内容
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 4. Right Drawer Detail */}
            {isDrawerOpen && selectedItem && (
                <div className="absolute inset-y-0 right-0 w-[480px] bg-white shadow-2xl border-l border-slate-200 transform transition-transform z-10 flex flex-col">
                    {/* Drawer Header */}
                    <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                        <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-bold px-2 py-0.5 bg-[#0081E5] text-white rounded">
                                    {getTypeName(selectedItem.type)}
                                </span>
                                <span className="text-xs text-slate-400 font-mono">{new Date(selectedItem.createdAt).toLocaleString()}</span>
                            </div>
                            <h2 className="text-xl font-bold text-slate-800 leading-tight mb-2">
                                {selectedItem.title}
                            </h2>
                            <p className="text-sm text-slate-500">{selectedItem.subtitle}</p>
                        </div>
                        <button
                            onClick={() => setIsDrawerOpen(false)}
                            className="p-2 hover:bg-slate-200 rounded-lg text-slate-400"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Drawer Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {/* Type specific rendering */}
                        {selectedItem.type === 'AI_ANSWER' && (
                            <div className="prose prose-sm prose-slate max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {selectedItem.content || ''}
                                </ReactMarkdown>
                            </div>
                        )}

                        {selectedItem.type === 'KB_ARTICLE' && (
                            <div className="space-y-4">
                                <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg text-sm text-orange-800">
                                    <h4 className="font-bold flex items-center gap-2 mb-1">
                                        <FileText size={16} /> 摘要
                                    </h4>
                                    {selectedItem.summary}
                                </div>

                                {/* Content Preview */}
                                <div className="min-h-[200px] border border-slate-100 rounded-lg p-4 bg-white">
                                    {contentLoading ? (
                                        <div className="flex items-center justify-center h-40 text-slate-400 gap-2">
                                            <div className="animate-spin w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full"></div>
                                            加载正文...
                                        </div>
                                    ) : (
                                        <div className="prose prose-sm prose-slate max-w-none text-slate-600">
                                            {/* We need to handle HTML (docx) or Markdown/Text */}
                                            {selectedItem.title.toLowerCase().endsWith('.docx') ? (
                                                <div dangerouslySetInnerHTML={{ __html: previewContent || selectedItem.content || '' }} />
                                            ) : (
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {previewContent || selectedItem.content || ''}
                                                </ReactMarkdown>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {selectedItem.type === 'COMMUNITY_POST' && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                        帖
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800">{selectedItem.title}</div>
                                        <div className="text-xs text-slate-500">社区热帖</div>
                                    </div>
                                </div>

                                <div className="p-4 bg-white border border-slate-100 rounded-lg text-slate-700 leading-relaxed text-sm">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {selectedItem.content || selectedItem.summary || ''}
                                    </ReactMarkdown>
                                </div>

                                <div className="flex gap-2">
                                    {(selectedItem.tags || []).map(tag => (
                                        <span key={tag} className="px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(selectedItem.type === 'CHAT_THREAD' || selectedItem.type === 'KNOWLEDGE_BASE') && (
                            <div className="py-10 text-center">
                                {/* ... icon ... */}
                                <div className="w-20 h-20 bg-slate-100 rounded-full mx-auto mb-4 flex items-center justify-center text-slate-400">
                                    {getIcon(selectedItem.type)}
                                </div>
                                <h3 className="text-lg font-medium text-slate-900 mb-2">
                                    {selectedItem.title}
                                </h3>
                                <p className="text-slate-500 max-w-xs mx-auto mb-6">
                                    {selectedItem.summary}
                                </p>

                                <button
                                    onClick={() => handleJump(selectedItem)}
                                    className="px-6 py-2 bg-[#0081E5] text-white rounded-lg hover:bg-[#0056b3] transition-colors shadow-sm font-medium"
                                >
                                    {selectedItem.type === 'CHAT_THREAD' ? '进入对话' : '进入知识库'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Drawer Footer Actions */}
                    <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/30">
                        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-sm transition-all">
                            <Copy size={16} /> 复制
                        </button>
                        {selectedItem.actions?.canExport && (
                            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-sm transition-all">
                                <Download size={16} /> 导出
                            </button>
                        )}
                        <button
                            onClick={() => handleJump(selectedItem)}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-sm transition-all"
                        >
                            <ExternalLink size={16} /> 打开原件
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default FavoritesPage;
