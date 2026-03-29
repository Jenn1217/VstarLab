import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowDown, CheckCircle2, XCircle, User, Bot, Copy, RotateCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { mockAnalysisData } from './mockAnalysisData';
import InputArea from '../InputArea';
import { ModelType, Message, FunctionMode } from '../../types';
import { sendBackendMessage } from '../../services/backendService';
import szBankIconVector from '../../pic/图标矢量图.png';

interface AnalysisViewProps {
    onBack: () => void;
    row: any;
}

const ActionBtn = ({ icon, onClick, title }: any) => (
  <button
    onClick={onClick}
    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
    title={title}
  >
    {icon}
  </button>
);

// Helper component for rendering message content with Think blocks


// --- TOOLTIP LOGIC ---
const TOOLTIP_DATA: Record<string, { tooltip: string; type: string }> = {
    "总分差额": { tooltip: "总账余额与分户账余额之间的差值。非零通常意味着账务不平。", type: "indicator" },
    "不平发生最早日期": { tooltip: "根据历史对账结果推断出的账务首次出现不平的会计日期。", type: "analysis_result" },
    "分户余额表": { tooltip: "用于查看各分户账户在指定会计日期下的余额明细。", type: "data_source" },
    "传票历史表": { tooltip: "记录所有会计传票的流水信息，包括借贷方向、金额和日期。", type: "data_source" },
    "金融交易历史表": { tooltip: "反映真实资金交易及余额变化的交易明细数据。", type: "data_source" },
    "传票号": { tooltip: "会计传票的唯一标识，用于定位和关联具体账务记录。", type: "field" },
    "原传票号": { tooltip: "被冲正或调整前的原始会计传票编号。", type: "field" },
    "传票套内序列号": { tooltip: "同一传票中多条会计分录的顺序编号。", type: "field" },
    "重复冲正": { tooltip: "同一笔原始交易被多次冲正，可能导致金额被重复抵消。", type: "risk_flag" },
    "红蓝字标志": { tooltip: "用于区分正常记账与冲正记账的标识。", type: "field" },
    "会计日期": { tooltip: "账务记账所属的会计期间日期，用于核算和对账。", type: "date" },
    "交易日期": { tooltip: "实际发生资金交易的日期，可能早于或晚于会计日期。", type: "date" }
};

const TYPE_LABELS: Record<string, string> = {
    indicator: '关键指标',
    analysis_result: '分析结果',
    data_source: '数据来源',
    field: '字段说明',
    risk_flag: '风险标识',
    date: '日期说明'
};

const TooltipSpan: React.FC<{ text: string; tooltip: string; type: string }> = ({ text, tooltip, type }) => {
    return (
        <span className="relative inline border-b-2 border-dotted border-slate-300 hover:border-[#0081E5] cursor-help group transition-colors mx-0.5 align-baseline">
            <span className="font-medium text-slate-800 group-hover:text-[#0081E5] transition-colors whitespace-nowrap">{text}</span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-4 bg-white text-slate-700 text-xs rounded-lg shadow-xl border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none text-left leading-relaxed transform translate-y-1 group-hover:translate-y-0">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                    <span className={`w-2 h-2 rounded-full ${type === 'risk_flag' ? 'bg-red-500' :
                        type === 'indicator' ? 'bg-orange-500' :
                            type === 'analysis_result' ? 'bg-[#0081E5]' : 'bg-blue-500'
                        }`}></span>
                    <span className="font-bold text-slate-800 text-sm">{TYPE_LABELS[type] || '说明'}</span>
                </div>
                <div className="text-slate-600 leading-normal">{tooltip}</div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-white drop-shadow-sm"></div>
            </div>
        </span>
    );
};

// Recursively scan and replace text
const processTooltipContent = (children: React.ReactNode): React.ReactNode => {
    if (typeof children === 'string') {
        const keys = Object.keys(TOOLTIP_DATA);
        const regex = new RegExp(`(${keys.join('|')})`, 'g');
        const parts = children.split(regex);
        if (parts.length === 1) return children;

        return parts.map((part, i) => {
            if (TOOLTIP_DATA[part]) {
                return <TooltipSpan key={i} text={part} {...TOOLTIP_DATA[part]} />;
            }
            return part;
        });
    }

    if (Array.isArray(children)) {
        return children.map((child, i) => <React.Fragment key={i}>{processTooltipContent(child)}</React.Fragment>);
    }

    if (React.isValidElement(children)) {
        const element = children as React.ReactElement<any>;
        if (element.props && element.props.children) {
            return React.cloneElement(element, {
                children: processTooltipContent(element.props.children)
            });
        }
    }

    return children;
};

const AnalysisView: React.FC<AnalysisViewProps> = ({ onBack, row }) => {
    const analysisData = row ? mockAnalysisData[row.diff] : null;
    const [currentStep, setCurrentStep] = useState(0);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState<ModelType>(ModelType.FINETUNED);
    const [functionMode, setFunctionMode] = useState<FunctionMode>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [sessionId] = useState(() => `analysis-${Date.now()}`);
    const scrollRef = useRef<HTMLDivElement>(null);
    const flowScrollRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!analysisData) return;

        // Reset step when data changes
        setCurrentStep(0);

        const timer = setInterval(() => {
            setCurrentStep(prev => {
                if (prev < analysisData.length) {
                    return prev + 1;
                }
                clearInterval(timer);
                return prev;
            });
        }, 1500);

        return () => clearInterval(timer);
    }, [analysisData]);

    // Auto-scroll to bottom of markdown content when new steps are added or messages update
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        if (flowScrollRef.current) {
            flowScrollRef.current.scrollTop = flowScrollRef.current.scrollHeight;
        }
    }, [currentStep, messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        // Create a placeholder for the AI response
        const aiMessageId = (Date.now() + 1).toString();
        setMessages(prev => [...prev, {
            id: aiMessageId,
            role: 'model',
            content: '',
            timestamp: Date.now()
        }]);

        abortControllerRef.current = new AbortController();

        try {
            const stream = sendBackendMessage(
                userMessage.content,
                sessionId,
                selectedModel,
                functionMode,
                abortControllerRef.current.signal
            );

            let fullContent = '';
            let fullReasoning = '';
            let chartData: any = undefined;

            for await (const chunk of stream) {
                if (typeof chunk === 'string') {
                    fullContent += chunk;
                } else {
                    if (chunk.type === 'reasoning') {
                        fullReasoning += chunk.content;
                    } else if (chunk.type === 'trend_chart') {
                        chartData = chunk.data;
                    } else if (chunk.type === 'error') {
                        fullContent += `\n\nError: ${chunk.content}`;
                    } else {
                        fullContent += chunk.content;
                    }
                }

                setMessages(prev => prev.map(msg =>
                    msg.id === aiMessageId ? { ...msg, content: fullContent, reasoning: fullReasoning, chartData } : msg
                ));
            }

        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => prev.map(msg =>
                msg.id === aiMessageId
                    ? { ...msg, content: msg.content + "\n\n[Error: Connection interrupted]" }
                    : msg
            ));
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    };

    if (!row || !analysisData) {
        return (
            <div className="flex flex-col h-full bg-slate-50">
                <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600">
                        <ArrowLeft size={20} />
                    </button>
                    <h2 className="text-xl font-bold text-slate-800">数据分析</h2>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center p-8">
                        <p className="text-slate-500">暂无该笔数据的详细分析报告</p>
                        <button onClick={onBack} className="mt-4 text-[#0081E5] hover:underline">返回列表</button>
                    </div>
                </div>
            </div>
        );
    }

    const displayedSteps = analysisData.slice(0, currentStep);

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 shadow-sm z-10">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="text-xl font-bold text-slate-800">账务不平分析详情</h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                        流水号: {row.id} | 机构: {row.branchCode} | 科目: {row.accountCode} | 差额: <span className="text-red-600 font-mono font-medium">{row.diff}</span>
                    </p>
                </div>
            </div>

            {/* Content Grid */}
            <div className="flex-1 min-h-0 grid grid-cols-12 divide-x divide-slate-200">

                {/* Middle Column: Dynamic Flowchart */}
                <div className="col-span-4 bg-slate-50/50 h-full overflow-y-auto px-8 pb-8 pt-0 transition-all duration-500 custom-scrollbar" ref={flowScrollRef}>
                    <h3 className="text-lg font-bold text-slate-800 mb-8 flex items-center gap-2 sticky top-0 bg-slate-50/95 py-6 z-10 backdrop-blur-sm border-b border-slate-100/50">
                        <span className="w-1 h-6 bg-[#0081E5] rounded-full"></span>
                        分析流程追踪
                    </h3>

                    <div className="flex flex-col items-center max-w-md mx-auto pb-10">
                        {displayedSteps.map((stepData, index) => {
                            const step = stepData.flow;
                            return (
                                <React.Fragment key={index}>
                                    {/* Arrow Connector */}
                                    {index > 0 && (
                                        <div className="h-12 w-px bg-slate-300 my-1 relative animate-[fadeIn_0.5s_ease-out_forwards]">
                                            <ArrowDown size={16} className="absolute -bottom-2 -left-2 text-slate-300" />
                                        </div>
                                    )}

                                    {/* Flow Step Card */}
                                    <div
                                        className={`w-full rounded-xl p-5 shadow-sm border transition-all duration-500 animate-[slideInUp_0.5s_ease-out_forwards] ${step.status === 'success'
                                            ? 'bg-[#0081E5] border-[#0081E5] text-white'
                                            : 'bg-red-50 border-red-200'
                                            }`}
                                    >
                                        <div className="font-bold text-lg mb-2 flex justify-between items-start">
                                            <span>{step.title}</span>
                                        </div>
                                        <div className={`text-sm mb-4 ${step.status === 'success' ? 'text-white/90' : 'text-slate-600'}`}>
                                            {step.content}
                                        </div>
                                        <div className="flex justify-end">
                                            {step.status === 'success' ? (
                                                <CheckCircle2 size={24} className="text-white" />
                                            ) : (
                                                <XCircle size={24} className="text-red-500" />
                                            )}
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}

                        {currentStep < analysisData.length && (
                            <div className="mt-8 flex flex-col items-center gap-2 text-slate-400 animate-pulse">
                                <div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-[#0081E5] animate-spin" />
                                <span className="text-sm">正在进行下一步分析...</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Markdown Analysis & Search */}
                <div className="col-span-8 bg-white h-full flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto p-10 custom-scrollbar" ref={scrollRef}>
                        <div className="prose prose-slate max-w-none">
                            {displayedSteps.map((stepData, index) => {
                                const isSuccess = stepData.flow.status === 'success';
                                const headingColorClass = isSuccess ? 'text-[#0081E5]' : 'text-red-600';

                                return (
                                    <div key={index} className="mb-8 animate-[fadeIn_0.5s_ease-out_forwards]">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                // Custom Table Styling
                                                table: ({ node, children, ...props }) => (
                                                    <div className="overflow-x-auto my-6 rounded-lg border border-slate-200 shadow-sm">
                                                        <table className="min-w-full divide-y divide-slate-200" {...props}>
                                                            {children}
                                                        </table>
                                                    </div>
                                                ),
                                                thead: ({ node, children, ...props }) => (
                                                    <thead className="bg-slate-50" {...props}>{children}</thead>
                                                ),
                                                tbody: ({ node, children, ...props }) => (
                                                    <tbody className="bg-white divide-y divide-slate-200" {...props}>{children}</tbody>
                                                ),
                                                tr: ({ node, children, ...props }) => (
                                                    <tr className="hover:bg-slate-50/50 transition-colors" {...props}>{children}</tr>
                                                ),
                                                th: ({ node, children, ...props }) => (
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap" {...props}>
                                                        {processTooltipContent(children)}
                                                    </th>
                                                ),
                                                td: ({ node, children, ...props }) => (
                                                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap" {...props}>
                                                        {processTooltipContent(children)}
                                                    </td>
                                                ),
                                                // Custom Heading Styling
                                                h1: ({ node, children, ...props }) => (
                                                    <h1 className="text-2xl font-bold text-slate-900 mb-6 pb-2 border-b border-slate-100" {...props}>
                                                        {processTooltipContent(children)}
                                                    </h1>
                                                ),
                                                h2: ({ node, children, ...props }) => (
                                                    <h2 className={`text-xl font-bold mt-8 mb-4 flex items-center gap-2 ${headingColorClass}`} {...props}>
                                                        {children}
                                                    </h2>
                                                ),
                                                h3: ({ node, children, ...props }) => (
                                                    <h3 className="text-lg font-semibold text-slate-800 mt-6 mb-3" {...props}>
                                                        {processTooltipContent(children)}
                                                    </h3>
                                                ),
                                                // Custom Blockquote
                                                blockquote: ({ node, children, ...props }) => (
                                                    <blockquote className="border-l-4 border-slate-200 pl-4 py-1 my-4 text-slate-600 italic bg-slate-50/50 rounded-r" {...props}>
                                                        {processTooltipContent(children)}
                                                    </blockquote>
                                                ),
                                                // Standard Text
                                                p: ({ node, children, ...props }) => (
                                                    <p className="mb-4 leading-relaxed" {...props}>
                                                        {processTooltipContent(children)}
                                                    </p>
                                                ),
                                                li: ({ node, children, ...props }) => (
                                                    <li className="mb-1" {...props}>
                                                        {processTooltipContent(children)}
                                                    </li>
                                                )
                                            }}
                                        >
                                            {stepData.markdown}
                                        </ReactMarkdown>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Chat Messages */}
                        {messages.length > 0 && (
                            <div className="mt-12 border-t border-slate-200 pt-8">
                                <h3 className="text-lg font-bold text-slate-800 mb-6">分析问答</h3>
                                <div className="space-y-8">
                                    {messages.map((msg) => (
                                        <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                            {/* Header for AI (Icon + Name + Time) */}
                                            {msg.role === 'model' && (
                                                <div className="flex items-center gap-2 mb-2 ml-1">
                                                    <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center p-0.5 shadow-sm">
                                                        <img src={szBankIconVector} alt="AI" className="w-full h-full object-contain" />
                                                    </div>
                                                    <span className="text-sm font-semibold text-slate-700">小星</span>
                                                    <span className="text-xs text-slate-400">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            )}

                                            {/* Message Content */}
                                            {msg.role === 'user' ? (
                                                <div className="flex items-center gap-2 flex-row-reverse sm:flex-row">
                                                    <ActionBtn
                                                        icon={<Copy size={18} />}
                                                        onClick={() => navigator.clipboard.writeText(msg.content)}
                                                        title="复制"
                                                    />
                                                    <div className="text-[15px] leading-relaxed max-w-[85%] bg-[#0081E5] text-white px-5 py-3.5 rounded-2xl rounded-br-none shadow-sm">
                                                        <div className="whitespace-pre-wrap">{msg.content}</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="w-full max-w-none pl-0 pr-4 text-[15px] leading-relaxed">
                                                    {/* Reasoning Block (AI Only) */}
                                                    {msg.role === 'model' && (msg as any).reasoning && (
                                                        <details className="mb-4 group border-l-2 border-slate-200 pl-3 ml-1">
                                                            <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors list-none flex items-center gap-1 select-none">
                                                                <span className="group-open:rotate-90 transition-transform">▶</span>
                                                                思考过程
                                                            </summary>
                                                            <div className="mt-2 text-xs text-slate-500 whitespace-pre-wrap font-mono">
                                                                {(msg as any).reasoning}
                                                            </div>
                                                        </details>
                                                    )}

                                                    <div className="prose prose-slate max-w-none">
                                                        <ReactMarkdown
                                                            remarkPlugins={[remarkGfm]}
                                                            rehypePlugins={[rehypeRaw]}
                                                            components={{
                                                                table: ({ node, ...props }) => <div className="overflow-x-auto my-4 border border-slate-200 rounded-lg bg-white shadow-sm"><table className="min-w-full divide-y divide-slate-200" {...props} /></div>,
                                                                thead: ({ node, ...props }) => <thead className="bg-white border-b border-slate-200" {...props} />,
                                                                th: ({ node, ...props }) => <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider" {...props} />,
                                                                td: ({ node, ...props }) => <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 border-t border-slate-100" {...props} />,
                                                                h1: ({ node, ...props }) => <h1 className="text-2xl font-bold text-slate-800 mt-6 mb-4 pb-2 border-b border-slate-100" {...props} />,
                                                                h2: ({ node, ...props }) => <h2 className="text-xl font-semibold text-slate-800 mt-5 mb-3" {...props} />,
                                                                h3: ({ node, ...props }) => <h3 className="text-lg font-medium text-slate-800 mt-4 mb-2" {...props} />,
                                                                ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-5 space-y-1 my-2" {...props} />,
                                                                ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-5 space-y-1 my-2" {...props} />,
                                                                blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-[#0081E5] pl-4 italic text-slate-500 my-4 bg-slate-50 py-2 pr-2 rounded-r" {...props} />
                                                            }}
                                                        >
                                                            {msg.content || ''}
                                                        </ReactMarkdown>
                                                    </div>

                                                    {msg.role === 'model' && !msg.content && !(msg as any).reasoning && (
                                                        <span className="animate-pulse text-slate-400">思考中...</span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Message Actions (AI Only) */}
                                            {msg.role === 'model' && !isLoading && msg.content && (
                                                <div className="flex items-center gap-1 mt-2 ml-1">
                                                    <ActionBtn icon={<Copy size={18} />} onClick={() => navigator.clipboard.writeText(msg.content)} title="复制" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {isLoading && messages[messages.length - 1]?.role === 'user' && (
                                        <div className="flex flex-col items-start space-y-2 mt-4">
                                             <div className="flex items-center gap-2 mb-2 ml-1">
                                                 <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center p-0.5 shadow-sm">
                                                     <img src={szBankIconVector} alt="AI" className="w-full h-full object-contain" />
                                                 </div>
                                                 <span className="text-sm font-semibold text-slate-700">小星</span>
                                             </div>
                                            <div className="pl-0 text-[15px] leading-relaxed">
                                                <span className="animate-pulse text-slate-400">思考中...</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Search Bar Area - Static block at bottom */}
                    <div className="border-t border-slate-200 bg-white p-4 shrink-0 z-20 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.05)]">
                        <InputArea
                            input={input}
                            setInput={setInput}
                            handleSend={handleSend}
                            handlePause={() => abortControllerRef.current?.abort()}
                            isLoading={isLoading}
                            selectedModel={selectedModel}
                            setSelectedModel={setSelectedModel}
                            functionMode={functionMode}
                            setFunctionMode={setFunctionMode}
                            placeholder="对分析结果有疑问？请告诉我..."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnalysisView;
