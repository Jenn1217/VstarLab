import React from 'react';
import { Bell, Search, Menu } from 'lucide-react';
import { Employee } from '../../types';

interface HeaderProps {
    employee: Employee;
}

const Header: React.FC<HeaderProps> = ({ employee }) => {
    return (
        <header className="bg-white border-b border-slate-100 h-16 px-6 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-4 md:hidden">
                <button className="text-slate-500 hover:text-slate-700">
                    <Menu className="w-6 h-6" />
                </button>
                <span className="font-bold text-bank-700">苏州银行</span>
            </div>

            <div className="hidden md:flex items-center bg-slate-100 rounded-full px-4 py-2 w-96">
                <Search className="w-4 h-4 text-slate-400 mr-2" />
                <input
                    type="text"
                    placeholder="搜索员工、部门或文件..."
                    className="bg-transparent border-none outline-none text-sm text-slate-700 w-full placeholder:text-slate-400"
                />
            </div>

            <div className="flex items-center gap-6">
                <div className="relative cursor-pointer group">
                    <Bell className="w-5 h-5 text-slate-500 group-hover:text-bank-600 transition-colors" />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                </div>

                <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium text-slate-800">{employee.name}</p>
                        <p className="text-xs text-slate-500">{employee.title}</p>
                    </div>
                    <img
                        src={employee.avatarUrl}
                        alt="User"
                        className="w-9 h-9 rounded-full object-cover border border-slate-200"
                    />
                </div>
            </div>
        </header>
    );
};

export default Header;
