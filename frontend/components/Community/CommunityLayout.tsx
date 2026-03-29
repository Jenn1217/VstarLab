import React, { useState, useEffect } from 'react';
import { Search, Plus, ThumbsUp, MessageSquare, Share2, Settings, LogOut, Star, MessageCircle, X, Loader2, Trash2 } from 'lucide-react';
import { Post, Employee } from '../../types';
import { communityService } from '../../services/communityService';
import { favoritesService } from '../../services/favoritesService';

const HOT_POSTS = [
    { title: "总分核对不平的10个常见原因及解决方案", rank: 1, views: "32回复 · 156浏览" },
    { title: "财务人员必备的Excel技巧分享", rank: 2, views: "28回复 · 142浏览" },
    { title: "如何使用系统的批量导入功能提高工作效率", rank: 3, views: "21回复 · 128浏览" }
];

const TOPICS = [
    "借贷记账", "科目不平", "总账",
    "现金流量表", "会计科目",
    "资产负债表", "不平分析",
    "凭证录入", "对账流程", "利润表",
    "总分核对", "会计分录", "明细账",
    "账务核对", "传票生成", "账务处理"
];

const FILTERS = ["全部", "不平分析类", "会计知识类", "系统使用类", "经验分享类"];

interface CommunityLayoutProps {
    onBack?: () => void;
    currentUser?: Employee | null;
}

const CommunityLayout: React.FC<CommunityLayoutProps> = ({ onBack, currentUser }) => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [favoritedPostIds, setFavoritedPostIds] = useState<Set<string>>(new Set());
    const [activeFilter, setActiveFilter] = useState("全部");
    const [loading, setLoading] = useState(true);

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [newPost, setNewPost] = useState({
        title: '',
        content: '',
        tag: '不平分析类'
    });

    useEffect(() => {
        loadPosts();
    }, []);

    // Load favorites whenever posts change
    useEffect(() => {
        const checkFavorites = async () => {
            const newSet = new Set<string>();
            // We can check all posts or just assume none initially.
            // Since isFavorited is async, we do it in effect.
            for (const post of posts) {
                const ref = { type: 'COMMUNITY_POST' as any, id: post.id.toString() };
                const isFav = await favoritesService.isFavorited(ref);
                if (isFav) newSet.add(post.id.toString());
            }
            setFavoritedPostIds(newSet);
        };
        if (posts.length > 0) checkFavorites();
    }, [posts]);

    const loadPosts = async () => {
        setLoading(true);
        try {
            const data = await communityService.listPosts();
            setPosts(data);
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePost = async () => {
        if (!newPost.title || !newPost.content) return;
        setSubmitting(true);
        try {
            let tagColor = "bg-slate-100 text-slate-600";
            if (newPost.tag === "不平分析类") tagColor = "bg-blue-50 text-blue-600";
            else if (newPost.tag === "会计知识类") tagColor = "bg-purple-50 text-purple-600";
            else if (newPost.tag === "系统使用类") tagColor = "bg-green-50 text-green-600";
            else if (newPost.tag === "经验分享类") tagColor = "bg-orange-50 text-orange-600";

            await communityService.createPost({
                author: currentUser?.name || "匿名用户",
                avatarColor: "bg-indigo-100 text-indigo-600",
                title: newPost.title,
                content: newPost.content,
                tag: newPost.tag,
                tagColor: tagColor
            });
            setShowModal(false);
            setNewPost({ title: '', content: '', tag: '不平分析类' });
            loadPosts();
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeletePost = async (id: number | string) => {
        if (!window.confirm("确定要删除这条帖子吗？")) return;
        setLoading(true);
        try {
            await communityService.deletePost(id);
            loadPosts();
        } finally {
            setLoading(false);
        }
    };

    const handleToggleFavorite = async (post: Post) => {
        const ref = { type: 'COMMUNITY_POST' as any, id: post.id.toString() };
        const meta = {
            title: post.title,
            summary: post.content,
            tags: [post.tag],
            content: post.content,
            actions: { canView: true }
        };

        // Optimistic UI Update
        const isCurrentlyFav = favoritedPostIds.has(post.id.toString());
        const newSet = new Set(favoritedPostIds);
        if (isCurrentlyFav) newSet.delete(post.id.toString());
        else newSet.add(post.id.toString());
        setFavoritedPostIds(newSet);

        // Actual Service Call
        await favoritesService.toggleFavorite(ref, meta);
    };

    const filteredPosts = activeFilter === "全部"
        ? posts
        : posts.filter(p => p.tag === activeFilter);

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden font-sans relative">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md px-8 py-6 flex justify-between items-center shadow-sm z-20 sticky top-0 border-b border-slate-100">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                        社区讨论
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">与同事交流业务经验和心得</p>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-6">
                    {/* Empty Right Actions */}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-[1400px] mx-auto p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* FEED COLUMN (Left, 8/12) */}
                    <div className="lg:col-span-8 flex flex-col gap-6">

                        {/* Toolbar */}
                        <div className="flex items-center justify-between gap-4 w-full">
                            {/* Filters */}
                            <div className="flex gap-2 bg-white/60 p-1.5 rounded-full backdrop-blur-md shadow-sm border border-white/50 overflow-x-auto">
                                {FILTERS.map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setActiveFilter(f)}
                                        className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${activeFilter === f
                                            ? 'bg-[#0081E5] text-white shadow-lg shadow-[#0081E5]/30 ring-1 ring-[#0081E5]/50'
                                            : 'text-slate-600 hover:bg-white hover:shadow-sm'
                                            }`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>

                            {/* Search & Post */}
                            <div className="flex items-center gap-3 flex-1 justify-end">
                                <div className="relative group max-w-xs w-full">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#0081E5] transition-colors" size={16} />
                                    <input
                                        type="text"
                                        placeholder="搜索帖子..."
                                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-[#0081E5] focus:border-[#0081E5] bg-white transition-all shadow-sm"
                                    />
                                </div>
                                <button
                                    onClick={() => setShowModal(true)}
                                    className="bg-[#0081E5] text-white px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-[#0056b3] shadow-md shadow-[#0081E5]/20 transition-all active:scale-95 whitespace-nowrap"
                                >
                                    <Plus size={16} /> 发布帖子
                                </button>
                            </div>
                        </div>

                        {/* Post List */}
                        <div className="flex flex-col gap-5">
                            {loading ? (
                                <div className="text-center py-20 text-slate-400">
                                    <Loader2 className="animate-spin mx-auto mb-2" />
                                    加载中...
                                </div>
                            ) : filteredPosts.map(post => {
                                const isFav = favoritedPostIds.has(post.id.toString());
                                return (
                                    <div key={post.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow group">
                                        {/* Card Header */}
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${post.avatarColor}`}>
                                                    {post.author[0]}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-700 text-sm">{post.author}</span>
                                                    <span className="text-xs text-slate-400">{post.date}</span>
                                                </div>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${post.tagColor}`}>
                                                {post.tag}
                                            </span>
                                        </div>

                                        {/* Card Body */}
                                        <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-[#0081E5] transition-colors cursor-pointer">{post.title}</h3>
                                        <p className="text-slate-600 text-sm leading-relaxed mb-4 line-clamp-2">
                                            {post.content}
                                        </p>

                                        {/* Card Footer */}
                                        <div className="flex items-center gap-6 border-t border-slate-50 pt-4 text-slate-500 text-sm">
                                            <button className="flex items-center gap-1.5 hover:text-[#0081E5] transition-colors">
                                                <ThumbsUp size={16} />
                                                <span>{post.likes}</span>
                                            </button>
                                            <button className="flex items-center gap-1.5 hover:text-[#0081E5] transition-colors">
                                                <MessageSquare size={16} />
                                                <span>{post.comments}</span>
                                            </button>
                                            <button
                                                onClick={() => handleToggleFavorite(post)}
                                                className={`flex items-center gap-1.5 transition-colors ${isFav ? 'text-yellow-500' : 'hover:text-yellow-500'}`}
                                                title={isFav ? "取消收藏" : "收藏"}
                                            >
                                                <Star size={16} className={`text-slate-400 ${isFav ? 'fill-current text-yellow-500' : 'hover:text-yellow-500'}`} />
                                                <span>{isFav ? "已收藏" : "收藏"}</span>
                                            </button>
                                            <div className="flex-1"></div>
                                            <button className="flex items-center gap-1.5 hover:text-[#0081E5] transition-colors">
                                                <Share2 size={16} />
                                                <span>分享</span>
                                            </button>
                                            {currentUser?.name === post.author && (
                                                <button
                                                    onClick={() => handleDeletePost(post.id)}
                                                    className="flex items-center gap-1.5 text-slate-400 hover:text-red-500 transition-colors ml-auto"
                                                    title="删除帖子"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* WIDGETS COLUMN (Right, 4/12) */}
                    <div className="lg:col-span-4 flex flex-col gap-6">

                        {/* Hot Ranking */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                            <div className="flex items-center gap-2 mb-5">
                                <div className="w-1 h-5 bg-[#0081E5] rounded-full"></div>
                                <h3 className="font-bold text-slate-800">热帖排行榜</h3>
                            </div>
                            <div className="flex flex-col gap-5">
                                {HOT_POSTS.map((p, i) => (
                                    <div key={i} className="flex gap-4 items-start group cursor-pointer">
                                        <div className={`w-5 h-5 rounded-full text-[10px] items-center justify-center flex flex-shrink-0 text-white font-bold mt-0.5 ${i < 3 ? 'bg-gradient-to-br from-red-400 to-orange-500 shadow-sm' : 'bg-slate-300'
                                            }`}>
                                            {p.rank}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="text-sm font-medium text-slate-700 group-hover:text-[#0081E5] transition-colors line-clamp-2">
                                                {p.title}
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                {p.views}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Topics Cloud */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                            <div className="flex items-center gap-2 mb-5">
                                <div className="w-1 h-5 bg-[#0081E5] rounded-full"></div>
                                <h3 className="font-bold text-slate-800">讨论热点</h3>
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                                {TOPICS.map(t => (
                                    <span
                                        key={t}
                                        className="px-3 py-1.5 bg-[#0081E5]/5 text-[#0081E5] rounded-lg text-xs font-semibold cursor-pointer hover:bg-[#0081E5]/15 transition-all hover:-translate-y-0.5"
                                    >
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* Create Post Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-lg font-bold text-slate-800">发布新帖子</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">标题</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0081E5] transition-all"
                                    placeholder="请输入帖子标题..."
                                    value={newPost.title}
                                    onChange={e => setNewPost({ ...newPost, title: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">分类</label>
                                <div className="flex gap-2 flex-wrap">
                                    {FILTERS.slice(1).map(tag => (
                                        <button
                                            key={tag}
                                            onClick={() => setNewPost({ ...newPost, tag })}
                                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${newPost.tag === tag
                                                ? 'bg-[#0081E5] text-white border-[#0081E5]'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">内容</label>
                                <textarea
                                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0081E5] transition-all min-h-[150px] resize-none"
                                    placeholder="分享你的观点、经验或问题..."
                                    value={newPost.content}
                                    onChange={e => setNewPost({ ...newPost, content: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow transition-all"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCreatePost}
                                disabled={submitting || !newPost.title || !newPost.content}
                                className={`
                                    px-6 py-2 text-sm font-bold text-white rounded-lg shadow-md transition-all flex items-center gap-2
                                    ${submitting || !newPost.title || !newPost.content
                                        ? 'bg-slate-300 cursor-not-allowed'
                                        : 'bg-[#0081E5] hover:bg-[#0056b3] hover:shadow-lg active:scale-95'
                                    }
                                `}
                            >
                                {submitting && <Loader2 size={14} className="animate-spin" />}
                                发布
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CommunityLayout;
