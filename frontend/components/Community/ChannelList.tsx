import React, { useState } from 'react';
import { ChevronDown, Folder, Clock, CheckCircle, Plus, ArrowLeft } from 'lucide-react';

interface ChannelListProps {
    activeChannelId: string;
    onChannelSelect: (id: string) => void;
    onBack?: () => void;
}

const ChannelList: React.FC<ChannelListProps> = ({ activeChannelId, onChannelSelect, onBack }) => {
    const [expandedCategories, setExpandedCategories] = useState<string[]>(['active', 'archived']);

    const toggleCategory = (id: string) => {
        setExpandedCategories(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        );
    };

    const categories = [
        {
            id: 'active',
            label: '进行中',
            topics: [
                { id: 'c1', label: 'Q3 财报编制', icon: Folder, status: 'doing' },
                { id: 'c2', label: '同业拆借与资金成本', icon: Folder, status: 'doing' },
                { id: 'c3', label: '会计政策变更(2025)', icon: Folder, status: 'doing' },
            ]
        },
        {
            id: 'archived',
            label: '已归档 / 审计',
            topics: [
                { id: 'c4', label: '审计问题跟踪', icon: CheckCircle, status: 'done' },
            ]
        }
    ];

    return (
        <div className="w-[260px] h-full bg-[#F7F8FA] flex flex-col border-r border-slate-200 flex-shrink-0">
            {/* Header */}
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200">
                <div>
                    <h2 className="font-bold text-slate-800 text-base">业务主题</h2>
                    <p className="text-[10px] text-slate-400">当前部门：财务会计部</p>
                </div>
                <button className="p-1.5 hover:bg-slate-200 rounded-md text-slate-500 transition-colors">
                    <Plus size={18} />
                </button>
            </div>

            {/* Topics */}
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 custom-scrollbar">
                {categories.map(category => (
                    <div key={category.id}>
                        <button
                            onClick={() => toggleCategory(category.id)}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-2 hover:text-slate-700 w-full px-1"
                        >
                            <ChevronDown
                                size={12}
                                className={`transition-transform duration-200 ${expandedCategories.includes(category.id) ? '' : '-rotate-90'}`}
                            />
                            {category.label}
                        </button>

                        {expandedCategories.includes(category.id) && (
                            <div className="space-y-1">
                                {category.topics.map(topic => {
                                    const isActive = activeChannelId === topic.id;
                                    return (
                                        <button
                                            key={topic.id}
                                            onClick={() => onChannelSelect(topic.id)}
                                            className={`
                        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group
                        ${isActive
                                                    ? 'bg-white text-[#0081E5] shadow-sm ring-1 ring-[#0081E5]/20 font-medium'
                                                    : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
                                                }
                      `}
                                        >
                                            <topic.icon size={18} className={`${isActive ? 'text-[#0081E5]' : 'text-slate-400 group-hover:text-slate-500'}`} />
                                            <span className="truncate">{topic.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Disclaimer / Footer */}
            <div className="p-4 border-t border-slate-200 text-center">
                <button
                    onClick={onBack}
                    className="w-full flex items-center justify-center gap-2 mb-3 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400 transition-all text-sm font-medium shadow-sm"
                >
                    <ArrowLeft size={16} />
                    返回主页
                </button>
                <span className="text-[10px] text-slate-400 block">所有操作均会被审计记录</span>
            </div>
        </div>
    );
};

export default ChannelList;
