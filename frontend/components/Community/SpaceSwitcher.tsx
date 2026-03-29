import React from 'react';
import { Bell, Users, Briefcase, Coffee, Plus } from 'lucide-react';

interface SpaceSwitcherProps {
    activeSpaceId: string;
    onSpaceSelect: (id: string) => void;
    onBack?: () => void;
}

const SpaceSwitcher: React.FC<SpaceSwitcherProps> = ({ activeSpaceId, onSpaceSelect, onBack }) => {
    const spaces = [
        { id: 'notifications', icon: Bell, label: '总行通知' },
        { id: 'department', icon: Briefcase, label: '所属部门' },
        { id: 'project', icon: Users, label: '跨部门项目组' },
        { id: 'guild', icon: Coffee, label: '兴趣公会' },
    ];

    return (
        <div className="w-[70px] h-full bg-[#0081E5] flex flex-col items-center py-4 gap-4 flex-shrink-0">
            {/* Logo */}
            <div
                onClick={onBack}
                className="w-10 h-10 bg-white rounded-xl flex items-center justify-center mb-2 shadow-md cursor-pointer hover:scale-105 transition-transform"
            >
                <img src="/苏州银行.png" alt="Logo" className="w-8 h-8 object-contain" />
            </div>

            <div className="w-8 h-[1px] bg-white/20 mb-2" />

            {/* Spaces */}
            {spaces.map((space) => {
                const isActive = activeSpaceId === space.id;
                return (
                    <div key={space.id} className="relative group">
                        {/* Active Indicator */}
                        {isActive && (
                            <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
                        )}

                        <button
                            onClick={() => onSpaceSelect(space.id)}
                            className={`
w - 10 h - 10 rounded - full flex items - center justify - center transition - all duration - 200
                ${isActive
                                    ? 'bg-white text-[#0081E5] shadow-lg rounded-xl'
                                    : 'bg-white/10 text-white hover:bg-white/20 hover:rounded-xl'
                                }
`}
                        >
                            <space.icon size={20} />
                        </button>

                        {/* Tooltip */}
                        <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                            {space.label}
                        </div>
                    </div>
                );
            })}

            {/* Add Button */}
            <button className="mt-auto w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-green-600 transition-colors">
                <Plus size={20} />
            </button>
        </div>
    );
};

export default SpaceSwitcher;
