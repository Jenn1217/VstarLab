import React, { useState } from 'react';
import { ShieldCheck, FileText, Calendar, Users, Briefcase } from 'lucide-react';

const ContextPanel: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'facts' | 'responsibility'>('facts');

    const facts = {
        policies: [
            { id: 1, title: '《金融企业会计制度》', clause: '第42条: 同业拆借利息计算...', tag: '核心制度' },
            { id: 2, title: '《苏州银行同业业务管理办法》', clause: '第三章: 资金成本核算...', tag: '行内制度' },
        ],
        data: [
            { label: '涉及金额', value: '2,000.00 万元' },
            { label: '预计利息差异', value: '¥ 12,500.33', highlight: true },
        ],
        period: "2025Q3 (2025-07-01 ~ 2025-09-30)"
    };

    const responsibilities = [
        { role: '口径确认人', name: '宋掌门', dept: '财务会计部', avatar: '/初始头像.png', type: 'primary' },
        { role: '执行责任人', name: '何苹果', dept: '财务会计部', avatar: '/初始头像.png', type: 'secondary' },
        { role: '复核责任人', name: '张主管', dept: '派驻财务团队', avatar: '/初始头像.png', type: 'secondary' },
    ];

    return (
        <div className="w-[280px] h-full bg-white border-l border-slate-200 flex flex-col flex-shrink-0">
            {/* Header Title */}
            <div className="h-14 flex items-center px-4 border-b border-slate-200">
                <span className="font-bold text-slate-800">业务背景信息</span>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50/50">
                <button
                    onClick={() => setActiveTab('facts')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'facts' ? 'text-[#0081E5] border-[#0081E5] bg-white' : 'text-slate-500 border-transparent hover:text-slate-700'}`}
                >
                    事实与依据
                </button>
                <button
                    onClick={() => setActiveTab('responsibility')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'responsibility' ? 'text-[#0081E5] border-[#0081E5] bg-white' : 'text-slate-500 border-transparent hover:text-slate-700'}`}
                >
                    责任链
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/30">
                {activeTab === 'facts' ? (
                    <div className="space-y-6">
                        {/* 1. Policies */}
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                                <FileText size={14} /> 关键制度依据
                            </h3>
                            <div className="space-y-3">
                                {facts.policies.map(p => (
                                    <div key={p.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:border-[#0081E5]/50 transition-colors cursor-pointer group">
                                        <div className="flex items-start justify-between mb-1">
                                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-medium">{p.tag}</span>
                                        </div>
                                        <div className="font-bold text-slate-800 text-sm mb-1 group-hover:text-[#0081E5] transition-colors">{p.title}</div>
                                        <div className="text-xs text-slate-500 line-clamp-2">{p.clause}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 2. Data */}
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                                <Briefcase size={14} /> 核心数据影响
                            </h3>
                            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                                {facts.data.map((d, i) => (
                                    <div key={i} className={`flex justify-between items-center p-3 border-b border-slate-100 last:border-0 ${d.highlight ? 'bg-yellow-50/50' : ''}`}>
                                        <span className="text-sm text-slate-600">{d.label}</span>
                                        <span className={`text-sm font-mono font-medium ${d.highlight ? 'text-red-600' : 'text-slate-800'}`}>{d.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 3. Period */}
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                                <Calendar size={14} /> 适用期间
                            </h3>
                            <div className="text-sm font-medium text-slate-800 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                {facts.period}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {responsibilities.map((r, i) => (
                            <div key={i} className="relative pl-4 border-l-2 border-slate-200">
                                <div className={`absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full border-2 border-white  ${r.type === 'primary' ? 'bg-[#0081E5]' : 'bg-slate-300'}`} />

                                <div className="mb-1">
                                    <span className={`text-xs font-bold uppercase tracking-wider ${r.type === 'primary' ? 'text-[#0081E5]' : 'text-slate-500'}`}>
                                        {r.role}
                                    </span>
                                </div>

                                <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                    <img src={r.avatar} className="w-10 h-10 rounded-full bg-slate-100 object-cover" />
                                    <div>
                                        <div className="font-bold text-slate-800 text-sm">{r.name}</div>
                                        <div className="text-xs text-slate-500">{r.dept}</div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-4">
                            <div className="flex items-start gap-2">
                                <ShieldCheck size={16} className="text-blue-600 mt-0.5 shrink-0" />
                                <p className="text-xs text-blue-700 leading-relaxed">
                                    所有责任人操作均已通过数字签名留痕，满足内控合规审计要求。
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Status Footer */}
            <div className="p-4 border-t border-slate-200 bg-white">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">当前状态</span>
                    <span className="text-xs font-mono text-slate-400">ID: #BUS-2025-Q3-082</span>
                </div>
                <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-lg border border-green-200">
                    <ShieldCheck size={18} />
                    <span className="font-bold text-sm">口径已确认 (已生效)</span>
                </div>
            </div>
        </div>
    );
};

export default ContextPanel;
