import React, { useState, useRef, useEffect } from 'react';
import { Search, Pin, ChevronDown, CheckCircle, AlertCircle, Send, Paperclip } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
    id: string;
    user: {
        name: string;
        role: string;
        avatar?: string;
    };
    content: string;
    timestamp: string;
    type: 'discussion' | 'ai_citation';
}

const CommunityWorkspace: React.FC = () => {
    // Mock Conclusion State
    const [conclusion, setConclusion] = useState({
        title: "同业拆借利息计算统一口径",
        content: "经财务会计部确认，全部 **2个月以内** 的同业拆借业务，利息计算统一采用 **“实际天数/360”** 惯例。",
        source: "《金融企业会计制度》第42条",
        scope: "全行 / 同业业务",
        confirmedBy: "宋掌门",
        confirmedAt: "2025-12-16 09:58",
        status: "confirmed" // confirmed, pending
    });

    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            user: { name: '何苹果', role: '财务专员', avatar: '/初始头像.png' },
            content: '宋总，关于Q3季度的同业拆借利息，我们是否按新准则执行？之前是按365天算的。',
            timestamp: '09:45',
            type: 'discussion'
        },
        {
            id: '2',
            user: { name: 'AI 助手', role: '制度引用', avatar: '/苏州银行.png' },
            content: '> **根据《金融企业会计制度》：**\n> 短期同业拆借（1年以内）通常采用实际天数/360作为计息基础，除非合同另有明确约定。\n\n建议核查具体合同条款。',
            timestamp: '09:46',
            type: 'ai_citation'
        },
        {
            id: '3',
            user: { name: '宋掌门', role: '财务总经理', avatar: '/初始头像.png' },
            content: '@何苹果 按AI引用的制度走，统一改用360天。这块必须和人行口径保持一致。',
            timestamp: '09:55',
            type: 'discussion'
        }
    ]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    return (
        <div className="flex-1 flex flex-col bg-white relative overflow-hidden">
            {/* Header */}
            <div className="h-14 px-6 flex items-center justify-between border-b border-slate-200 bg-white z-20 shadow-sm">
                <div>
                    <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        📁 同业拆借与资金成本
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium border border-green-200">
                            已确认
                        </span>
                    </h1>
                </div>
                <div className="flex items-center gap-4 text-slate-500">
                    <span className="text-xs">上次更新: 今日 10:00</span>
                    <Search size={18} />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 p-6 custom-scrollbar">
                <div className="max-w-4xl mx-auto space-y-8">

                    {/* 1. Conclusion Card (Pinned) */}
                    <div className="bg-white rounded-xl shadow-sm border border-l-4 border-slate-200 border-l-[#0081E5] p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <CheckCircle size={120} className="text-[#0081E5]" />
                        </div>

                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div>
                                <h3 className="text-sm font-bold text-[#0081E5] uppercase tracking-wider mb-1 flex items-center gap-2">
                                    <Pin size={14} className="fill-current" /> 最终口径结论
                                </h3>
                                <h2 className="text-xl font-bold text-slate-900">{conclusion.title}</h2>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold text-slate-900">{conclusion.confirmedBy}</div>
                                <div className="text-xs text-slate-500">确认人</div>
                            </div>
                        </div>

                        <div className="bg-[#F8FAF6] rounded-lg p-4 text-slate-800 text-base leading-relaxed border border-[#E8F0E0] mb-4 relative z-10">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{conclusion.content}</ReactMarkdown>
                        </div>

                        <div className="flex gap-8 text-sm text-slate-600 relative z-10">
                            <div>
                                <span className="block text-xs text-slate-400 mb-0.5">依据来源</span>
                                <span className="font-medium">{conclusion.source}</span>
                            </div>
                            <div>
                                <span className="block text-xs text-slate-400 mb-0.5">适用范围</span>
                                <span className="font-medium">{conclusion.scope}</span>
                            </div>
                            <div>
                                <span className="block text-xs text-slate-400 mb-0.5">确认时间</span>
                                <span className="font-medium">{conclusion.confirmedAt}</span>
                            </div>
                        </div>
                    </div>

                    {/* 2. Discussion Thread (Traceability) */}
                    <div className="relative">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="h-px bg-slate-200 flex-1"></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2">讨论过程复盘</span>
                            <div className="h-px bg-slate-200 flex-1"></div>
                        </div>

                        <div className="space-y-6 pl-4 border-l-2 border-slate-200 ml-4 pb-8">
                            {messages.map((msg) => (
                                <div key={msg.id} className="relative pl-6 group">
                                    {/* Timeline Dot */}
                                    <div className={`absolute - left - [29px] top - 1 w - 3.5 h - 3.5 rounded - full border - 2 border - white ring - 1 
                                        ${msg.type === 'ai_citation' ? 'bg-indigo-500 ring-indigo-200' : 'bg-slate-400 ring-slate-200'} `}></div>

                                    <div className="flex items-baseline justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-slate-800">{msg.user.name}</span>
                                            <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{msg.user.role}</span>
                                        </div>
                                        <span className="text-xs text-slate-400 font-mono">{msg.timestamp}</span>
                                    </div>

                                    <div className={`text - sm leading - relaxed p - 3 rounded - lg border  
                                        ${msg.type === 'ai_citation'
                                            ? 'bg-indigo-50 border-indigo-100 text-slate-700'
                                            : 'bg-white border-slate-200 text-slate-800 shadow-sm'
                                        } `}>
                                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>

            {/* Input Area (Formal) */}
            <div className="p-4 bg-white border-t border-slate-200 z-20">
                <div className="max-w-4xl mx-auto flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-400">
                        <span className="font-bold text-sm">我</span>
                    </div>
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-[#0081E5]/20 focus-within:border-[#0081E5] transition-all">
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="输入补充意见或发起新的讨论..."
                            className="w-full bg-transparent border-none focus:ring-0 resize-none p-3 text-sm min-h-[48px]"
                            rows={1}
                        />
                        <div className="flex justify-between items-center px-2 pb-2">
                            <div className="flex gap-1">
                                <button className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200">
                                    <Paperclip size={16} />
                                </button>
                            </div>
                            <button className="px-4 py-1.5 bg-slate-800 text-white text-xs font-bold rounded hover:bg-slate-900 transition-colors flex items-center gap-2">
                                发送 <Send size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommunityWorkspace;
