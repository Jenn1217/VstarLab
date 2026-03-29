from typing import Annotated, TypedDict, Sequence, Optional, Dict, List, Any
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
import json
import re
import time
from run3 import ModelPool, PolicyKnowledgeBase
import stream_context

# ==================== 1. 状态定义 ====================
class LearnState(TypedDict):
    """文智学习模式状态"""
    messages: Annotated[Sequence[BaseMessage], add_messages]
    
    # 学习状态
    current_topic: Optional[str]        # 当前学习主题
    status: str                         # idle, waiting_answer
    context_text: str                   # RAG 上下文

# ==================== 2. 节点定义 ====================

def router_node(state: LearnState) -> str:
    """路由节点：决定是生成新题还是评估回答"""
    # 如果状态是 waiting_answer，说明上一轮是出题，这一轮是用户回答 -> 评估
    if state.get('status') == 'waiting_answer':
        return "evaluate_answer"
    else:
        # 否则分析意图/出新题
        return "analyze_intent"

def analyze_intent_node(state: LearnState) -> LearnState:
    """分析用户意图，提取知识点"""
    user_msg = state['messages'][-1].content
    
    # 1. 检索知识库
    kb = PolicyKnowledgeBase.get_instance()
    # 搜索 top 3 用于生成题目
    results = kb.search(user_msg, top_k=3)
    
    context_text = ""
    for i, r in enumerate(results):
        context_text += f"片段{i+1}: {r['text']}\n\n"
    
    state['context_text'] = context_text
    state['current_topic'] = user_msg # 简单将用户输入作为主题
    
    return state

def generate_quiz_node(state: LearnState) -> LearnState:
    """生成测验题目"""
    model_pool = ModelPool.get_instance()
    
    prompt = f"""
Role (角色): 你是苏州银行的智能金融导师“文智”。

Instruction (核心指令): 该用户正在询问或学习主题：“{state.get('current_topic', '金融知识')}”。
请基于以下知识库内容，严格遵循 “先解答，后巩固” 的两步工作流。
**请一定要使用丰富的Emoji表情（如 💰, 🏦, 💡, 📈 等）来增加回答的趣味性和清晰度。**

【知识库内容】：
{state.get('context_text', '无')}

第一步：清晰解答 (The Explanation) 📖
首先，直接、准确地回答用户的问题（或解释概念）。
语言风格：专业但通俗，适合金融初学者。请多用列表或分段使内容更清晰。
解释完核心概念后，请换行。

第二步：互动测验 (The Quiz) ❓
过渡语： 使用一句自然的过渡语，例如：“为了帮您巩固一下刚才的知识点，我来考考您...”
生成题目： 基于你刚才解释的内容，生成一道单项选择题 (A/B/C/D)。

重要规则：
1. 题目不能太难，要紧扣刚才的解释。
2. **绝对不要**在这一轮输出中包含正确答案或解析。
3. 输出完题目和选项后，立即停止，等待用户输入。
"""

    messages = [
        {"role": "system", "content": "你是一个专业的金融教育AI，负责生成测验题。"},
        # 包含部分历史（如果需要连贯性），但针对新题，我们主要依赖 prompt
        # 这里只放 System + Prompt 即可，或者是 messages history + prompt
        {"role": "user", "content": prompt}
    ]
    
    stream_handler = stream_context.get_stream_handler()
    full_content = ""
    
    for chunk in model_pool.stream_completion(messages, model_name=model_pool.knowledge_base_model):
        if stream_handler:
            stream_handler(chunk)
            
        if chunk.get('type') == 'content':
            full_content += chunk.get('content', '')
    
    state['messages'].append(AIMessage(content=full_content))
    state['status'] = 'waiting_answer'
        
    return state

def evaluate_node(state: LearnState) -> LearnState:
    """评估用户回答"""
    # 获取完整的对话历史，让模型判断
    # 构造一个 Prompt，包含 Context 和 用户的回答
    
    model_pool = ModelPool.get_instance()
    user_answer = state['messages'][-1].content
    
    # 获取上一条 AI 消息（题目）
    # 在 messages 列表中，[-1] 是用户回答，[-2] 应该是 AI 出题
    last_ai_msg = state['messages'][-2].content if len(state['messages']) >= 2 else ""
    
    prompt = f"""
Role (角色): 你是苏州银行的智能金融导师“文智”。

【背景知识】：
{state.get('context_text', '无')}

【上一轮题目】：
{last_ai_msg}

【用户回答】：
{user_answer}

【任务】：
请判断用户的回答是否正确。**请使用丰富的Emoji（如 🎉, 🤔, ✨, 💪）来增强互动体验。**

1. 如果答错 (Incorrect) ❌：
   - **绝对不要直接给出正确答案**。
   - 给予一个生动的提示（Hint）或类比，引导用户重新思考并重试。
   - 鼓励用户再次尝试。

2. 如果答对 (Correct) ✅：
   - 给予肯定和夸奖。
   - 简要解释为什么是对的（巩固知识）。
   - 然后，你可以选择：
     a) 进行更深入的拓展讲解（Feature Extension）。
     b) 或者询问用户是否还有其他疑问（结束当前话题）。

语言风格：亲切、专业、循循善诱。
"""

    messages = [
        {"role": "system", "content": "你是一位亲切的金融导师，正在进行苏格拉底式教学。"},
        {"role": "user", "content": prompt}
    ]
    
    stream_handler = stream_context.get_stream_handler()
    full_content = ""
    
    for chunk in model_pool.stream_completion(messages, model_name=model_pool.knowledge_base_model):
        if stream_handler:
            stream_handler(chunk)
            
        if chunk.get('type') == 'content':
            full_content += chunk.get('content', '')
             
    state['messages'].append(AIMessage(content=full_content))
    
    # 简单通过关键词判断是否需要重试
    # 如果回复中包含 "重试"、"再想"、"不对" 等，可能需要保持 waiting_answer
    # 但为了简化，我们假设用户每次回答后都进入 idle (或者 new intent)，
    # 除非模型明确引导。
    # 这是一个简化：如果用户答错了，模型引导重试，用户下一句输入会被 analyze_intent 捕获吗？
    # 如果 analyze_intent 只是搜索知识库 + 出题，那用户重试的答案会被当成"新主题"去搜索。
    # 这会有问题。
    
    # 改进 router：
    # 我们需要模型判断 "Interaction Status"。
    # 让模型输出判断结果？
    
    # 简单策略：
    # 如果是"答错提示"，我们应该保持 status='waiting_answer'。
    # 如何知道模型判定为答错？
    # 我们可以再调一次 nice_llm_json 来判断 status，但这慢。
    
    # 替代方案：始终保持 waiting_answer，直到用户说 "下一题" 或 "换个话题"?
    # 或者：evaluator 总是将 status 设为 idle。
    # 如果用户继续回答（重试），router 看到 idle -> analyze_intent -> generate_quiz (新题)。
    # 这就打断了重试流程。
    
    # 让我们假设：
    # 如果 AI 回复中包含 "试一试"、"再想"、"提示" 等字眼，设置为 waiting_answer
    if any(k in full_content for k in ["试", "想", "提示", "不对", "错误"]):
        state['status'] = 'waiting_answer'
    else:
        state['status'] = 'idle'

    return state

# ==================== 4. 构建图 ====================
def create_learning_agent(checkpointer=None):
    workflow = StateGraph(LearnState)
    
    workflow.add_node("analyze_intent", analyze_intent_node)
    workflow.add_node("generate_quiz", generate_quiz_node)
    workflow.add_node("evaluate_answer", evaluate_node)
    
    # 路由
    workflow.add_conditional_edges(
        START,
        router_node,
        {
            "analyze_intent": "analyze_intent",
            "evaluate_answer": "evaluate_answer"
        }
    )
    
    workflow.add_edge("analyze_intent", "generate_quiz")
    workflow.add_edge("generate_quiz", END)
    workflow.add_edge("evaluate_answer", END)
    
    memory = checkpointer if checkpointer else MemorySaver()
    return workflow.compile(checkpointer=memory)
