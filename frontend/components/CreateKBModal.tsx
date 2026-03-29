import React, { useState } from 'react';
import { X, Globe, Users, Lock } from 'lucide-react';

interface CreateKBModalProps {
    onClose: () => void;
    onCreate: (data: { title: string; description: string; visibility: string }) => void;
}

const CreateKBModal: React.FC<CreateKBModalProps> = ({ onClose, onCreate }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [visibility, setVisibility] = useState('department');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onCreate({ title, description, visibility });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-[500px] overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800">新建知识库</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">

                    {/* KB Name */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700">
                            知识库名称 <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="请输入知识库名称"
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                    </div>

                    {/* Visibility */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-slate-700">可见范围</label>
                        <div className="grid grid-cols-3 gap-3">
                            <label className={`
                relative flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all
                ${visibility === 'private' ? 'border-blue-500 bg-blue-50/50 text-blue-700' : 'border-slate-100 hover:border-slate-200 text-slate-600'}
              `}>
                                <input
                                    type="radio"
                                    name="visibility"
                                    value="private"
                                    checked={visibility === 'private'}
                                    onChange={(e) => setVisibility(e.target.value)}
                                    className="hidden"
                                />
                                <Lock className="mb-2" size={24} />
                                <span className="text-sm font-medium">仅自己可见</span>
                            </label>

                            <label className={`
                relative flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all
                ${visibility === 'department' ? 'border-blue-500 bg-blue-50/50 text-blue-700' : 'border-slate-100 hover:border-slate-200 text-slate-600'}
              `}>
                                <input
                                    type="radio"
                                    name="visibility"
                                    value="department"
                                    checked={visibility === 'department'}
                                    onChange={(e) => setVisibility(e.target.value)}
                                    className="hidden"
                                />
                                <Users className="mb-2" size={24} />
                                <span className="text-sm font-medium">当前部门可见</span>
                            </label>

                            <label className={`
                relative flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all
                ${visibility === 'public' ? 'border-blue-500 bg-blue-50/50 text-blue-700' : 'border-slate-100 hover:border-slate-200 text-slate-600'}
              `}>
                                <input
                                    type="radio"
                                    name="visibility"
                                    value="public"
                                    checked={visibility === 'public'}
                                    onChange={(e) => setVisibility(e.target.value)}
                                    className="hidden"
                                />
                                <Globe className="mb-2" size={24} />
                                <span className="text-sm font-medium">所有人可见</span>
                            </label>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700">
                            简介 <span className="text-slate-400 font-normal">(选填)</span>
                        </label>
                        <textarea
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="请输入知识库简介..."
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                        />
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm shadow-blue-200 transition-all text-sm font-medium"
                        >
                            新建
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default CreateKBModal;
