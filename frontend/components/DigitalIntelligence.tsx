import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Search, Download, Calendar, Copy, Info } from 'lucide-react';
import { TableQueryParams, TableRow } from '../types';
import { queryTableData } from '../services/backendService';

const TABLE_CONFIG = {
    'acct_bal_new2': {
        columns: [
            { key: 'acct_num', label: '账号 (acct_num)', type: 'text' },
            { key: 'org_num', label: '机构号 (org_num)', type: 'text' },
            { key: 'sbj_num', label: '科目号 (sbj_num)', type: 'text' },
            { key: 'ccy', label: '币种 (ccy)', type: 'text' },
            { key: 'sbact_acct_bal', label: '分户账余额 (sbact_acct_bal)', align: 'right', type: 'number' },
            { key: 'gnl_ldgr_bal', label: '总账余额 (gnl_ldgr_bal)', align: 'right', type: 'number' },
            { key: 'acg_dt', label: '会计日期 (acg_dt)', align: 'right', type: 'date' },
            { key: 'dt', label: '分区键 (dt)', type: 'text' }
        ]
    }
};

const DigitalIntelligence: React.FC = () => {
    const [params, setParams] = useState<TableQueryParams>({
        tableName: 'acct_bal_new2',
        accountNum: '',
        orgNum: '',
        subjNum: '',
        startDate: '2025-06-01',
        endDate: '2025-06-10',
        page: 1,
        pageSize: 20
    });

    const [data, setData] = useState<TableRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [showAnalysis, setShowAnalysis] = useState(false);

    // Split pane state
    const [splitRatio, setSplitRatio] = useState(50); // Percentage for Left Pane
    const isResizing = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const startResizing = () => {
        isResizing.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResizing);
        document.body.style.userSelect = 'none'; // Prevent selection while dragging
    };

    const stopResizing = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResizing);
        document.body.style.userSelect = '';
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing.current || !containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        const newRatio = (newWidth / containerRect.width) * 100;

        // Limits
        if (newRatio > 20 && newRatio < 80) {
            setSplitRatio(newRatio);
        }
    };

    const currentColumns = TABLE_CONFIG['acct_bal_new2'].columns;

    const handleQuery = async (resetPage = true) => {
        setLoading(true);
        setSelectedRows(new Set());

        let queryParams = { ...params };
        if (resetPage) {
            queryParams.page = 1;
            setParams(prev => ({ ...prev, page: 1 }));
        }

        try {
            const result: any = await queryTableData(queryParams);
            if (Array.isArray(result)) {
                setData(result);
                setTotal(result.length);
            } else {
                setData(result.data || []);
                setTotal(result.total || 0);
            }
        } catch (e) {
            console.error("Query failed", e);
            setData([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    const handlePageChange = async (newPage: number) => {
        if (loading) return;
        setLoading(true);
        setSelectedRows(new Set());
        const newParams = { ...params, page: newPage };
        setParams(newParams);

        try {
            const result: any = await queryTableData(newParams);
            if (Array.isArray(result)) {
                setData(result);
                setTotal(result.length);
            } else {
                setData(result.data || []);
                setTotal(result.total || 0);
            }
        } catch (e) {
            console.error("Page change query failed", e);
        } finally {
            setLoading(false);
        }
    };

    const toggleSelectAll = () => {
        if (selectedRows.size === data.length && data.length > 0) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(data.map(r => r.id)));
        }
    };

    const toggleSelectRow = (id: string) => {
        const newSet = new Set(selectedRows);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedRows(newSet);
    };

    const formatDate = (dateStr: string) => {
        return dateStr ? dateStr.replace('T', ' ').slice(0, 16) : '-';
    };

    const totalPages = Math.ceil(total / (params.pageSize || 20));

    const handleExport = () => {
        if (selectedRows.size === 0) {
            alert("请先勾选需要导出的数据");
            return;
        }
        const rowsToExport = data.filter(r => selectedRows.has(r.id));
        const exportData = rowsToExport.map(row => {
            const newRow: Record<string, any> = {};
            currentColumns.forEach((col: { label: string; key: string | number; }) => {
                newRow[col.label] = row[col.key];
            });
            return newRow;
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data");
        const dateStr = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `${params.tableName}_${dateStr}.xlsx`);
    };

    // --- CHART LOGIC (CUSTOM SVG) ---
    const chartPoints = useMemo(() => {
        if (!data || data.length === 0) return { points: '', min: 0, max: 0, items: [] };

        const items = data.map(item => ({
            time: formatDate(item.acg_dt).split(' ')[0],
            value: parseFloat(item.sbact_acct_bal as string) || 0
        })).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        const values = items.map(d => d.value);
        let min = Math.min(...values);
        let max = Math.max(...values);

        // Add margin
        const range = max - min;
        if (range === 0) {
            min -= 10;
            max += 10;
        } else {
            min -= range * 0.1;
            max += range * 0.1;
        }

        // Assume viewbox 1000 x 400 for calculation
        const width = 1000;
        const height = 400;
        const padding = { top: 20, bottom: 40, left: 0, right: 0 };
        const graphW = width;
        const graphH = height - padding.top - padding.bottom;

        const getX = (i: number) => (i / (items.length - 1 || 1)) * graphW;
        const getY = (val: number) => padding.top + graphH - ((val - min) / (max - min)) * graphH;

        const points = items.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' ');

        return { points, min, max, items };
    }, [data]);

    // Delay Analysis Show
    useEffect(() => {
        let timer: any;
        if (chartPoints.items.length > 0) {
            timer = setTimeout(() => {
                setShowAnalysis(true);
            }, 2000);
        } else {
            setShowAnalysis(false);
        }
        return () => clearTimeout(timer);
    }, [chartPoints]);

    // Tooltip State for Custom Chart
    const [hoverInfo, setHoverInfo] = useState<{ x: number, y: number, data: any } | null>(null);

    const onChartMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
        if (!chartPoints.items.length) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;

        // Find nearest
        const ratio = x / rect.width;
        let idx = Math.round(ratio * (chartPoints.items.length - 1));
        idx = Math.max(0, Math.min(idx, chartPoints.items.length - 1));

        const item = chartPoints.items[idx];

        // Calculate tooltip X position relative to chart
        // We need to map back to percentage to position the line/dot
        setHoverInfo({ x: (idx / (chartPoints.items.length - 1 || 1)) * 100, y: 0, data: item });
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
            {/* Filters Area (Top) */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm z-10 w-full">
                <div className="flex flex-wrap items-end gap-3 w-full">

                    {/* Table Selector (Compact) */}
                    <div className="flex flex-col gap-1 w-40 shrink-0">
                        <label className="text-xs font-semibold text-slate-500">选择表</label>
                        <select
                            className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-1 focus:ring-[#0081E5] focus:border-[#0081E5] block w-full p-2 outline-none transition-all truncate"
                            value={params.tableName}
                            disabled={true}
                        >
                            <option value="acct_bal_new2">分户余额表</option>
                        </select>
                    </div>

                    {/* Account Num (Flexible but min width) */}
                    <div className="flex flex-col gap-1 w-48 shrink-0">
                        <label className="text-xs font-semibold text-slate-500">账号</label>
                        <input
                            type="text"
                            className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-1 focus:ring-[#0081E5] focus:border-[#0081E5] block w-full p-2 outline-none placeholder:text-slate-300 transition-all"
                            placeholder="输入账号"
                            value={params.accountNum || ''}
                            onChange={(e) => setParams({ ...params, accountNum: e.target.value })}
                        />
                    </div>

                    {/* Subject Num (Renamed logic: could be select, currently input) */}
                    <div className="flex flex-col gap-1 w-40 shrink-0">
                        <label className="text-xs font-semibold text-slate-500">科目号</label>
                        <input
                            type="text"
                            className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-1 focus:ring-[#0081E5] focus:border-[#0081E5] block w-full p-2 outline-none placeholder:text-slate-300 transition-all"
                            placeholder="筛选科目号"
                            value={params.subjNum || ''}
                            onChange={(e) => setParams({ ...params, subjNum: e.target.value })}
                        />
                    </div>

                    {/* Date Range */}
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col gap-1 w-32">
                            <label className="text-xs font-semibold text-slate-500">开始日期</label>
                            <input
                                type="date"
                                className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-1 focus:ring-[#0081E5] focus:border-[#0081E5] block w-full p-2 outline-none transition-all"
                                value={params.startDate}
                                onChange={(e) => setParams({ ...params, startDate: e.target.value })}
                            />
                        </div>
                        <span className="text-slate-300 mb-2">-</span>
                        <div className="flex flex-col gap-1 w-32">
                            <label className="text-xs font-semibold text-slate-500">结束日期</label>
                            <input
                                type="date"
                                className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-1 focus:ring-[#0081E5] focus:border-[#0081E5] block w-full p-2 outline-none transition-all"
                                value={params.endDate}
                                onChange={(e) => setParams({ ...params, endDate: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Spacer to push buttons right if space permits */}
                    <div className="flex-grow"></div>

                    {/* Buttons */}
                    <div className="flex items-center gap-2 shrink-0 pb-0.5">
                        <button
                            onClick={handleExport}
                            className="text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 font-medium rounded-lg text-sm px-4 py-2 transition-colors flex items-center gap-2 whitespace-nowrap"
                        >
                            <Download size={15} /> 导出
                        </button>
                        <button
                            onClick={() => handleQuery(true)}
                            disabled={loading}
                            className="text-white bg-[#0081E5] hover:bg-[#0056b3] focus:ring-4 focus:ring-[#0081E5]/20 font-medium rounded-lg text-sm px-5 py-2 flex items-center gap-2 transition-all shadow-sm hover:shadow disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                            {loading ? '...' : <><Search size={15} /> 查询</>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content (Split View) */}
            <div
                ref={containerRef}
                className="flex-1 flex overflow-hidden relative"
            >
                {/* Left: Table (Swapped) */}
                <div style={{ width: `${splitRatio}%` }} className="flex flex-col bg-white border-r border-slate-200 overflow-hidden relative min-w-[300px]">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between shadow-sm z-10">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                            表格
                        </h3>
                        {selectedRows.size > 0 && (
                            <div className="flex items-center gap-2 text-xs text-[#0081E5]">
                                <Info size={12} />
                                <span>已选 {selectedRows.size} 项</span>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 font-bold uppercase bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th scope="col" className="p-4 w-4 bg-white">
                                        <div className="flex items-center">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 text-[#0081E5] bg-gray-100 border-gray-300 rounded focus:ring-[#0081E5]"
                                                checked={data.length > 0 && selectedRows.size === data.length}
                                                onChange={toggleSelectAll}
                                            />
                                        </div>
                                    </th>
                                    {currentColumns.map((col: { key: string | number; align?: any; label: string | number | boolean | React.ReactElement<any, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | React.ReactPortal | null | undefined; }) => (
                                        <th key={col.key} scope="col" className={`px-4 py-3 whitespace-nowrap bg-white ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                                            {col.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan={currentColumns.length + 1} className="px-6 py-20 text-center text-slate-300">
                                            暂无数据
                                        </td>
                                    </tr>
                                ) : (
                                    data.map((row) => {
                                        const isSelected = selectedRows.has(row.id);
                                        return (
                                            <tr
                                                key={row.id}
                                                className={`border-b border-slate-50 transition-colors ${isSelected ? 'bg-[#0081E5]/5' : 'hover:bg-slate-50'}`}
                                            >
                                                <td className="w-4 p-4">
                                                    <div className="flex items-center">
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 text-[#0081E5] bg-gray-100 border-gray-300 rounded focus:ring-[#0081E5]"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelectRow(row.id)}
                                                        />
                                                    </div>
                                                </td>
                                                {currentColumns.map((col: { key: string | number; align?: any; type?: any; }) => (
                                                    <td key={col.key} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.type === 'number' ? 'font-mono text-slate-700' : 'text-slate-600'}`}>
                                                        {col.key === 'acct_num' ? (
                                                            <div className="group flex items-center gap-2 justify-between">
                                                                <span className="truncate max-w-[120px]" title={row[col.key]}>{row[col.key]}</span>
                                                            </div>
                                                        ) : col.type === 'date' ? (
                                                            <span className="font-medium whitespace-nowrap">{formatDate(row[col.key])}</span>
                                                        ) : col.type === 'number' ? (
                                                            <span>{row[col.key] != null ? Number(row[col.key]).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}</span>
                                                        ) : (
                                                            <span className="truncate max-w-[150px]" title={row[col.key]}>{row[col.key] || '-'}</span>
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-xs text-slate-500">
                        <div className="flex items-center gap-4">
                            <span>共 {total} 条</span>
                            <span>{params.page} / {totalPages}</span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handlePageChange((params.page || 1) - 1)}
                                disabled={!params.page || params.page <= 1 || loading}
                                className="px-2 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
                            >
                                上一页
                            </button>
                            <button
                                onClick={() => handlePageChange((params.page || 1) + 1)}
                                disabled={!params.page || (params.page * (params.pageSize || 20) >= total) || loading}
                                className="px-2 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
                            >
                                下一页
                            </button>
                        </div>
                    </div>
                </div>

                {/* Resizer Handle */}
                <div
                    onMouseDown={startResizing}
                    className="w-1 bg-slate-100 cursor-col-resize hover:bg-[#0081E5] hover:w-1.5 transition-all z-20 flex items-center justify-center group border-x border-slate-200"
                >
                    <div className="h-8 w-1 bg-slate-300 rounded group-hover:bg-white/50"></div>
                </div>

                {/* Right: Chart (Swapped) */}
                <div className="flex-1 flex flex-col bg-white overflow-hidden min-w-[300px]">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between shadow-sm z-10">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                            折线图
                        </h3>
                        <span className="text-xs text-slate-400 font-mono">sbact_acct_bal / acg_dt</span>
                    </div>

                    <div className="flex-1 p-6 w-full h-full min-h-0 relative">
                        {chartPoints.items.length > 0 ? (
                            <div className="w-full h-full relative group">
                                <svg
                                    viewBox="0 0 1000 400"
                                    className="w-full h-full overflow-visible"
                                    preserveAspectRatio="none"
                                    onMouseMove={onChartMove}
                                    onMouseLeave={() => setHoverInfo(null)}
                                >
                                    {/* Grid */}
                                    <line x1="0" y1="380" x2="1000" y2="380" stroke="#e2e8f0" strokeWidth="1" />
                                    <line x1="0" y1="20" x2="1000" y2="20" stroke="#e2e8f0" strokeDasharray="4 4" />
                                    <line x1="0" y1="200" x2="1000" y2="200" stroke="#e2e8f0" strokeDasharray="4 4" />

                                    {/* Line */}
                                    <polyline
                                        points={chartPoints.points}
                                        fill="none"
                                        stroke="#0081E5"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        vectorEffect="non-scaling-stroke"
                                    />

                                    {/* Gradient Fill (Optional, needs ID) */}
                                </svg>

                                {/* HTML Overlay for Tooltip/Line since SVG coord mapping is tricky with preserveAspectRatio="none" */}
                                {hoverInfo && (
                                    <div
                                        className="absolute top-0 bottom-0 w-[1px] bg-slate-300 pointer-events-none"
                                        style={{ left: `${hoverInfo.x}%` }}
                                    >
                                        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#0081E5] rounded-full ring-4 ring-white shadow-sm"></div>

                                        {/* Tooltip Card */}
                                        <div className="absolute top-10 left-4 bg-white/95 backdrop-blur border border-slate-200 shadow-xl p-3 rounded-lg text-xs whitespace-nowrap z-20">
                                            <div className="font-bold text-slate-700 mb-1">{hoverInfo.data.time}</div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-slate-500">余额:</span>
                                                <span className="font-mono font-bold text-[#0081E5] text-sm">{(hoverInfo.data.value).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* X Axis Labels */}
                                <div className="absolute bottom-0 left-0 w-full flex justify-between px-2 text-[10px] text-slate-400 font-mono pointer-events-none">
                                    <span>{chartPoints.items[0].time}</span>
                                    <span>{chartPoints.items[chartPoints.items.length - 1].time}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-300 flex-col gap-2">
                                <div className="w-16 h-1 bg-slate-100 mb-2 rounded"></div>
                                暂无数据，请查询
                            </div>
                        )}
                    </div>

                    {/* Analysis Explanation Block - Only show when data exists + delay */}
                    {showAnalysis && (
                        <div className="border-t border-slate-100 bg-slate-50/50 p-6 min-h-[180px] animate-[fadeIn_0.5s_ease-out]">
                            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm h-full flex flex-col justify-center">
                                <div className="flex items-start gap-4">
                                    <div className="mt-1 p-2 rounded-full bg-blue-50 text-blue-600 shadow-sm">
                                        <Info size={20} />
                                    </div>
                                    <div>
                                        <h4 className="text-base font-bold text-slate-800 mb-3">分析结果说明</h4>
                                        <p className="text-base text-slate-700 leading-relaxed mb-4 text-justify font-medium">
                                            在当前所选时间范围内，该账户未监测到连续性的大额资金变动行为，账户余额整体波动处于正常区间。
                                        </p>
                                        <p className="text-sm text-slate-400 leading-relaxed">
                                            （如账户在所选期间内发生连续多笔或短时间内频繁出现的大额资金交易，可能触发系统对异常资金流动的进一步分析与风险提示。）
                                            <br />
                                            本结果基于现有数据规则自动生成，仅供辅助分析使用，具体情况仍需结合业务背景及人工判断进行综合评估。
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const InputGroup = ({ label, placeholder, value, onChange }: any) => (
    <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-slate-500">{label}</label>
        <input
            type="text"
            className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-1 focus:ring-[#0081E5] focus:border-[#0081E5] block w-full p-2.5 outline-none placeholder:text-slate-300 transition-all"
            placeholder={placeholder}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
        />
    </div>
);

export default DigitalIntelligence;
