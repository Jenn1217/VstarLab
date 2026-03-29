import React, { useState } from 'react';
import { Search, Calendar, FileText, ArrowRight, AlertCircle } from 'lucide-react';
import AnalysisView from './AnalysisView';

interface DataRow {
    id: string;
    branchCode: string;
    accountCode: string;
    currency: string;
    subBalance: string;
    glBalance: string;
    diff: string;
    partitionKey: string;
}

const ReverseTracking: React.FC = () => {
    const [selectedRow, setSelectedRow] = useState<DataRow | null>(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [hasSearched, setHasSearched] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    // Mock Data for "Unbalanced Data"
    const mockData: DataRow[] = [
        { id: '4', branchCode: '200232058', accountCode: '41011302', currency: 'YCN', subBalance: '2684.53', glBalance: '2281.54', diff: '402.99', partitionKey: '20250605' },
        { id: '5', branchCode: '100132040', accountCode: '1178107', currency: 'YCN', subBalance: '43839.27', glBalance: '43739.50', diff: '99.77', partitionKey: '20250606' },
        { id: '6', branchCode: '001470661', accountCode: '02012013', currency: 'YCN', subBalance: '46514.36', glBalance: '54824.70', diff: '-8310.34', partitionKey: '20250607' },
        { id: '7', branchCode: '100132010', accountCode: '41031303', currency: 'YCN', subBalance: '33355.27', glBalance: '32665.57', diff: '689.70', partitionKey: '20250608' },
        { id: '8', branchCode: '200132058', accountCode: '01028112', currency: 'YCN', subBalance: '7641.28', glBalance: '7566.28', diff: '75.00', partitionKey: '20250608' },
        { id: '10', branchCode: '018270666', accountCode: '05122232', currency: 'YCN', subBalance: '2140.6', glBalance: '791.6', diff: '1349', partitionKey: '20250610' },
    ];

    const handleSearch = () => {
        setIsLoading(true);
        // Simulate API call
        setTimeout(() => {
            setHasSearched(true);
            setIsLoading(false);
        }, 800);
    };

    if (selectedRow) {
        return <AnalysisView onBack={() => setSelectedRow(null)} row={selectedRow} />;
    }

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-6">
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                    账务不平分析
                </h1>
                <p className="text-slate-500 text-sm mt-1">查询并分析系统间的不平账数据</p>
            </div>

            {/* Filter Section */}
            <div className="px-8 py-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-end gap-6">

                    {/* Date Range Picker */}
                    <div className="flex items-center gap-4 flex-1">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-700 mb-2">开始日期</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0081E5]/20 focus:border-[#0081E5] transition-all text-slate-700"
                                />
                            </div>
                        </div>

                        <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-700 mb-2">结束日期</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0081E5]/20 focus:border-[#0081E5] transition-all text-slate-700"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Search Button */}
                    <button
                        onClick={handleSearch}
                        disabled={isLoading}
                        className="px-8 py-2.5 bg-[#0081E5] hover:bg-[#0056b3] text-white rounded-lg shadow-sm hover:shadow-md transition-all flex items-center gap-2 font-medium disabled:opacity-70 disabled:cursor-not-allowed h-[42px]"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Search size={18} />
                        )}
                        查询数据
                    </button>
                </div>
            </div>

            {/* Data Table Section */}
            <div className="flex-1 px-8 pb-8 overflow-hidden flex flex-col">
                {!hasSearched ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-white rounded-xl border border-slate-200 border-dashed">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <Search size={32} className="opacity-50" />
                        </div>
                        <p>请选择日期范围并点击查询</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col animate-[fadeIn_0.5s_ease-out_forwards]">
                        <div className="overflow-auto flex-1">
                            <table className="w-full text-left border-collapse relative">
                                <thead className="sticky top-0 z-10 shadow-sm bg-slate-50 outline outline-1 outline-slate-200">
                                    <tr className="bg-slate-50">
                                        <th className="px-2 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">机构号</th>
                                        <th className="px-2 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">科目号</th>
                                        <th className="px-2 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">币种</th>
                                        <th className="px-2 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">分户账余额</th>
                                        <th className="px-2 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">总账余额</th>
                                        <th className="px-2 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">总分差额</th>
                                        <th className="px-2 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">日期</th>
                                        <th className="px-2 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {mockData.filter(row => {
                                        if (!startDate && !endDate) return true;
                                        const rowDate = `${row.partitionKey.slice(0, 4)}-${row.partitionKey.slice(4, 6)}-${row.partitionKey.slice(6, 8)}`;
                                        if (startDate && rowDate < startDate) return false;
                                        if (endDate && rowDate > endDate) return false;
                                        return true;
                                    }).map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50/80 transition-colors group">
                                            <td className="px-2 py-4 text-sm text-slate-700 font-mono">{row.branchCode}</td>
                                            <td className="px-2 py-4 text-sm text-slate-700 font-mono">{row.accountCode}</td>
                                            <td className="px-2 py-4 text-sm text-slate-600 font-medium">{row.currency}</td>
                                            <td className="px-2 py-4 text-sm text-slate-700 font-mono text-right">{row.subBalance}</td>
                                            <td className="px-2 py-4 text-sm text-slate-700 font-mono text-right">{row.glBalance}</td>
                                            <td className="px-2 py-4 text-sm font-mono text-right font-medium text-red-600">
                                                {row.diff}
                                            </td>
                                            <td className="px-2 py-4 text-center text-sm font-mono text-slate-600">
                                                {`${row.partitionKey.slice(0, 4)}年${parseInt(row.partitionKey.slice(4, 6))}月${parseInt(row.partitionKey.slice(6, 8))}日`}
                                            </td>
                                            <td className="px-2 py-4 text-center">
                                                <button
                                                    onClick={() => setSelectedRow(row)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#f44336] hover:bg-[#d32f2f] text-white text-xs font-medium rounded shadow-sm hover:shadow transition-all"
                                                >
                                                    <AlertCircle size={14} />
                                                    分析
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-sm text-slate-500">
                            <span>共找到 {mockData.length} 条不平数据</span>
                            <div className="flex gap-2">
                                <button className="px-3 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50" disabled>上一页</button>
                                <button className="px-3 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50" disabled>下一页</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReverseTracking;
