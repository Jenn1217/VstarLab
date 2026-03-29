import React, { useState } from 'react';
import { Employee, ViewMode } from '../../types';
import { Mail, Phone, MapPin, Calendar, Briefcase, BadgeCheck, Loader2, Sparkles, Building2 } from 'lucide-react';
import { generateProfessionalBio } from '../../services/geminiService';

interface ProfileCardProps {
    employee: Employee;
    onUpdate: (updatedEmployee: Employee) => void;
}

const ProfileCard: React.FC<ProfileCardProps> = ({ employee, onUpdate }) => {
    const [mode, setMode] = useState<ViewMode>(ViewMode.VIEW);
    const [formData, setFormData] = useState<Employee>(employee);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        onUpdate(formData);
        setMode(ViewMode.VIEW);
    };

    const handleCancel = () => {
        setFormData(employee);
        setMode(ViewMode.VIEW);
    };

    const handleGenerateBio = async () => {
        setIsGenerating(true);
        try {
            const bio = await generateProfessionalBio(formData);
            setFormData(prev => ({ ...prev, bio }));
        } catch (error) {
            alert("AI生成简介失败");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Banner / Header Background */}
            <div className="h-32 bg-gradient-to-r from-bank-600 to-bank-800 relative">
                <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
            </div>

            <div className="px-8 pb-8">
                {/* Profile Header & Avatar */}
                <div className="relative flex justify-between items-end -mt-12 mb-6">
                    <div className="flex items-end gap-6">
                        <div className="relative">
                            <img
                                src={employee.avatarUrl}
                                alt={employee.name}
                                className="w-32 h-32 rounded-xl border-4 border-white shadow-lg object-cover bg-slate-200"
                            />
                            <div className="absolute -bottom-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full shadow-sm border-2 border-white flex items-center gap-1">
                                <BadgeCheck className="w-3 h-3" />
                                已认证
                            </div>
                        </div>
                        <div className="mb-1">
                            <h2 className="text-3xl font-bold text-slate-800">{formData.name}</h2>
                            <p className="text-slate-500 font-medium flex items-center gap-2 mt-1">
                                <Briefcase className="w-4 h-4 text-bank-600" />
                                {formData.title}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3 mb-1">
                        {mode === ViewMode.VIEW ? (
                            <button
                                onClick={() => setMode(ViewMode.EDIT)}
                                className="px-6 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 hover:text-bank-700 transition-colors shadow-sm"
                            >
                                编辑资料
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={handleCancel}
                                    className="px-4 py-2 bg-white border border-slate-300 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="px-6 py-2 bg-bank-600 text-white font-medium rounded-lg hover:bg-bank-700 shadow-md transition-colors"
                                >
                                    保存更改
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Column: Basic Info */}
                    <div className="lg:col-span-2 space-y-8">

                        {/* Contact Information Section */}
                        <section>
                            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">基本信息</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                                <InfoItem
                                    icon={Building2}
                                    label="工号"
                                    value={formData.id}
                                    isEditing={mode === ViewMode.EDIT}
                                    name="id"
                                    onChange={handleInputChange}
                                    disabled={true} // ID usually cannot be changed
                                />
                                <InfoItem
                                    icon={Building2}
                                    label="所属部门"
                                    value={formData.department}
                                    isEditing={mode === ViewMode.EDIT}
                                    name="department"
                                    onChange={handleInputChange}
                                />
                                <InfoItem
                                    icon={Mail}
                                    label="电子邮箱"
                                    value={formData.email}
                                    isEditing={mode === ViewMode.EDIT}
                                    name="email"
                                    onChange={handleInputChange}
                                />
                                <InfoItem
                                    icon={Phone}
                                    label="手机号码"
                                    value={formData.phone}
                                    isEditing={mode === ViewMode.EDIT}
                                    name="phone"
                                    onChange={handleInputChange}
                                />
                                <InfoItem
                                    icon={MapPin}
                                    label="办公地点"
                                    value={formData.location}
                                    isEditing={mode === ViewMode.EDIT}
                                    name="location"
                                    onChange={handleInputChange}
                                />
                                <InfoItem
                                    icon={Calendar}
                                    label="入职日期"
                                    value={formData.joinDate}
                                    isEditing={mode === ViewMode.EDIT}
                                    name="joinDate"
                                    onChange={handleInputChange}
                                    type="date"
                                />
                            </div>
                        </section>

                        {/* Bio Section */}
                        <section className="relative">
                            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">个人简介</h3>
                                {mode === ViewMode.EDIT && (
                                    <button
                                        onClick={handleGenerateBio}
                                        disabled={isGenerating}
                                        className="text-xs flex items-center gap-1.5 text-bank-600 font-medium bg-bank-50 px-3 py-1.5 rounded-full hover:bg-bank-100 transition-colors disabled:opacity-50"
                                    >
                                        {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                        {isGenerating ? 'AI 生成中...' : 'AI 智能生成'}
                                    </button>
                                )}
                            </div>

                            {mode === ViewMode.EDIT ? (
                                <textarea
                                    name="bio"
                                    value={formData.bio}
                                    onChange={handleInputChange}
                                    rows={4}
                                    className="w-full p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-bank-500 focus:border-transparent outline-none text-slate-700 leading-relaxed text-sm bg-slate-50"
                                    placeholder="请输入或使用AI生成简介..."
                                />
                            ) : (
                                <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 text-slate-700 leading-relaxed text-sm relative">
                                    <span className="text-4xl text-bank-200 absolute -top-2 left-2">“</span>
                                    <p className="relative z-10 px-4">{formData.bio}</p>
                                    <span className="text-4xl text-bank-200 absolute -bottom-8 right-4 rotate-180">“</span>
                                </div>
                            )}
                        </section>
                    </div>

                    {/* Right Column: Status Card */}
                    <div className="space-y-6">
                        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                            <h4 className="text-slate-300 text-xs font-semibold uppercase mb-4 tracking-wider">数字工牌</h4>
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
                                    <img src="https://cdn-icons-png.flaticon.com/512/265/265674.png" className="w-8 h-8 opacity-80 invert" alt="QR" />
                                </div>
                                <div>
                                    <p className="text-lg font-bold font-mono tracking-widest">{formData.id}</p>
                                    <p className="text-emerald-400 text-xs font-medium">状态: 在职 (Active)</p>
                                </div>
                            </div>
                            <div className="border-t border-white/10 pt-4 flex justify-between items-end">
                                <div>
                                    <p className="text-slate-400 text-xs">安全级别</p>
                                    <p className="font-semibold text-sm">Level 4</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-slate-400 text-xs">有效期至</p>
                                    <p className="font-semibold text-sm">2026/12/31</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                            <h4 className="text-slate-800 font-semibold mb-3">快捷操作</h4>
                            <div className="space-y-2">
                                <button className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-md transition-colors flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-500"></span> 重置密码
                                </button>
                                <button className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-md transition-colors flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-orange-500"></span> 更新签名档
                                </button>
                                <button className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-md transition-colors flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-purple-500"></span> 申请权限变更
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

// Helper Sub-component for individual fields
interface InfoItemProps {
    icon: React.ElementType;
    label: string;
    value: string;
    isEditing: boolean;
    name: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    type?: string;
}

const InfoItem: React.FC<InfoItemProps> = ({ icon: Icon, label, value, isEditing, name, onChange, disabled = false, type = "text" }) => (
    <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
        <div className="w-10 h-10 rounded-full bg-bank-50 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-bank-600" />
        </div>
        <div className="flex-1">
            <p className="text-xs text-slate-500 mb-0.5">{label}</p>
            {isEditing ? (
                <input
                    type={type}
                    name={name}
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                    className={`w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm text-slate-800 focus:ring-1 focus:ring-bank-500 focus:border-bank-500 outline-none ${disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                />
            ) : (
                <p className="text-sm font-medium text-slate-800 break-all">{value}</p>
            )}
        </div>
    </div>
);

export default ProfileCard;
