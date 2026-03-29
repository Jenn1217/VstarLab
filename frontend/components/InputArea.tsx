import React, { useRef, useEffect, useState } from 'react';
import { Plus, ArrowUp, Zap, Sparkles, BookOpen, Calculator, X, LayoutGrid } from 'lucide-react';
import { ModelType, FunctionMode } from '../types';

interface InputAreaProps {
  input: string;
  setInput: (val: string) => void;
  handleSend: () => void;
  handlePause: () => void;
  isLoading: boolean;
  selectedModel: ModelType;
  setSelectedModel: (model: ModelType) => void;
  functionMode: FunctionMode;
  setFunctionMode: (mode: FunctionMode) => void;
  placeholder?: string;
  hideFooter?: boolean;
}

const InputArea: React.FC<InputAreaProps> = ({
  input,
  setInput,
  handleSend,
  handlePause,
  isLoading,
  selectedModel,
  setSelectedModel,
  functionMode,
  setFunctionMode,
  placeholder = "询问关于银行数据、报告或市场分析的任何问题...",
  hideFooter = false
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showFunctionMenu, setShowFunctionMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowFunctionMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`w-full max-w-3xl mx-auto px-4 ${hideFooter ? 'pb-2' : 'pb-3'}`}>
      <div className="relative group">
        {/* Main Input Container - The "Pill" Shape */}
        <div className="
          bg-white 
          border border-slate-200 
          rounded-[2rem] 
          shadow-[0_8px_30px_rgb(0,0,0,0.04)] 
          hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] 
          transition-shadow duration-300
          focus-within:border-[#0081E5] focus-within:ring-4 focus-within:ring-[#0081E5]/10
          flex flex-col
        ">

          <div className="flex items-end p-2 gap-2">

            {/* Attachment Button */}
            <button className="p-3 mb-[2px] rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors flex-shrink-0">
              <Plus size={24} />
            </button>

            {/* Text Input */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="
                flex-1 
                bg-transparent 
                border-none 
                resize-none 
                py-4 
                max-h-[120px] 
                focus:ring-0 
                outline-none
                text-slate-700 
                placeholder:text-slate-400
                text-lg
              "
              rows={1}
            />

            {/* Right Actions Container */}
            <div className="flex items-center gap-2 mb-[2px] flex-shrink-0">

              {/* Send / Pause Button */}
              <button
                onClick={isLoading ? handlePause : handleSend}
                disabled={!input.trim() && !isLoading}
                className={`
                  p-3 rounded-full 
                  text-white 
                  transition-all duration-200
                  shadow-md
                  ${!input.trim() && !isLoading
                    ? 'bg-gray-300 cursor-not-allowed shadow-none'
                    : 'bg-[#0081E5] hover:bg-[#0056b3] shadow-[#0081E5]/20'
                  }
                `}
              >
                {isLoading ? (
                  <div className="w-5 h-5 flex items-center justify-center">
                    <div className="w-3 h-3 bg-white rounded-[2px]" />
                  </div>
                ) : (
                  <ArrowUp size={20} strokeWidth={2.5} />
                )}
              </button>
            </div>
          </div>

          {/* Bottom Bar: Model Selector & Tools (Inside the pill) */}
          <div className="px-5 pb-3 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              {/* Model Toggle pill */}
              <div className="flex bg-slate-100 p-0.5 rounded-full border border-slate-200">
                <button
                  onClick={() => setSelectedModel(ModelType.STANDARD)}
                  className={`
                      px-3 py-1 rounded-full flex items-center gap-1.5 transition-all
                      ${selectedModel === ModelType.STANDARD ? 'bg-white text-[#0081E5] shadow-sm font-medium' : 'hover:text-slate-700'}
                    `}
                >
                  <Zap size={12} fill="currentColor" className="opacity-80" />
                  标准 API
                </button>
                <button
                  onClick={() => setSelectedModel(ModelType.FINETUNED)}
                  className={`
                      px-3 py-1 rounded-full flex items-center gap-1.5 transition-all
                      ${selectedModel === ModelType.FINETUNED ? 'bg-white text-[#0081E5] shadow-sm font-medium' : 'hover:text-slate-700'}
                    `}
                >
                  <Sparkles size={12} fill="currentColor" className="opacity-80" />
                  微调模型
                </button>
              </div>

              {/* Function Mode Button */}
              <div className="relative" ref={menuRef}>
                {functionMode ? (
                  // Active State
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#0081E5] bg-white shadow-sm animate-[fadeIn_0.3s_ease-out]">
                    <span className="text-[#0081E5]">
                      {functionMode === 'wenzhi' ? <BookOpen size={14} /> : <Calculator size={14} />}
                    </span>
                    <span className="text-[#0081E5] font-medium text-xs leading-none pt-0.5">
                      {functionMode === 'wenzhi' ? '文智' : '数智'}
                    </span>
                    <button
                      onClick={() => setFunctionMode(null)}
                      className="ml-1 text-[#0081E5]/60 hover:text-[#0081E5] hover:bg-[#0081E5]/10 rounded-full p-0.5 transition-colors"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                ) : (
                  // Inactive State
                  <button
                    onClick={() => setShowFunctionMenu(!showFunctionMenu)}
                    className={`
                      px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all
                      border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700
                    `}
                  >
                    <LayoutGrid size={12} className="opacity-80" />
                    功能
                  </button>
                )}

                {/* Function Selection Menu */}
                {showFunctionMenu && !functionMode && (
                  <div className="absolute bottom-full left-0 mb-2 w-32 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-20 animate-[fadeInUp_0.2s_ease-out]">
                    <button
                      onClick={() => {
                        setFunctionMode('wenzhi');
                        setShowFunctionMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors text-slate-700"
                    >
                      <BookOpen size={14} className="text-[#0081E5]" />
                      <span className="pt-0.5 text-xs font-bold">文智</span>
                    </button>
                    <div className="h-px bg-slate-100 mx-2" />
                    <button
                      onClick={() => {
                        setFunctionMode('shuzhi');
                        setShowFunctionMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors text-slate-700"
                    >
                      <Calculator size={14} className="text-[#0081E5]" />
                      <span className="pt-0.5 text-xs font-bold">数智</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="text-slate-400">
              {input.length} / 2000
            </div>
          </div>
        </div>

        {!hideFooter && (
          <div className="text-center mt-1 text-xs text-slate-400">
            欢迎使用财析入微
          </div>
        )}
      </div>
    </div>
  );
};

export default InputArea;
