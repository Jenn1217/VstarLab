import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import ProfileCard from './ProfileCard';
import { INITIAL_EMPLOYEE } from './constants';
import { Employee } from '../../types';

interface UserPageLayoutProps {
    onBack: () => void;
    onLogout: () => void;
    currentUser: Employee | null;
}

const UserPageLayout: React.FC<UserPageLayoutProps> = ({ onBack, onLogout, currentUser }) => {
    const [employee, setEmployee] = useState<Employee>(currentUser || INITIAL_EMPLOYEE);

    const handleUpdateEmployee = (updatedData: Employee) => {
        setEmployee(updatedData);
        // In a real app, you would save this to a backend here
        console.log("Saving employee data:", updatedData);
    };
    // ... rest of the file


    return (
        <div className="flex h-full w-full bg-slate-50 overflow-hidden text-slate-900 font-sans">
            <Sidebar onBack={onBack} onLogout={onLogout} />

            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <Header employee={employee} />

                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="max-w-5xl mx-auto space-y-6">

                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800">个人档案</h1>
                                <p className="text-slate-500 text-sm mt-1">查看及管理您的个人工作信息</p>
                            </div>
                            <div className="text-xs text-slate-400">
                                最后更新: 2025-10-27
                            </div>
                        </div>

                        <ProfileCard
                            employee={employee}
                            onUpdate={handleUpdateEmployee}
                        />

                    </div>
                </main>
            </div>
        </div>
    );
};

export default UserPageLayout;
