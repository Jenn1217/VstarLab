import React, { useState, useMemo } from 'react';

interface ChartData {
    acct_num: string;
    sbj_num: string;
    org_num: string;
    acg_dt: string;
    ccy: string;
    sbact_acct_bal: number;
    gnl_ldgr_bal: number;
    diff: number;
}

interface TrendChartProps {
    data: ChartData[];
    title?: string;
}

const TrendChart: React.FC<TrendChartProps> = ({ data, title }) => {
    const [hoverData, setHoverData] = useState<ChartData | null>(null);
    const [hoverX, setHoverX] = useState<number | null>(null);

    // Dimensions
    const width = 600;
    const height = 300;
    const padding = { top: 40, right: 30, bottom: 40, left: 60 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Scales
    const { minVal, maxVal, dates, points1, points2, points3 } = useMemo(() => {
        if (!data || data.length === 0) return { minVal: 0, maxVal: 0, dates: [], points1: [], points2: [], points3: [] };

        const vals = data.flatMap(d => [d.sbact_acct_bal, d.gnl_ldgr_bal, d.diff]);
        let minVal = Math.min(...vals);
        let maxVal = Math.max(...vals);

        // Add some padding to Y axis
        const range = maxVal - minVal;
        if (range === 0) {
            minVal -= 10;
            maxVal += 10;
        } else {
            minVal -= range * 0.1;
            maxVal += range * 0.1;
        }

        const dates = data.map(d => d.acg_dt);

        const getX = (index: number) => padding.left + (index / (data.length - 1)) * graphWidth;
        const getY = (val: number) => padding.top + graphHeight - ((val - minVal) / (maxVal - minVal)) * graphHeight;

        const points1 = data.map((d, i) => `${getX(i)},${getY(d.sbact_acct_bal)}`).join(' ') as string;
        const points2 = data.map((d, i) => `${getX(i)},${getY(d.gnl_ldgr_bal)}`).join(' ') as string;
        const points3 = data.map((d, i) => `${getX(i)},${getY(d.diff)}`).join(' ') as string;

        return { minVal, maxVal, dates, points1, points2, points3 };
    }, [data]);

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;

        // Find nearest data point
        const relativeX = x - padding.left;
        let index = Math.round((relativeX / graphWidth) * (data.length - 1));
        index = Math.max(0, Math.min(index, data.length - 1));

        setHoverData(data[index]);
        setHoverX(padding.left + (index / (data.length - 1)) * graphWidth);
    };

    const handleMouseLeave = () => {
        setHoverData(null);
        setHoverX(null);
    };

    if (!data || data.length === 0) return <div className="p-4 text-slate-500">暂无数据</div>;

    return (
        <div className="w-full max-w-[700px] bg-white rounded-xl shadow-sm border border-slate-200 p-4 my-4">
            {/* Title */}
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700">{title || '趋势分析'}</h3>
                <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span>分户账</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>总账</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>差额</div>
                </div>
            </div>

            <div className="relative">
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="w-full h-auto overflow-visible"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                >
                    {/* Grid Lines (Horizontal) */}
                    {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                        const y = padding.top + graphHeight * (1 - t);
                        const val = minVal + (maxVal - minVal) * t;
                        return (
                            <g key={t}>
                                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
                                <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                                    {val.toFixed(2)}
                                </text>
                            </g>
                        );
                    })}

                    {/* X Axis Labels (Show first, middle, last) */}
                    {/* Simple logic: show every nth label to avoid overlap */}
                    {data.map((d, i) => {
                        if (i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 5) === 0) {
                            const x = padding.left + (i / (data.length - 1)) * graphWidth;
                            return (
                                <text key={i} x={x} y={height - 10} textAnchor="middle" fontSize="10" fill="#94a3b8">
                                    {d.acg_dt.slice(5)} {/* show MM-DD */}
                                </text>
                            )
                        }
                        return null;
                    })}


                    {/* Lines */}
                    <polyline points={points1} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points={points2} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points={points3} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2" />

                    {/* Points (Only show on hover or specific warning points if we had logic, here just hover) */}
                    {/* Actually drawing all points might be cluttered, let's just draw the active one */}

                    {/* Hover Line & Dots */}
                    {hoverX !== null && hoverData && (
                        <g>
                            <line x1={hoverX} y1={padding.top} x2={hoverX} y2={height - padding.bottom} stroke="#94a3b8" strokeWidth="1" />

                            {/* Dots */}
                            <circle cx={hoverX} cy={
                                padding.top + graphHeight - ((hoverData.sbact_acct_bal - minVal) / (maxVal - minVal)) * graphHeight
                            } r="4" fill="#3b82f6" stroke="white" strokeWidth="2" />

                            <circle cx={hoverX} cy={
                                padding.top + graphHeight - ((hoverData.gnl_ldgr_bal - minVal) / (maxVal - minVal)) * graphHeight
                            } r="4" fill="#10b981" stroke="white" strokeWidth="2" />

                            <circle cx={hoverX} cy={
                                padding.top + graphHeight - ((hoverData.diff - minVal) / (maxVal - minVal)) * graphHeight
                            } r="4" fill="#ef4444" stroke="white" strokeWidth="2" />

                            {/* Warning Dot for Non-Zero Diff */}
                            {Math.abs(hoverData.diff) > 0.01 && (
                                <circle cx={hoverX} cy={
                                    padding.top + graphHeight - ((hoverData.diff - minVal) / (maxVal - minVal)) * graphHeight
                                } r="8" fill="none" stroke="#ef4444" strokeWidth="2" opacity="0.5">
                                    <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="0.8;0;0.8" dur="1.5s" repeatCount="indefinite" />
                                </circle>
                            )}

                        </g>
                    )}

                </svg>

                {/* Floating Tooltip */}
                {hoverData && (
                    <div className="absolute top-0 right-0 bg-white/90 backdrop-blur-sm border border-slate-200 shadow-lg p-3 rounded-lg text-xs pointer-events-none z-10">
                        <div className="font-bold text-slate-700 mb-1">{hoverData.acg_dt}</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            <span className="text-slate-500">分户账:</span>
                            <span className="font-mono text-blue-600 text-right">{hoverData.sbact_acct_bal.toLocaleString()}</span>

                            <span className="text-slate-500">总账:</span>
                            <span className="font-mono text-emerald-600 text-right">{hoverData.gnl_ldgr_bal.toLocaleString()}</span>

                            <span className="text-slate-500">差额:</span>
                            <span className={`font-mono text-right font-bold ${Math.abs(hoverData.diff) > 0.01 ? 'text-red-600' : 'text-slate-400'}`}>
                                {hoverData.diff.toLocaleString()}
                            </span>
                        </div>
                        {/* Context Info */}
                        <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                            <div>Acct: {hoverData.acct_num.slice(0, 8)}...</div>
                            <div className="flex gap-2">
                                <span>Org: {hoverData.org_num}</span>
                                <span>Sbj: {hoverData.sbj_num}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Critical Info Footer */}
            {data.some(d => Math.abs(d.diff) > 0.01) && (
                <div className="mt-2 p-2 bg-red-50 text-red-600 rounded text-xs flex items-start gap-2">
                    <span className="font-bold">⚠️ 风险预警:</span>
                    <span>检测到分户账与总账存在不平差额，请立即核查！(红色虚线示警)</span>
                </div>
            )}
        </div>
    );
};

export default TrendChart;
