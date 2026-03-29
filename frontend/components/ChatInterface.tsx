import React, { useState, useEffect, useRef } from 'react';
import { User as UserIcon, Copy, RotateCw, Star } from 'lucide-react';
import InputArea from './InputArea';
import { Message, ModelType, FunctionMode } from '../types';
import { sendMessageStream } from '../services/geminiService';
import { sendBackendMessage, toggleFavorite, fetchFavorites } from '../services/backendService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import szBankLogo from '../pic/苏州银行logo.png';
import szBankVector from '../pic/苏州银行矢量图.png';
import szBankIconVector from '../pic/图标矢量图.png';
import vstarLogo from '../pic/vstarlab.png';
import TrendChart from './TrendChart';
import { FavoriteStar } from './FavoriteStar';
import { FavoriteRef } from './Favorites/types';

interface ChatInterfaceProps {
  mode?: 'default' | 'knowledge_base';
  contextTitle?: string;
  sessionId?: string;
  onNavigate?: (view: string) => void;
  currentUser?: any; // Ideally import Employee type, but any works for now or let me import it
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ mode = 'default', contextTitle, sessionId: propSessionId, onNavigate, currentUser }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelType>(ModelType.FINETUNED);
  const [functionMode, setFunctionMode] = useState<FunctionMode>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [favoriteMsgIds, setFavoriteMsgIds] = useState<Set<string>>(new Set());

  // Use prop sessionId or fallback (though App.tsx should always pass it now)
  const sessionId = propSessionId || `session-${Date.now()}`;

  // Helper to migrate old messages (extract Markdown JSON to structured chartData)
  const migrateMessage = (msg: Message): Message => {
    // If already has chartData, no need to migrate
    if ((msg as any).chartData) return msg;

    // Check for potential chart JSON in content
    if (msg.content && msg.content.includes('"type": "trend_chart"')) {
      const jsonBlockRegex = /```json\s*(\{[\s\S]*?"type":\s*"trend_chart"[\s\S]*?\})\s*```/;
      const match = msg.content.match(jsonBlockRegex);
      if (match) {
        try {
          const jsonData = JSON.parse(match[1]);
          if (jsonData.type === 'trend_chart') {
            return {
              ...msg,
              // Move to structured field
              chartData: jsonData,
              // Strip from text to avoid duplication/leaking in copy
              content: msg.content.replace(match[0], '').trim()
            } as any;
          }
        } catch (e) {
          console.warn("Failed to migrate chart JSON", e);
        }
      }
    }
    return msg;
  };

  // Load history on mount
  useEffect(() => {
    const loadSessionHistory = async () => {
      if (propSessionId) {
        const { fetchSession } = await import('../services/backendService');
        const sessionData = await fetchSession(propSessionId);
        if (sessionData && sessionData.messages) {
          // Apply migration
          const migrated = sessionData.messages.map(migrateMessage);
          setMessages(migrated);
        }
      }
    };
    loadSessionHistory();
  }, [propSessionId]);

  // Load Favorites
  useEffect(() => {
    if (currentUser?.id) {
      fetchFavorites(currentUser.id).then(data => {
        if (data && data.messages) {
          setFavoriteMsgIds(new Set(data.messages));
        }
      });
    }
  }, [currentUser]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handlePause = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || isLoading) return;

    // Add User Message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Create new AbortController
    // Create new AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Add placeholder for AI response
    const aiMsgId = (Date.now() + 1).toString();

    try {
      setMessages(prev => [...prev, {
        id: aiMsgId,
        role: 'model',
        content: '',
        timestamp: Date.now(),
      }]);

      let stream;

      // Pass currentUser.id to backend
      const userId = currentUser ? currentUser.id : undefined;

      if (selectedModel === ModelType.FINETUNED) {
        stream = sendBackendMessage(textToSend, sessionId, selectedModel, functionMode, abortController.signal, userId);
      } else {
        // Route Standard API to backend as well, but with its model type
        stream = sendBackendMessage(textToSend, sessionId, selectedModel, functionMode, abortController.signal, userId);
      }

      let fullContent = '';
      let fullReasoning = '';
      let chartData: any = undefined;

      for await (const chunk of stream) {
        if (typeof chunk === 'string') {
          // Legacy/Gemini stream
          fullContent += chunk;
        } else {
          // Structured stream
          if (chunk.type === 'reasoning') {
            fullReasoning += chunk.content;
          } else if (chunk.type === 'trend_chart') {
            chartData = chunk.data;
          } else {
            fullContent += chunk.content;
          }
        }

        setMessages(prev => prev.map(msg =>
          msg.id === aiMsgId ? { ...msg, content: fullContent, reasoning: fullReasoning, chartData } : msg
        ));
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error("Chat error", error);
        setMessages(prev => prev.map(msg =>
          msg.id === aiMsgId ? { ...msg, content: "⚠️ 服务器连接断开或响应超时，请重试。" } : msg
        ));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    // Could add toast notification here
  };

  const handleRegenerate = () => {
    // Basic regenerate implementation: resend last user message
    // In a real app, delete last AI message and re-trigger send logic
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (lastUserMsg) {
      handleSend(lastUserMsg.content);
    }
  };

  const handleFavorite = async (msgId: string) => {
    if (!currentUser?.id) return;
    try {
      const res = await toggleFavorite(currentUser.id, msgId, 'message');
      setFavoriteMsgIds(prev => {
        const newSet = new Set(prev);
        if (res.isFavorite) {
          newSet.add(msgId);
        } else {
          newSet.delete(msgId);
        }
        return newSet;
      });
    } catch (e) {
      console.error("Failed to toggle favorite message", e);
    }
  };




  const isKB = mode === 'knowledge_base';

  // If in "Shuzhi" (Digital Intelligence) mode, render the dashboard

  return (
    <div className="flex-1 flex flex-col h-full relative bg-slate-50">




      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto w-full relative">
        <div className={`max-w-3xl mx-auto px-4 ${messages.length === 0 ? 'h-full flex flex-col justify-center' : 'pt-10 pb-4'}`}>

          {/* Welcome / Empty State */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center opacity-0 animate-[fadeIn_0.8s_ease-out_forwards] w-full">
              {/* Central Logo */}
              {!isKB && (
                <div className="mb-8 w-96 flex items-center justify-center">
                  <img src={vstarLogo} alt="Logo" className="w-full h-full object-contain" />
                </div>
              )}

              {isKB && (
                <h1
                  className="text-6xl font-bold mb-6 tracking-tight"
                  style={{ color: '#0081E5' }}
                >
                  {contextTitle || '知识库助手'}
                </h1>
              )}

              {/* Bubbles - Only for main chat */}
              {!isKB && (
                <div className="flex flex-row justify-center gap-4 mt-8">
                  <button
                    onClick={() => setFunctionMode("wenzhi")}
                    className="px-6 py-2.5 rounded-full bg-white border border-slate-200 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all duration-300 flex items-center justify-center group"
                    style={{ animation: 'fadeInUp 0.6s ease-out backwards', animationDelay: '100ms' }}
                  >
                    <span className="text-base font-bold text-slate-700 group-hover:text-[#0081E5] transition-colors">文智</span>
                  </button>
                  <button
                    onClick={() => onNavigate && onNavigate('digital_intelligence')}
                    className="px-6 py-2.5 rounded-full bg-white border border-slate-200 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all duration-300 flex items-center justify-center group"
                    style={{ animation: 'fadeInUp 0.6s ease-out backwards', animationDelay: '200ms' }}
                  >
                    <span className="text-base font-bold text-slate-700 group-hover:text-[#0081E5] transition-colors">数智</span>
                  </button>
                </div>
              )}

              {isKB && (
                <p className="text-slate-400 text-sm max-w-md">
                  您可以询问关于此知识库中包含的文档的任何内容。AI 将根据上下文进行回答。
                </p>
              )}
            </div>
          )}

          {/* Message List */}
          <div className="space-y-8">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
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
                      onClick={() => handleCopy(msg.content)}
                      title="复制"
                    />
                    <div
                      className="text-[15px] leading-relaxed max-w-[85%] bg-[#0081E5] text-white px-5 py-3.5 rounded-2xl rounded-br-none shadow-sm"
                    >
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
                          blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-[#0081E5] pl-4 italic text-slate-500 my-4 bg-slate-50 py-2 pr-2 rounded-r" {...props} />,
                          // Custom citation link handler

                          a: ({ node, href, children, ...props }: any) => {
                            if (href?.startsWith('citation:')) {
                              const id = href.split(':')[1];
                              const refs = extractReferences(msg.content);
                              const refData = refs[id];

                              let title = "加载中...";
                              let content = "";

                              if (refData) {
                                // Handle both object (rich) and string (legacy/fallback) formats
                                if (typeof refData === 'string') {
                                  title = refData;
                                } else {
                                  title = refData.source;
                                  if (refData.topic) {
                                    title += ` - ${refData.topic}`;
                                  }
                                  content = refData.content || "";
                                }
                              }

                              return (
                                <span className="relative inline-block group ml-0.5 align-baseline">
                                  {/* Link Badge */}
                                  <span className="bg-[#F0FDF4] text-[#15803d] px-1.5 py-0.5 rounded text-[11px] font-bold cursor-help hover:bg-[#DCFCE7] transition-colors border border-[#BBF7D0] select-none shadow-sm">
                                    {children}
                                  </span>

                                  {/* Popover Card */}
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[300px] bg-white rounded-lg shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none p-3 text-left">

                                    {/* Header */}
                                    <div className="flex items-start gap-2 border-b border-slate-100 pb-2 mb-2">
                                      <div className="w-1 h-3.5 bg-[#0081E5] rounded-full mt-1 shrink-0"></div>
                                      <span className="font-bold text-slate-800 text-xs leading-snug break-words">
                                        {title}
                                      </span>
                                    </div>

                                    {/* Body */}
                                    {content && (
                                      <div className="text-slate-600 text-[11px] leading-relaxed max-h-[120px] overflow-hidden text-justify relative font-sans">
                                        {content}
                                        {/* Fade out effect */}
                                        <div className="absolute bottom-0 left-0 w-full h-6 bg-gradient-to-t from-white to-transparent"></div>
                                      </div>
                                    )}

                                    {/* Arrow */}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-white drop-shadow-sm"></div>
                                  </div>
                                </span>
                              );
                            }
                            return <a href={href} className="text-[#0081E5] hover:underline font-medium" {...props}>{children}</a>
                          },
                          code: ({ node, className, children, ...props }: any) => {
                            const match = /language-(\w+)/.exec(className || '')
                            const isJson = match && match[1] === 'json';

                            // Try to parse JSON to check if it's a chart
                            if (isJson) {
                              try {
                                const codeContent = String(children).replace(/\n$/, '');
                                const data = JSON.parse(codeContent);
                                if (data && data.type === 'trend_chart') {
                                  return <TrendChart data={data.data} title={data.title} />;
                                }
                              } catch (e) {
                                // Not valid JSON or our chart type, fall through
                              }
                            }

                            return !className?.includes('language-') ? (
                              <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                                {children}
                              </code>
                            ) : (
                              <div className="relative group my-4">
                                <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="text-xs text-slate-400">{match?.[1]}</span>
                                </div>
                                <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </pre>
                              </div>
                            )
                          }
                        }}
                      >
                        {preprocessContent(msg.content) || ''}
                      </ReactMarkdown>

                      {/* Chart Rendering */}
                      {(msg as any).chartData && (
                        <TrendChart data={(msg as any).chartData.data} title={(msg as any).chartData.title} />
                      )}

                      {msg.role === 'model' && !msg.content && !(msg as any).reasoning && (
                        <span className="animate-pulse text-slate-400">思考中...</span>
                      )}
                    </div>

                    {/* Message Actions (AI Only) */}
                    {msg.role === 'model' && !isLoading && msg.content && (
                      <div className="flex items-center gap-1 mt-2 ml-1">
                        <ActionBtn icon={<Copy size={18} />} onClick={() => handleCopy(msg.content)} title="复制" />
                        <ActionBtn icon={<RotateCw size={18} />} onClick={handleRegenerate} title="重新生成" />

                        <div className="p-2">
                          <FavoriteStar
                            favoriteRef={{
                              type: 'AI_ANSWER',
                              id: msg.id
                            }}
                            meta={{
                              title: msg.content.substring(0, 30) + (msg.content.length > 30 ? '...' : ''),
                              summary: msg.content.substring(0, 100),
                              tags: ['AI回答'],
                              sourceId: sessionId,
                              subtitle: '来源：对话'
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Avatar for User (Hidden in this layout as we use bubble) */}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Input Area (Pinned to bottom) */}
      <InputArea
        input={input}
        setInput={setInput}
        handleSend={() => handleSend()}
        handlePause={handlePause}
        isLoading={isLoading}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        functionMode={functionMode}
        setFunctionMode={setFunctionMode}
        placeholder={isKB ? "询问关于此知识库的内容..." : undefined}
      />
    </div>
  );
};

const SuggestionChip = ({ label, delay, onClick, className }: { label: string, delay: string, onClick: () => void, className?: string }) => (
  <button
    onClick={onClick}
    className={`px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-full hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all shadow-sm hover:shadow-md text-sm font-medium animate-[fadeInUp_0.5s_ease-out_forwards] ${className || ''}`}
    style={{ animationDelay: delay }}
  >
    {label}
  </button>
);

const ActionBtn = ({ icon, onClick, title }: any) => (
  <button
    onClick={onClick}
    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
    title={title}
  >
    {icon}
  </button>
);


// Helpers for citations
const extractReferences = (content: string) => {
  const refs: Record<string, any> = {};
  if (!content) return refs;

  // 1. Try parsing structured JSON first (from backend hidden block)
  const jsonMatch = content.match(/<!-- REFERENCE_DATA_JSON_START\n([\s\S]*?)\nREFERENCE_DATA_JSON_END -->/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      if (Array.isArray(data)) {
        data.forEach((item: any) => {
          refs[String(item.id)] = item;
        });
      }
    } catch (e) {
      console.error("Failed to parse reference JSON", e);
    }
  }

  // 2. Fallback to parsing footer text if JSON missing or for partial updates
  const lines = content.split('\n');
  let inRefs = false;
  for (const line of lines) {
    if (line.includes('**参考来源**') || line.includes('References')) {
      inRefs = true;
      continue;
    }
    if (inRefs) {
      // Match [1] something...
      const match = line.match(/^\[(\d+)\]\s+(.*)/);
      if (match) {
        const id = match[1];
        // Only populate if not already present from JSON
        if (!refs[id]) {
          const fullPath = match[2].trim();
          const fileName = fullPath.split('/').pop() || fullPath;
          refs[id] = { source: fileName };
        }
      }
    }
  }
  return refs;
};

const preprocessContent = (content: string) => {
  if (!content) return "";

  // 1. Identify where references start to avoid replacing [1] in the actual reference list into links
  const refStartIndex = content.indexOf('**参考来源**');
  let body = content;
  let footer = "";

  if (refStartIndex !== -1) {
    body = content.substring(0, refStartIndex);
    footer = content.substring(refStartIndex);
  }

  // 2. Replace [n] with [n](citation:n) in body only
  // Use negative lookbehind/ahead to ensure we don't break existing links
  // Regex matches [1], [12], etc.
  const processedBody = body.replace(/(?<!\[)\[(\d+)\](?!\]|\()/g, '[$&](citation:$1)');

  // 3. If footer exists, rewrite引用来源列表条目为 JSON 里的 source
  let formattedFooter = footer;
  if (footer) {
    const refs = extractReferences(content);
    const footerLines = footer.split('\n').map(line => {
      const match = line.match(/^\[(\d+)\]\s+(.*)/);
      if (match) {
        const id = match[1];
        const ref = refs[id];
        if (ref?.source) {
          return `[${id}] ${ref.source}`;
        }
      }
      return line;
    });
    formattedFooter = footerLines.join('\n');
  }

  return processedBody + formattedFooter;
};

export default ChatInterface;
