import React, { useEffect, useState } from 'react';
import { ShieldCheck, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

export type MonitorStatus = 'idle' | 'scanning' | 'success' | 'risk';

interface RiskMonitorModalProps {
    status: MonitorStatus;
}

export const RiskMonitorModal: React.FC<RiskMonitorModalProps> = ({ status }) => {
    const [visible, setVisible] = useState(false);
    const [renderStatus, setRenderStatus] = useState<MonitorStatus>('idle');

    useEffect(() => {
        if (status !== 'idle') {
            setVisible(true);
            setRenderStatus(status);
        } else {
            setVisible(false);
            // Delay clearing the render status to allow exit animation
            const timer = setTimeout(() => setRenderStatus('idle'), 300);
            return () => clearTimeout(timer);
        }
    }, [status]);

    if (renderStatus === 'idle' && !visible) return null;

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        >
            <div
                className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transition-all duration-300 transform ${visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}
            >
                <div className="p-8 flex flex-col items-center text-center min-h-[280px] justify-center">

                    {renderStatus === 'scanning' ? (
                        <div className="flex flex-col items-center animate-in fade-in duration-300 slide-in-from-bottom-2">
                            {/* Icon Area - Scanning */}
                            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 relative">
                                <ShieldCheck className="text-blue-600 w-10 h-10" />
                                <div className="absolute inset-0 border-2 border-blue-100 rounded-full animate-ping opacity-75"></div>
                            </div>

                            <h3 className="text-xl font-bold text-slate-800 mb-2">
                                风险监测进行中
                            </h3>

                            <p className="text-sm text-slate-500 mb-8 leading-relaxed px-4">
                                系统正在对上传的文件进行安全扫描与合规性检测，请稍候...
                            </p>

                            {/* Progress Indicator */}
                            <div className="flex items-center gap-2 text-xs font-medium text-blue-600 bg-blue-50 px-4 py-2 rounded-full">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>扫描中...</span>
                            </div>
                        </div>
                    ) : renderStatus === 'risk' ? (
                        <div className="flex flex-col items-center animate-in fade-in duration-300 slide-in-from-bottom-2">
                            {/* Icon Area - Risk */}
                            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
                                <AlertTriangle className="text-red-500 w-10 h-10" />
                            </div>

                            <h3 className="text-xl font-bold text-slate-800 mb-2">
                                有风险文件
                            </h3>

                            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                                系统检测到该文件内容与知识库内容存在冲突<br />请仔细核验
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center animate-in fade-in duration-300 slide-in-from-bottom-2">
                            {/* Icon Area - Success */}
                            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
                                <CheckCircle2 className="text-green-600 w-10 h-10" />
                            </div>

                            <h3 className="text-xl font-bold text-slate-800 mb-2">
                                无风险文件
                            </h3>

                            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                                文件安全扫描通过，符合合规要求
                            </p>
                        </div>
                    )}

                </div>

                {/* Decorative Bottom Bar - Changes color based on state */}
                <div className={`h-1.5 w-full transition-colors duration-500 ${renderStatus === 'scanning' ? 'bg-blue-500' : renderStatus === 'risk' ? 'bg-red-500' : 'bg-green-500'}`}>
                    {renderStatus === 'scanning' && (
                        <div className="h-full w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500 animate-gradient-x opacity-50"></div>
                    )}
                </div>
            </div>
        </div>
    );
};
