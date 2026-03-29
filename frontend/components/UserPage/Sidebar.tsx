import React from 'react';
import { LayoutDashboard, User, Banknote, Clock, Settings, LogOut, Home } from 'lucide-react';
import { MENU_ITEMS } from './constants';

const IconMap: Record<string, React.ElementType> = {
    LayoutDashboard,
    User,
    Banknote,
    Clock,
    Settings,
};

interface SidebarProps {
    onBack?: () => void;
    onLogout?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onBack, onLogout }) => {
    return (
        <div className="w-64 bg-white h-full shadow-lg flex flex-col hidden md:flex border-r border-slate-100">
            <div className="p-6 flex items-center gap-3 border-b border-slate-100">
                <div className="w-10 h-10 bg-bank-600 rounded-lg flex items-center justify-center shadow-md">
                    {/* Abstract Bank Logo */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white w-6 h-6"><path d="M3 21h18" /><path d="M5 21v-7" /><path d="M19 21v-7" /><path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3H4v-3z" /><path d="M12 3L4 10h16z" /></svg>
                </div>
                <div>
                    <h1 className="text-lg font-bold text-slate-800 tracking-tight">苏州银行</h1>
                    <p className="text-xs text-slate-500 font-medium">员工服务平台</p>
                </div>
            </div>

            <nav className="flex-1 p-4 space-y-1">
                {MENU_ITEMS.map((item) => {
                    const Icon = IconMap[item.icon];
                    return (
                        <button
                            key={item.name}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${item.active
                                ? 'bg-bank-50 text-bank-700 shadow-sm border border-bank-100'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                        >
                            <Icon className={`w-5 h-5 ${item.active ? 'text-bank-600' : 'text-slate-400'}`} />
                            {item.name}
                        </button>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-slate-100 space-y-2">
                <button
                    onClick={onBack}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-600 hover:text-bank-700 hover:bg-bank-50 rounded-lg transition-colors"
                >
                    <Home className="w-5 h-5" />
                    返回首页
                </button>
                <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    退出登录
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
