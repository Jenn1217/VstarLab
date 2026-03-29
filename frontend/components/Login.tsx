import React, { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Employee } from '../types';
import { login } from '../services/backendService';
import logoUrl from '../pic/vstarlab.png';

interface LoginProps {
    onLoginSuccess: (user: Employee) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [jobId, setJobId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!jobId || !password) return;

        setIsLoading(true);
        setError('');

        try {
            const user = await login(jobId, password);
            onLoginSuccess(user);
        } catch (err) {
            if (err instanceof Error) {
                if (err.message === "INVALID_CREDENTIALS") {
                    setError('登录失败：账号或密码错误');
                } else if (err.message === "NETWORK_ERROR") {
                    setError('无法连接到后端服务：请确认后端已启动且地址可达');
                } else {
                    setError('登录失败：后端服务异常');
                }
            } else {
                setError('登录失败：未知错误');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex h-screen bg-slate-50 items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100">
                {/* Decoration */}
                <div className="h-2 bg-gradient-to-r from-bank-600 to-bank-800"></div>

                <div className="p-8">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center mb-4">
                            <img src={logoUrl} alt="Vstar Lab Logo" className="h-16 w-auto object-contain" />
                        </div>
                        <p className="text-slate-500 text-sm mt-1">欢迎使用财析入微</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5 ml-1">工号 (Job ID)</label>
                            <input
                                type="text"
                                value={jobId}
                                onChange={(e) => setJobId(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-bank-500 focus:border-transparent transition-all"
                                placeholder="sz123456"
                                disabled={isLoading}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5 ml-1">密码 (Password)</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-bank-500 focus:border-transparent transition-all pr-12"
                                    placeholder="szz123456"
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 text-red-600 text-sm py-2 px-3 rounded-md flex items-center justify-center">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-[#0081E5] hover:bg-[#0056b3] text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-70 flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    登录中...
                                </>
                            ) : "安全登录"}
                        </button>
                    </form>
                </div>

                <div className="bg-slate-50 py-4 text-center border-t border-slate-100">
                    <p className="text-xs text-slate-400">© 2026 万星智能</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
