from typing import Annotated, TypedDict, Sequence, Optional, Dict, List, Any
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
import re
import time
import json
from dataclasses import dataclass, field, asdict
import statistics
import requests
import difflib
import os
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
import stream_context
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
DATA_DIR = BASE_DIR / "data"
# Add project root (which is BASE_DIR.parent) to sys.path to allow importing from 'cag'
project_root_for_import = BASE_DIR.parent
if str(project_root_for_import) not in sys.path:
    sys.path.append(str(project_root_for_import))

try:
    from cag.cag_runtime import CAGQA, KB_DIR, EMBEDDING_MODEL_PATH
except ImportError as e:
    print(f"⚠️ Warning: Could not import CAG module. Error: {e}")
    CAGQA = None
    KB_DIR = None
    EMBEDDING_MODEL_PATH = None

_cag_qa_instance = None
_cag_qa_unavailable = False

def cag_llm_wrapper(question: str, contexts: List[Dict]) -> str:
    # Construct context string similar to call_llm
    ctx_lines = []
    for c in contexts:
        cid = c.get("id")
        txt = (c.get("text") or "").replace("\n", " ").strip()
        ctx_lines.append(f"[chunk:{cid}] {txt}")
    kb_text = "\n".join(ctx_lines)

    system_prompt = (
        "你只能使用我提供的 Context 来回答问题。\n"
        "【重要】只输出回答正文，不要输出任何引用、来源列表、文件名或【引用来源】标题。\n"
        "如果 Context 不足以回答，请明确说“资料不足”。\n\n"
        "Context:\n"
        f"{kb_text}\n"
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question}
    ]
    
    try:
        model_pool = ModelPool.get_instance()
        # Use knowledge_base_model or whatever is selected
        model_name = model_pool.knowledge_base_model
        
        full_content = ""
        # We ignore reasoning here as per CAG requirement (just text)
        for chunk in model_pool.stream_completion(messages, model_name=model_name):
            if chunk['type'] == 'content':
                full_content += chunk['content']
        return full_content.strip()
    except Exception as e:
        print(f"❌ CAG LLM Wrapper Error: {e}")
        return "很抱歉，生成回答时遇到错误。"

def get_cag_qa():
    global _cag_qa_instance
    global _cag_qa_unavailable
    if _cag_qa_unavailable:
        return None
    if _cag_qa_instance is None and CAGQA:
        try:
            if not KB_DIR or not Path(KB_DIR).exists():
                print(f"⚠️ CAG disabled: KB_DIR not found: {KB_DIR}")
                _cag_qa_unavailable = True
                return None
            if not EMBEDDING_MODEL_PATH or not Path(EMBEDDING_MODEL_PATH).exists():
                print(f"⚠️ CAG disabled: embedding model path not found: {EMBEDDING_MODEL_PATH}")
                _cag_qa_unavailable = True
                return None
            print("🚀 Initializing CAG (Cache Augmented Generation) System...")
            _cag_qa_instance = CAGQA(KB_DIR, EMBEDDING_MODEL_PATH, llm_func=cag_llm_wrapper)
        except Exception as e:
            print(f"⚠️ CAG initialization failed, falling back to legacy KB. Error: {e}")
            _cag_qa_unavailable = True
            return None
    return _cag_qa_instance

def _ensure_citation_footer(text: str, sources: List[str]) -> str:
    """
    保证最终输出一定包含【引用来源】区块；
    若 text 已经包含【引用来源】，则不重复追加。
    """
    t = (text or "").rstrip()
    if "【引用来源】" in t:
        return t
    block = "【引用来源】"
    srcs = sorted(set([s.strip() for s in sources if isinstance(s, str) and s.strip()]))
    if srcs:
        block += "\n" + "\n".join(f"- {s}" for s in srcs)
    return t + "\n\n" + block

# ==================== Schema Whitelist & Rewriting (New) ====================
# === Schema whitelist (唯一真相) ===
SCHEMA_MAP = {
    "acct_bal_new2": {
        "org_num", "sbj_num", "acct_num", "sbact_acct_bal",
        "acg_dt", "dt", "ccy", "gnl_ldgr_bal",
    },
    "vchr_hist": {
        "acct_num", "sbj_num", "org_num", "acg_dt",
        "ldin_flg", "rd_flg",
        "trd_flg", # As per user DDL (trd_flg DATE)
        "txn_tm", "orig_vchr_num", "vchr_num", "vchr_inr_serl",
        "ccy", "dt", "dt_date",
        "txn_dt" # vchr_hist in DDL shows trd_flg but TABLE_FIELDS had txn_dt. Keeping txn_dt just in case.
    },
    "txn_hist": {
        "acct_num", "vchr_num", "acg_dt",
        "orig_txn_log_num_rvrs", "log_num_serl_num", "aplct_stm_seq_num",
        "ldin_flg", "acg_acct_num", "ccy",
        "txn_amt", "crn_bal",
        "txn_ofst_dt", "orig_txn_acg_dt", "orig_txn_log_num",
        "dt", "dt_date",
    },
    "recon_bal": {
        "org_num", "sbj_num", "ccy",
        "sbact_acct_bal", "gnl_ldgr_bal", "tot_mint_dif",
        "dt", "dt_date",
    },
}

# === Common wrong->correct field rewrites ===
FIELD_SYNONYMS = {
    # 账号
    "acct_no": "acct_num",
    "acct": "acct_num",
    "account": "acct_num",
    "account_id": "acct_num",
    # 科目
    "subject_cd": "sbj_num",
    "subject_code": "sbj_num",
    "subject": "sbj_num",
    # 日期
    "txn_date": "acg_dt",      # 你系统之前错得最典型的：txn_date 实际你用 acg_dt
    "accounting_date": "acg_dt",
    "date": "acg_dt",
    # 机构
    "org_acct_no": "org_num",
    "org_account": "org_num",
    "org_id": "org_num",
}

def qualify_table(table: str) -> str:
    """
    Deprecated legacy prefix checking.
    Everything is now in local_fintech, returns base table name.
    """
    if not table: 
        return table
    
    t = table.strip()
    if "." in t:
        return t.split(".")[-1]
    
    return t

def _normalize_table_name(table: str) -> str:
    """
    Deprecated in favor of qualify_table logic, but keeping for compatibility if used elsewhere.
    Now delegates to qualify_table for known tables.
    """
    return qualify_table(table)



def _rewrite_field_name(field: str) -> str:
    if not field:
        return field
    f = field.strip()
    return FIELD_SYNONYMS.get(f, f)


def _rewrite_filters(filters):
    """
    Supports common shapes:
      filters: [{"field": "...", "op": "=", "value": "..."}]
      filters: {"acct_no": "...", "txn_date": "..."}   # 你如果允许这种，也能支持
    """
    if filters is None:
        return filters, set()

    changed = set()

    # list[dict]
    if isinstance(filters, list):
        for it in filters:
            if isinstance(it, dict) and "field" in it:
                old = it["field"]
                new = _rewrite_field_name(old)
                if new != old:
                    it["field"] = new
                    changed.add((old, new))
        return filters, changed

    # dict
    if isinstance(filters, dict):
        new_filters = {}
        for k, v in filters.items():
            nk = _rewrite_field_name(k)
            if nk != k:
                changed.add((k, nk))
            new_filters[nk] = v
        return new_filters, changed

    # unknown type
    return filters, changed


def validate_and_rewrite_intent(intent_data: dict) -> dict:
    """
    1) normalize table name
    2) rewrite wrong field names in filters
    3) whitelist check: all referenced fields must exist in SCHEMA_MAP[table]
    Raises ValueError if not valid.
    """
    if not isinstance(intent_data, dict):
        raise ValueError("intent_data must be a dict")

    table = _normalize_table_name(intent_data.get("table", ""))
    intent_data["table"] = table

    if table not in SCHEMA_MAP:
        raise ValueError(f"Unknown table: {table}. Allowed: {list(SCHEMA_MAP.keys())}")

    allowed = SCHEMA_MAP[table]

    # rewrite filters
    filters, changed = _rewrite_filters(intent_data.get("filters"))
    intent_data["filters"] = filters

    # collect referenced fields
    referenced = set()

    if isinstance(filters, list):
        for it in filters:
            if isinstance(it, dict) and "field" in it:
                referenced.add(it["field"])
    elif isinstance(filters, dict):
        referenced |= set(filters.keys())

    # 如果你还有 select_columns / group_by / order_by，也在这里加白名单检查
    for key in ("select_columns", "group_by", "order_by"):
        cols = intent_data.get(key)
        if hasattr(cols, "get") and "field" in cols: # Order by structure
             referenced.add(cols.get("field"))
        elif isinstance(cols, list): # Group by or select columns
             referenced |= set(cols)

    illegal = [c for c in referenced if c not in allowed]
    if illegal:
        raise ValueError(
            f"Illegal columns for {table}: {illegal}. Allowed columns: {sorted(list(allowed))}. "
            f"(Auto-rewrite applied: {sorted(list(changed))})"
        )

    # 可选：把 rewrite 结果记录下来方便 debug
    if changed:
        intent_data["_rewritten_fields"] = [{"from": a, "to": b} for a, b in changed]

    return intent_data



# ==================== 数据库连接类 ====================
class DatabaseManager:
    """数据库连接管理器"""
    _instance = None

    def __init__(self):
        self.host = "127.0.0.1"
        self.port = 3306
        self.user = "root"
        self.password = "123456"
        self.default_database = "local_fintech"
        # Connection cache: database_name -> connection
        self.connections = {}
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def get_connection(self, database_name=None):
        """获取指定数据库的连接"""
        db_name = database_name or self.default_database
        
        try:
            import pymysql
            import pymysql.cursors
            
            # Check if we have an active connection for this database
            if db_name not in self.connections or not self.connections[db_name].open:
                print(f"🔌 [数据库连接] 正在连接到 {db_name}...")
                self.connections[db_name] = pymysql.connect(
                    host=self.host,
                    port=self.port,
                    user=self.user,
                    password=self.password,
                    database=db_name,
                    charset='utf8mb4',
                    cursorclass=pymysql.cursors.DictCursor
                )
            return self.connections[db_name]
        except ImportError:
            print("请安装 pymysql: pip install pymysql")
            return None
        except Exception as e:
            print(f"数据库连接失败 ({db_name}): {e}")
            return None
    
    def get_target_db_from_query(self, query: str) -> str:
        """不再做多库判断，全部指向 local_fintech"""
        return self.default_database

    def execute_query(self, query: str, params=None):
        """执行查询并返回结果"""
        # Determine target database
        target_db = self.get_target_db_from_query(query)
        
        conn = self.get_connection(target_db)
        if conn is None:
            return None
        
        # 打印SQL执行日志
        print("\n" + "="*80)
        print(f"📤 [SQL执行] 准备发送到数据库 [{target_db}]")
        print("="*80)
        print(f"🔹 SQL语句:\n{query}")
        print(f"🔹 参数: {params}")
        print(f"🔹 目标数据库: {target_db}")
        print(f"🔹 主机: {self.host}:{self.port}")
        print("="*80)
            
        try:
            with conn.cursor() as cursor:
                # 执行前记录时间
                import time
                start_time = time.time()
                
                # 执行SQL
                cursor.execute(query, params or ())
                result = cursor.fetchall()
                
                # 执行后记录
                elapsed = (time.time() - start_time) * 1000
                print(f"✅ [SQL执行成功] 耗时: {elapsed:.2f}ms")
                print(f"📊 返回结果: {len(result)} 行")
                if result:
                    print(f"🔍 首行数据: {result[0]}")
                print("="*80 + "\n")
                
                return result
        except Exception as e:
            print(f"❌ [SQL执行失败] 错误: {e}")
            # Invalidate connection to force reconnect on next try
            if target_db in self.connections:
                try:
                    self.connections[target_db].close()
                except:
                    pass
                del self.connections[target_db]
                print(f"⚠️ [连接已重置] 用于 {target_db} 的连接已清除")
                
            print("="*80 + "\n")
            return None
    
    def close_connection(self):
        """关闭所有连接"""
        for db, conn in self.connections.items():
            if conn and conn.open:
                conn.close()
        self.connections = {}


# ==================== 全局模型实例(避免重复初始化) ====================
class ModelPool:
    """模型池 - 复用模型实例"""
    _instance = None
    
    def __init__(self):
        self.deepseek_api_key = "sk-xxxxxxxxxxx"
        self.deepseek_base_url = "https://api.deepseek.com/v1"
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.deepseek_api_key}",
            "Content-Type": "application/json"
        })
        self.backend = "api"
        self.table_query_model = "deepseek-chat"
        self.knowledge_base_model = "deepseek-reasoner"
        self.ollama_base_url = "http://localhost:11434"
        self.ollama_base_url = "http://localhost:11434"
        self.ollama_model = "llama3.1:8b"
        
        # vLLM / Fine-tune Configuration (改为与标准 API 一致的 DeepSeek 云端配置)
        self.vllm_base_url = "https://api.deepseek.com/v1"
        self.fine_tuned_model = "deepseek-reasoner"
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    def set_backend(self, backend: str, model: Optional[str] = None):
        b = backend.lower() if backend else "api"
        if b in ["api", "ollama", "local"]:
            self.backend = "ollama" if b in ["ollama", "local"] else "api"
        else:
            self.backend = "api"
        if model:
            self.ollama_model = model
        
        # 验证 API 接入状态
        if self.backend == "api":
            masked_key = f"{self.deepseek_api_key[:4]}****{self.deepseek_api_key[-4:]}" if self.deepseek_api_key else "None"
            print(f"\n✅ [API 配置确认] 模式: API | Key: {masked_key} | BaseURL: {self.deepseek_base_url}")
            print("💡 提示: 如果能看到此日志，说明程序已正确加载 API 配置。实际连通性将在第一次请求时验证。")
        else:
            print(f"\n✅ [本地模型确认] 模式: Ollama | Model: {self.ollama_model} | BaseURL: {self.ollama_base_url}")
    
    def stream_completion(self, messages: List[Dict], temperature: float = 0, model_name: Optional[str] = None):
        if self.backend == "api":
            print(f"🔍 [模型选择调试] stream_completion 调用, model_name: {model_name}")
            
            # Target URL selection
            target_url = f"{self.deepseek_base_url}/chat/completions"
            if model_name == self.fine_tuned_model:
                target_url = f"{self.vllm_base_url}/chat/completions"
                # vLLM often doesn't need auth or needs dummy
                # Session headers have deepseek key, usually ignored by local vLLM or accepts anything
                
            payload = {
                "model": model_name if model_name else self.knowledge_base_model,
                "messages": messages,
                "temperature": temperature,
                "stream": True
            }
            try:
                response = self.session.post(
                    target_url,
                    json=payload,
                    stream=True,
                    timeout=5 # Reduce timeout for local connection check
                )
                response.raise_for_status()
            except (requests.exceptions.ConnectionError, requests.exceptions.HTTPError, requests.exceptions.Timeout) as e:
                if model_name == self.fine_tuned_model:
                    print(f"⚠️ [连接失败] 微调模型服务不可用 ({e})，正在自动降级至标准模型...")
                    # Fallback to DeepSeek API
                    target_url = f"{self.deepseek_base_url}/chat/completions"
                    payload["model"] = self.table_query_model # Best general fallback
                    response = self.session.post(
                        target_url,
                        json=payload,
                        stream=True,
                        timeout=30
                    )
                else:
                    raise e
            reasoning_content = ""
            content = ""
            is_thinking = False
            
            for line in response.iter_lines():
                if not line:
                    continue
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    line = line[6:]
                if line.strip() == '[DONE]':
                    break
                try:
                    chunk = json.loads(line)
                    if 'choices' in chunk and len(chunk['choices']) > 0:
                        delta = chunk['choices'][0].get('delta', {})
                        
                        # Handle native reasoning field (DeepSeek)
                        rc = delta.get('reasoning_content')
                        if rc is not None and rc != "":
                            reasoning_chunk = rc if isinstance(rc, str) else str(rc)
                            reasoning_content += reasoning_chunk
                            yield {
                                'type': 'reasoning',
                                'content': reasoning_chunk,
                                'full_reasoning': reasoning_content
                            }
                        
                        # Handle content field (may contain <think> tags for fine-tuned models)
                        c = delta.get('content')
                        if c is not None and c != "":
                            # Check for tag transitions
                            text = c if isinstance(c, str) else str(c)
                            
                            if "<think>" in text:
                                is_thinking = True
                                parts = text.split("<think>", 1)
                                # Content before <think> (if any)
                                if parts[0]:
                                    content += parts[0]
                                    yield {
                                        'type': 'content',
                                        'content': parts[0],
                                        'full_content': content
                                    }
                                # Content after <think> starts as reasoning
                                if parts[1]:
                                    reasoning_content += parts[1]
                                    yield {
                                        'type': 'reasoning',
                                        'content': parts[1],
                                        'full_reasoning': reasoning_content
                                    }
                                continue
                                
                            if "</think>" in text:
                                is_thinking = False
                                parts = text.split("</think>", 1)
                                # Content before </think> is reasoning
                                if parts[0]:
                                    reasoning_content += parts[0]
                                    yield {
                                        'type': 'reasoning',
                                        'content': parts[0],
                                        'full_reasoning': reasoning_content
                                    }
                                # Content after </think> is normal content
                                if parts[1]:
                                    content += parts[1]
                                    yield {
                                        'type': 'content',
                                        'content': parts[1],
                                        'full_content': content
                                    }
                                continue

                            # Normal streaming based on current state
                            if is_thinking:
                                reasoning_content += text
                                yield {
                                    'type': 'reasoning',
                                    'content': text,
                                    'full_reasoning': reasoning_content
                                }
                            else:
                                content += text
                                yield {
                                    'type': 'content',
                                    'content': text,
                                    'full_content': content
                                }
                except json.JSONDecodeError:
                    continue
        else:
            payload = {
                "model": self.ollama_model,
                "messages": messages,
                "stream": True
            }
            response = requests.post(
                f"{self.ollama_base_url}/api/chat",
                json=payload,
                stream=True,
                timeout=30
            )
            content = ""
            for line in response.iter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line.decode('utf-8'))
                except Exception:
                    continue
                msg = data.get('message')
                if msg and isinstance(msg, dict):
                    c = msg.get('content')
                    if c is not None and c != "":
                        content_chunk = c if isinstance(c, str) else str(c)
                        content += content_chunk
                        yield {
                            'type': 'content',
                            'content': content_chunk,
                            'full_content': content
                        }
                if data.get('done'):
                    break

    def completion(self, messages: List[Dict], temperature: float = 0.0, model_name: Optional[str] = None):
        if self.backend == "api":
            # Target URL selection
            target_url = f"{self.deepseek_base_url}/chat/completions"
            if model_name == self.fine_tuned_model:
                target_url = f"{self.vllm_base_url}/chat/completions"

            payload = {
                "model": model_name if model_name else self.knowledge_base_model,
                "messages": messages,
                "temperature": temperature,
                "stream": False
            }
            try:
                response = self.session.post(
                    target_url,
                    json=payload,
                    timeout=5 # Short timeout for availability check
                )
                response.raise_for_status()
            except (requests.exceptions.ConnectionError, requests.exceptions.HTTPError, requests.exceptions.Timeout) as e:
                if model_name == self.fine_tuned_model:
                    print(f"⚠️ [连接失败] 微调模型服务不可用 ({e})，正在自动降级至标准模型...")
                    target_url = f"{self.deepseek_base_url}/chat/completions"
                    payload["model"] = self.table_query_model
                    response = self.session.post(
                        target_url,
                        json=payload,
                        timeout=30
                    )
                else:
                    raise e
            data = response.json()
            if 'choices' in data and len(data['choices']) > 0:
                msg = data['choices'][0].get('message', {})
                return msg.get('content', '')
            return ""
        else:
            payload = {
                "model": self.ollama_model,
                "messages": messages,
                "stream": False
            }
            response = requests.post(
                f"{self.ollama_base_url}/api/chat",
                json=payload,
                timeout=30
            )
            data = response.json()
            msg = data.get('message', {})
            return msg.get('content', '') if isinstance(msg, dict) else ""


# ==================== 1. 性能指标数据类 ====================
@dataclass
class PerformanceMetrics:
    """性能指标跟踪"""
    response_times: List[float] = field(default_factory=list)
    avg_response_time: float = 0.0
    max_response_time: float = 0.0
    min_response_time: float = float('inf')
    
    first_token_latency: List[float] = field(default_factory=list)
    avg_first_token_latency: float = 0.0
    streaming_enabled_rounds: int = 0
    
    total_queries: int = 0
    successful_queries: int = 0
    failed_queries: int = 0
    accuracy_rate: float = 0.0
    
    reasoning_times: List[float] = field(default_factory=list)
    avg_reasoning_time: float = 0.0
    
    total_noise_detected: int = 0
    false_positive_noise: int = 0
    noise_filter_effectiveness: float = 0.0
    
    def update_response_time(self, time_ms: float):
        self.response_times.append(time_ms)
        self.avg_response_time = statistics.mean(self.response_times)
        self.max_response_time = max(self.response_times)
        self.min_response_time = min(self.response_times)
    
    def update_first_token_latency(self, time_ms: float):
        self.first_token_latency.append(time_ms)
        self.avg_first_token_latency = statistics.mean(self.first_token_latency)
        self.streaming_enabled_rounds += 1
    
    def update_accuracy(self, success: bool):
        self.total_queries += 1
        if success:
            self.successful_queries += 1
        else:
            self.failed_queries += 1
        self.accuracy_rate = (self.successful_queries / self.total_queries) * 100
    
    def update_reasoning_time(self, time_ms: float):
        self.reasoning_times.append(time_ms)
        self.avg_reasoning_time = statistics.mean(self.reasoning_times)
    
    def update_noise_metrics(self, is_noise: bool, is_false_positive: bool = False):
        if is_noise:
            self.total_noise_detected += 1
        if is_false_positive:
            self.false_positive_noise += 1
        if self.total_noise_detected > 0:
            self.noise_filter_effectiveness = (
                (self.total_noise_detected - self.false_positive_noise) / 
                self.total_noise_detected * 100
            )
    
    def get_summary(self) -> Dict:
        return {
            "响应时间": {
                "平均响应时间(ms)": round(self.avg_response_time, 2),
                "峰值响应时间(ms)": round(self.max_response_time, 2),
                "最小响应时间(ms)": round(self.min_response_time, 2) if self.min_response_time != float('inf') else 0,
                "是否达标(<200ms)": "✓" if self.avg_response_time < 200 else "✗",
                "峰值是否达标(<500ms)": "✓" if self.max_response_time < 500 else "✗"
            },
            "流式输出": {
                "平均首Token延迟(ms)": round(self.avg_first_token_latency, 2) if self.first_token_latency else 0,
                "流式轮次": self.streaming_enabled_rounds,
                "流式使用率(%)": round(self.streaming_enabled_rounds / self.total_queries * 100, 2) if self.total_queries > 0 else 0
            },
            "准确率": {
                "总查询数": self.total_queries,
                "成功查询数": self.successful_queries,
                "失败查询数": self.failed_queries,
                "准确率(%)": round(self.accuracy_rate, 2),
                "是否达标(>=90%)": "✓" if self.accuracy_rate >= 90 else "✗"
            },
            "推理性能": {
                "平均推理时间(ms)": round(self.avg_reasoning_time, 2) if self.reasoning_times else 0,
                "是否达标(<500ms)": "✓" if self.avg_reasoning_time < 500 else "✗"
            },
            "干扰过滤": {
                "检测干扰数": self.total_noise_detected,
                "误报数": self.false_positive_noise,
                "过滤有效率(%)": round(self.noise_filter_effectiveness, 2),
                "是否达标(>=95%)": "✓" if self.noise_filter_effectiveness >= 95 else "✗"
            }
        }


@dataclass
class ContextMemoryMetrics:
    """上下文记忆指标"""
    total_rounds: int = 0
    intent_coherent_rounds: int = 0
    intent_coherence_rate: float = 0.0
    nested_intent_cases: int = 0
    nested_intent_success: int = 0
    nested_intent_accuracy: float = 0.0
    dimension_extraction_attempts: int = 0
    dimension_extraction_success: int = 0
    dimension_extraction_rate: float = 0.0
    
    def update_intent_coherence(self, is_coherent: bool):
        self.total_rounds += 1
        if is_coherent:
            self.intent_coherent_rounds += 1
        self.intent_coherence_rate = (self.intent_coherent_rounds / self.total_rounds) * 100
    
    def update_nested_intent(self, success: bool):
        self.nested_intent_cases += 1
        if success:
            self.nested_intent_success += 1
        self.nested_intent_accuracy = (self.nested_intent_success / self.nested_intent_cases) * 100
    
    def update_dimension_extraction(self, success: bool):
        self.dimension_extraction_attempts += 1
        if success:
            self.dimension_extraction_success += 1
        self.dimension_extraction_rate = (
            self.dimension_extraction_success / self.dimension_extraction_attempts * 100
        )
    
    def get_summary(self) -> Dict:
        return {
            "意图连贯性": {
                "总对话轮次": self.total_rounds,
                "连贯轮次": self.intent_coherent_rounds,
                "连贯性保持率(%)": round(self.intent_coherence_rate, 2),
                "是否达标(>=90%)": "✓" if self.intent_coherence_rate >= 90 else "✗"
            },
            "多意图嵌套": {
                "嵌套案例数": self.nested_intent_cases,
                "成功处理数": self.nested_intent_success,
                "处理准确率(%)": round(self.nested_intent_accuracy, 2),
                "是否达标(>=85%)": "✓" if self.nested_intent_accuracy >= 85 else "✗"
            },
            "维度提取": {
                "提取尝试数": self.dimension_extraction_attempts,
                "提取成功数": self.dimension_extraction_success,
                "提取成功率(%)": round(self.dimension_extraction_rate, 2)
            }
        }


# ==================== 2. 状态定义 ====================
class AccountingState(TypedDict):
    """账务对话状态"""
    messages: Annotated[Sequence[BaseMessage], add_messages]
    
    # 核心维度
    account_number: str
    subject_code: str
    amount: float
    currency: str
    transaction_date: str
    business_type: str
    exchange_rate: float
    
    # 对话管理
    intent_history: list[str]
    conversation_round: int
    is_noise: bool
    dimension_memory: dict
    
    # 性能跟踪
    performance_metrics: dict
    context_memory_metrics: dict
    current_round_start_time: float

    should_query: bool
    is_noise: bool
    knowledge_domain: str
    knowledge_domain: str
    knowledge_domain: str
    # stream_handler removed from state to avoid serialization issues
    function_mode: str # 'shuzhi' | 'default' | 'wenzhi'
    model_selection: str # 'default' | 'fine_tuned'

# ==================== 3. 实体提取(轻量化) ====================
class EntityExtractor:
    """快速实体提取"""
    
    @staticmethod
    def extract_entities(text: str) -> dict:
        entities = {}
        
        # 账号(UUID)
        match = re.search(r'([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})', text, re.I)
        if match:
            entities['account_number'] = match.group(1)
        
        # 科目号(7位)
        match = re.search(r'(\d{7})', text)
        if match:
            entities['subject_code'] = match.group(1)
        
        # 日期 - 标准化为 YYYY-MM-DD 格式
        match = re.search(r'(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})', text)
        if match:
            year, month, day = match.groups()
            # 标准化为 YYYY-MM-DD 格式
            entities['transaction_date'] = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        
        # 金额
        match = re.search(r'([\d,]+\.?\d*)\s*万?元', text)
        if match:
            amount = float(match.group(1).replace(',', ''))
            if '万' in text:
                amount *= 10000
            entities['amount'] = amount
        
        # 汇率
        match = re.search(r'汇率[:：]?\s*([\d.]+)', text)
        if match:
            entities['exchange_rate'] = float(match.group(1))
        
        # 业务类型
        for kw, btype in [('贴现', 'discount'), ('结算', 'settlement'), ('冲正', 'reversal')]:
            if kw in text:
                entities['business_type'] = btype
                break
        
        return entities


# ==================== 4. 意图识别 ====================
class IntentManager:
    @staticmethod
    def detect_intent(text: str, state: dict = None) -> tuple[Optional[str], bool, bool]:
        """
        规则与轻量级意图识别
        Returns: (intent, is_noise, is_nested)
        Intent enum: 'data', 'knowledge', 'chitchat', or None (uncertain)
        """
        t = text or ""
        
        # 1. 关键词定义
        # Knowledge triggers
        k_keywords = ['是什么', '定义', '解释', '区别', '如何', '怎么', '原理', '解释', '什么是', '什么是', '规程', '政策', '办法', '规定']
        # Data triggers
        data_nouns = ['账号', '科目', '金额', '余额', '交易', '传票', '核对', '总分', '数据', '明细', '不平', '走势', '趋势', '风险']
        data_verbs = ['看', '查', '获取', '拉', '列', '统计', '检索', '导出', '分析']
        data_questions = ['多少', '几', '有没有', '最新']
        tables = ['acct_bal_new2', 'vchr_hist', 'txn_hist', 'recon_bal', '表', '数据库', 'SQL']
        
        # Chitchat
        chitchat_kw = ['天气', '吃饭', '早上好', '下午好', '晚上好', '你好', '再见', '嗨']

        # 2. 逻辑判断
        has_noun = any(n in t for n in data_nouns)
        
        # 优先判断 Knowledge (特例：数据名词 + 定义提问 -> Knowledge)
        # 如 "余额是什么意思"
        if has_noun and any(qw in t for qw in ['是什么意思', '解释', '区别']):
            return 'knowledge', False, False
            
        # 强 Knowledge 信号
        if any(kw in t for kw in k_keywords):
            return 'knowledge', False, False

        # Data 规则
        has_verb = any(v in t for v in data_verbs)
        has_table = any(tb in t for tb in tables)
        # 疑问句触发: "最新余额", "有没有交易"
        has_qn_trigger = any(q in t for q in data_questions) and has_noun
        
        # 多轮上下文继承
        is_context_data = False
        if state:
            intent_hist = state.get('intent_history', [])
            # 上一轮是 data 且当前有维度记忆
            if intent_hist and intent_hist[-1] == 'data':
                has_dim = bool(state.get('account_number') or state.get('subject_code') or state.get('transaction_date'))
                if has_dim:
                    is_context_data = True

        # Data 判定
        # 显式：动词+(名词or维度) OR 表名 OR 疑问触发 OR (继承上下文 AND 没出现明确Knowledge词)
        has_current_dim = False
        if state:
             has_current_dim = bool(state.get('account_number') or state.get('subject_code'))
             
        if (has_verb and (has_noun or has_current_dim)) or has_table or has_qn_trigger or is_context_data:
            return 'data', False, False

        # Chitchat 规则
        noise_score = sum(1 for kw in chitchat_kw if kw in t)
        if noise_score > 0 and not has_noun:
            return 'chitchat', True, False

        # 不确定，交给 LLM
        return None, False, False

    @staticmethod
    def requires_db_query(intent: str) -> bool:
        return intent == 'data'


class IntentClassifier:
    _instance = None
    _cache = {} # 极速缓存: 100 条

    def __init__(self):
        self.model_pool = ModelPool.get_instance()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def classify(self, text: str, state: dict = None, model_name: Optional[str] = None) -> str:
        """
        LLM 意图分类 (优化版: 缓存优先 + 失败继承)
        """
        # 1. 缓存检索
        if text in self._cache:
            return self._cache[text]

        # 2. 构造压缩版 Prompt
        prompt = f"分类意图：data(查询余额/明细/报表)、knowledge(咨询政策/定义)、chitchat(闲聊)。输入:\"{text}\"。仅输出 JSON: {{\"intent\":\"...\"}}"
        
        messages = [{"role": "user", "content": prompt}]
        target_model = model_name or self.model_pool.table_query_model

        # 3. 调用 (无重试)
        try:
            resp = self.model_pool.completion(messages, temperature=0, model_name=target_model)
            match = re.search(r'\{.*\}', resp, re.DOTALL)
            if match:
                intent = json.loads(match.group(0)).get("intent")
                if intent in ['data', 'knowledge', 'chitchat']:
                    # 更新缓存
                    if len(self._cache) > 100: self._cache.clear()
                    self._cache[text] = intent
                    return intent
        except Exception:
            pass

        # 4. 失败降级: 优先继承上下文
        if state and state.get('intent_history'):
            return state['intent_history'][-1]
                
        return "chitchat"


# ==================== 5. 上下文管理(优化版) ====================
class ContextManager:
    @staticmethod
    def build_context_prompt(state: AccountingState) -> str:
        """快速构建上下文 - 只保留核心信息"""
        
        # 核心维度
        dims = []
        if state.get('account_number'):
            dims.append(f"账号:{state['account_number']}")
        if state.get('subject_code'):
            dims.append(f"科目:{state['subject_code']}")
        if state.get('transaction_date'):
            dims.append(f"日期:{state['transaction_date']}")
        if state.get('amount'):
            dims.append(f"金额:{state['amount']}")
        
        # 最近3轮对话
        recent = state['messages'][-6:]
        history = "\n".join([f"{m.type}:{m.content[:80]}" for m in recent])
        
        return f"""你是银行账务助手。第{state.get('conversation_round', 0)}轮。

【已知】{', '.join(dims) if dims else '无'}

【历史】
{history}

【数据库】
- acct_bal_new2: 分户余额(按账号)
- vchr_hist: 传票历史(流水)
- txn_hist: 交易历史
- recon_bal: 总分核对(按机构)

仅在明确请求查询表数据时才执行数据库查询；否则按知识库解释金融会计相关问题。
简洁专业地回答；涉及查询需明确指出表名与维度；当数据结果包含多列时，必须在 Markdown 表格中展示所有查询到的字段和对应值，严禁隐藏或省略任何列信息。

1. 优先判断用户问题中的术语类型：
   - 是否为标准会计术语
   - 是否为业务系统概念（如数据库表、字段、报表名称）
   - 是否为用户自定义或非标准说法

2. 如果该术语在标准会计中不存在：
   - 不要强行从已有知识中拼接解释
   - 明确说明：该术语不是标准会计概念
   - 给出最可能的实际含义（如“通常指XX系统中的XX表”）

3. 如果Context中没有相关定义：
   - 可以结合常识进行合理解释
   - 但必须明确区分：
     「标准定义」 vs 「推测解释」

4. 禁止以下行为：
   - 将无关概念拼接成解释（如把现金流量表当答案）
   - 为了符合Context而强行解释
   - 输出空洞的分点总结

5. 优先给出：
   - 一句话本质定义
   - 使用场景
   - 数据结构（如果是表）

回答要直接、具体，不要废话。
【重要原则 - 严禁编造】
1. 每一笔数据都必须来源于上下文中的【数据库查询结果】。
2. 如果查询结果为空，必须明确告知用户“未找到相关数据”，严禁为了回答而编造任何数值、日期或流水号！
3. 如果数据不全，就说不全，不要猜测。"""
    
    @staticmethod
    def update_memory(state: AccountingState, entities: dict):
        if 'dimension_memory' not in state:
            state['dimension_memory'] = {}
        for k, v in entities.items():
            if v:
                state['dimension_memory'][k] = v


# ==================== 6. 核心节点 ====================
def extract_info_node(state: AccountingState) -> AccountingState:
    """信息提取 - 优化版"""
    last_message = state['messages'][-1]
    
    if isinstance(last_message, HumanMessage):
        start_time = time.time()
        
        # 快速提取
        entities = EntityExtractor.extract_entities(last_message.content)
        extraction_success = False
        
        for key, value in entities.items():
            if value and not state.get(key):
                state[key] = value
                extraction_success = True
        
        ContextManager.update_memory(state, entities)
        
        intent, is_noise, is_nested = IntentManager.detect_intent(last_message.content, state)
        
        # 如果规则不确定(None)，则根据 LLM 分类
        if intent is None:
            classifier = IntentClassifier.get_instance()
            
            # Decide model
            model_pool = ModelPool.get_instance()
            clf_model = None
            if state.get('model_selection') == 'fine_tuned':
                clf_model = model_pool.fine_tuned_model
                
            intent = classifier.classify(last_message.content, model_name=clf_model)
            is_noise = (intent == 'chitchat')

        if 'intent_history' not in state:
            state['intent_history'] = []
        state['intent_history'].append(intent)
        
        # 映射到现有系统状态
        if intent == 'data':
            state['knowledge_domain'] = 'finance'
            state['should_query'] = True
        elif intent == 'knowledge':
            state['knowledge_domain'] = 'policy'
            state['should_query'] = False
        else: # chitchat
            state['knowledge_domain'] = 'general'
            state['should_query'] = False
            
        print(f"\n🧭 [识别结果] 意图: {intent} | 类别: {'政策(Knowledge)' if intent=='knowledge' else ('业务(Data)' if intent=='data' else '闲聊')}", flush=True)
        print(f"🔎 [查询路由] 是否执行数据库查询: {'是' if state['should_query'] else '否'} | 当前状态: {state}", flush=True)
        
        # 连贯性
        is_coherent = True
        if len(state['intent_history']) >= 2:
            prev = state['intent_history'][-2]
            is_coherent = (intent in ['query', 'definition'] and prev in ['query', 'definition'])
        
        state['is_noise'] = is_noise
        state['conversation_round'] = state.get('conversation_round', 0) + 1
        state['current_round_start_time'] = start_time
        
        # 更新指标
        if 'performance_metrics' not in state:
            state['performance_metrics'] = asdict(PerformanceMetrics())
        if 'context_memory_metrics' not in state:
            state['context_memory_metrics'] = asdict(ContextMemoryMetrics())
        
        ctx_metrics = ContextMemoryMetrics(**state['context_memory_metrics'])
        ctx_metrics.update_intent_coherence(is_coherent)
        if is_nested:
            ctx_metrics.update_nested_intent(True)
        if extraction_success:
            ctx_metrics.update_dimension_extraction(True)
        state['context_memory_metrics'] = asdict(ctx_metrics)
        
        perf_metrics = PerformanceMetrics(**state['performance_metrics'])
        perf_metrics.update_noise_metrics(is_noise, False)
        state['performance_metrics'] = asdict(perf_metrics)

    # print(state, flush=True)
    
    return state


def filter_noise_node(state: AccountingState) -> str:
    print(state)
    print(f"\n🔍 [噪声过滤调试] is_noise: {state.get('is_noise', False)}, should_query: {state.get('should_query', False)}", flush=True)
    if state.get('is_noise', False):
        return "handle_noise"
    if state.get('should_query', False):
        return "process_business"
    return "policy_qa"


def handle_noise_node(state: AccountingState) -> AccountingState:
    response = AIMessage(content="你好！我是苏州银行的AI助手，很高兴为您服务。请问有什么关于账务查询或政策法规的问题我可以帮您？")
    state['messages'].append(response)
    print("\n\n💬 [回答]", flush=True)
    print(response.content, flush=True)
    
    # 服务器回调
    handler = stream_context.get_stream_handler()
    if handler:
        handler({'type': 'content', 'content': response.content})
    
    if state.get('current_round_start_time'):
        elapsed = (time.time() - state['current_round_start_time']) * 1000
        perf = PerformanceMetrics(**state['performance_metrics'])
        perf.update_response_time(elapsed)
        perf.update_accuracy(True)
        state['performance_metrics'] = asdict(perf)
    
    return state


# ==================== 6a. 增强型 Text-to-SQL (New) ====================

INTENT_ENUM = {
    "query_latest_records",     # 最近记录
    "query_by_date",            # 指定日期明细
    "aggregate_metrics",        # 汇总类
    "query_balance",            # 余额类
    "trend_analysis"            # 趋势分析
}

TABLE_FIELDS = {}
for k, v in SCHEMA_MAP.items():
    # Allow looking up by full name
    TABLE_FIELDS[k] = list(v)
    # Allow looking up by short name (suffix) for compatibility
    short_name = k.split(".")[-1]
    TABLE_FIELDS[short_name] = list(v)

INTENT_TABLE_MAP = {
    "query_balance": ["acct_bal_new2", "recon_bal"],
    "query_latest_records": ["txn_hist", "vchr_hist", "recon_bal"],
    "query_by_date": ["txn_hist", "vchr_hist", "recon_bal"],
    "aggregate_metrics": ["txn_hist"],
    "trend_analysis": ["acct_bal_new2"]
}

def validate_intent(intent: dict) -> dict:
    # 1. 应用增强校验与自动重写
    intent = validate_and_rewrite_intent(intent)

    if intent["intent"] not in INTENT_ENUM:
        raise ValueError(f"非法 intent: {intent.get('intent')}")
    
    # 2. 这里的 table 已经是 full name (e.g. sz_bank_b1.acct_bal_new2)
    # schema check 已经在 validate_and_rewrite_intent 中完成
    
    # Additional logic if needed...
    
    return intent

def build_sql_from_intent(intent: dict) -> tuple[str, list]:
    # Ensure table is qualified correctly
    table = qualify_table(intent["table"])
    
    # 兼容 filters 和 conditions 字段
    filters = intent.get("filters") or intent.get("conditions") or {}
    
    where_clauses = []
    params = []
    
    # 过滤条件映射
    if filters.get("acct_num"):
        where_clauses.append("acct_num = %s")
        params.append(filters["acct_num"])
    if filters.get("org_num"):
        where_clauses.append("org_num = %s")
        params.append(filters["org_num"])
    # acg_dt 处理 (YYYYMMDD or YYYY-MM-DD -> ensure match DB format if needed, assuming string match)
    if filters.get("acg_dt"):
        where_clauses.append("acg_dt = %s")
        params.append(filters["acg_dt"])
    if filters.get("sbj_num"):
        # Handle leading zeros: try both with and without leading '0'
        # Database often stores '1031501' but user says '01031501'
        raw_val = str(filters["sbj_num"]).strip()
        clean_val = raw_val.lstrip('0')
        # Variations: original, cleaned, and padded (common bank logic: either no zero or 1 zero)
        # We use a set to avoid duplicates
        vals = {raw_val, clean_val}
        if clean_val:  # Avoid empty string if input was just '0'
             vals.add('0' + clean_val)
        
        # Convert back to list for SQL params
        val_list = list(vals)
        
        # Build IN clause
        placeholders = ', '.join(['%s'] * len(val_list))
        where_clauses.append(f"sbj_num IN ({placeholders})")
        params.extend(val_list)
        
    where_str = " AND ".join(where_clauses) if where_clauses else "1=1"
    
    # Determine short name for field lookup
    short_table = table.split('.')[-1] if '.' in table else table
    
    # 1. 聚合逻辑
    if intent["intent"] == "aggregate_metrics":
        metrics_parts = []
        for m in intent.get("metrics", []):
            field = m["field"]
            if field == "*":
                metrics_parts.append(f"{m['type'].upper()}(*)")
            elif field in TABLE_FIELDS[short_table]:
                metrics_parts.append(f"{m['type'].upper()}({field})")
            else:
                # Fallback or error? ignore invalid field
                pass
        
        metrics_sql = ", ".join(metrics_parts) if metrics_parts else "COUNT(*)"
        
        # Group By
        group_by = intent.get("group_by", [])
        # Sanitize group_by
        safe_group_by = [g for g in group_by if g in TABLE_FIELDS[short_table] or g == "ccy"] 
        
        group_sql = ""
        extras = ["ccy"] if "ccy" in safe_group_by else [] # auto add ccy to select if grouping by it
        
        if safe_group_by:
            group_sql = "GROUP BY " + ", ".join(safe_group_by)
            # Ensure grouped columns are in SELECT if appropriate
            for g in safe_group_by:
                if g not in extras:
                     extras.append(g)
        
        select_cols = ", ".join(extras + [metrics_sql])
        
        # Determine strict table name usage (without redundant prefix if fully qualified)
        sql = f"SELECT {select_cols} FROM {table} WHERE {where_str} {group_sql}"
        return sql, params

    # 3. 趋势分析逻辑 (New)
    elif intent["intent"] == "trend_analysis":
        # 强制仅查询 acct_bal_new2 (sz_bank_b1)
        table = "sz_bank_b1.acct_bal_new2"
        where_clauses = [] # Rebuild where clauses to be safe? 
        # Actually, the filters might have been built based on the original table if LLM hallucinated. 
        # But parameters are built from filters.
        # We need to re-verify filters are valid for acct_bal_new2? 
        # acct_num, org_num, acg_dt, sbj_num are all valid in acct_bal_new2.
        # So we can reuse the where_str generated above, as long as we ensure table is correct.
        
        # 强制字段选择
        # acct_num, sbj_num, org_num, acg_dt, ccy, sbact_acct_bal, gnl_ldgr_bal
        select_cols = "acct_num, sbj_num, org_num, acg_dt, ccy, sbact_acct_bal, gnl_ldgr_bal"
        
        # 排序与限制
        order_sql = "ORDER BY acg_dt ASC"
        limit = intent.get("limit") or 30
        
        inner_sql = f"SELECT {select_cols} FROM {table} WHERE {where_str} ORDER BY acg_dt DESC LIMIT {limit}"
        sql = f"SELECT * FROM ({inner_sql}) as sub ORDER BY acg_dt ASC"
        
        return sql, params

    # 4. 明细/余额逻辑 (Fallback)
    else:
        # Default Order By
        order_info = intent.get("order_by")
        order_sql = ""
        if order_info and order_info.get("field") in TABLE_FIELDS[short_table]:
            direction = order_info.get("direction", "DESC")
            order_sql = f"ORDER BY {order_info['field']} {direction}"
        elif "acg_dt" in TABLE_FIELDS[short_table]:
            order_sql = "ORDER BY acg_dt DESC"
        elif "dt_date" in TABLE_FIELDS[short_table]: # recon_bal uses dt_date
            order_sql = "ORDER BY dt_date DESC"
            
        limit = intent.get("limit") or 10
        if isinstance(limit, int):
            limit_sql = f"LIMIT {limit}"
        else:
            limit_sql = "LIMIT 10"
            
        sql = f"SELECT * FROM {table} WHERE {where_str} {order_sql} {limit_sql}"
        return sql, params


def db_query_node(state: AccountingState) -> AccountingState:
    """专门的数据库查询节点"""
    db_manager = DatabaseManager.get_instance()
    
    # 根据状态中的维度信息构建查询（使用实际建表字段名）
    # Ensure tables are qualified
    tbl_bal = qualify_table('acct_bal_new2')
    tbl_vchr = qualify_table('vchr_hist')
    tbl_recon = qualify_table('recon_bal')
    
    queries = {
        'account_balance': f"""
            SELECT * 
            FROM {tbl_bal} 
            WHERE acct_num = %s
        """,
        'transaction_history': f"""
            SELECT *
            FROM {tbl_vchr} 
            WHERE acct_num = %s AND acg_dt = %s
        """,
        'subject_balance': f"""
            SELECT *
            FROM {tbl_recon}
            WHERE sbj_num = %s
        """
    }
    
    results = {}
    
    # 执行相关查询
    if state.get('account_number'):
        results['account_balance'] = db_manager.execute_query(
            queries['account_balance'], 
            (state['account_number'],)
        )
    
    if state.get('account_number') and state.get('transaction_date'):
        results['transaction_history'] = db_manager.execute_query(
            queries['transaction_history'],
            (state['account_number'], state['transaction_date'])
        )
    
    if state.get('subject_code'):
        results['subject_balance'] = db_manager.execute_query(
            queries['subject_balance'],
            (state['subject_code'],)
        )
    


    # 将查询结果存储到状态中
    state['database_results'] = results
    
    return state


def business_chat_node_streaming(state: AccountingState) -> AccountingState:
    """真正的流式输出节点 - 展示思考过程 + 数据库查询"""
    
    reasoning_start = time.time()
    first_token_time = None
    
    try:
        # 获取模型池和数据库管理器
        model_pool = ModelPool.get_instance()
        db_manager = DatabaseManager.get_instance()
        
        context_prompt = ContextManager.build_context_prompt(state)
        user_message = state['messages'][-1].content
        db_result = None
        pending_chart_json = None
        
        if state.get('function_mode') == 'shuzhi':
             print("🚀 [Shuzhi Mode] Force enabling database query for trend analysis.", flush=True)
             state['should_query'] = True

        # ==================== Text-to-SQL 增强逻辑 ====================
        if state.get('should_query'):
            print(f"\n🧠 [Text-to-SQL] 启动意图解析...", flush=True)
            
            # 1. 构造压缩版 Prompt (由 SCHEMA_MAP 兜底校验，此处不重复列出)
            parser_system_prompt = """你是个意图解析器。仅输出 JSON:
{
  "intent": "query_balance|trend_analysis|query_latest_records|query_by_date|aggregate_metrics",
  "table": "acct_bal_new2|vchr_hist|txn_hist|recon_bal",
  "filters": {"acct_num":"账号", "sbj_num":"科目", "acg_dt":"日期", "org_num":"机构"}
}
规则：
1. 关键词映射：账号->acct_num, 科目->sbj_num, 余额->sbact_acct_bal, 日期->acg_dt。
2. trend_analysis 仅用于分析趋势/走势/图表，且必须查 acct_bal_new2。
3. 如果意图不明确，默认 query_latest_records。"""
            # SHUZHI MODE OVERRIDE
            if state.get('function_mode') == 'shuzhi':
                parser_system_prompt += """
【数智模式 - 强制规则】
用户当前处于“数智”模式，该模式的核心目标是生成趋势图表。
只要用户的输入包含“账号”、“余额”、“走势”、“趋势”、“分析”或隐含查询账户信息的意图：
1. 必须识别为 `trend_analysis`。
2. 即使没有明确说“趋势”，也要优先通过 trend_analysis 展示数据。
"""
            # 准备上下文数据
            org_num = state.get('dimension_memory', {}).get('org_num')
            
            parser_user_prompt = f"""
用户输入：
{user_message}

已知上下文信息：
- account_number: {state.get('account_number')}
- transaction_date: {state.get('transaction_date')}
- subject_code: {state.get('subject_code')}
- org_num: {org_num}
"""
            
            parser_messages = [
                {"role": "system", "content": parser_system_prompt},
                {"role": "user", "content": parser_user_prompt}
            ]
            
            # 2. 调用模型解析意图 (使用较快的模型或推理模型，这里复用 table_query_model)
            try:
                # Decide model for parsing
                parsing_model = model_pool.table_query_model
                if state.get('model_selection') == 'fine_tuned':
                    parsing_model = model_pool.fine_tuned_model

                # 尝试解析
                intent_json_str = model_pool.completion(
                    parser_messages, 
                    temperature=0, 
                    model_name=parsing_model 
                )
                
                # 清洗 Markdown 标记
                intent_json_str = intent_json_str.replace("```json", "").replace("```", "").strip()
                # Clean <think> tags if present
                intent_json_str = re.sub(r'<think>.*?</think>', '', intent_json_str, flags=re.DOTALL).strip()
                print(f"📄 [解析结果] {intent_json_str}")
                
                intent_data = json.loads(intent_json_str)
                
                # 3. 校验与SQL生成
                # [Gating] Pre-SQL check: If mode is not 'shuzhi', forbid 'trend_analysis' to save SQL resources
                if intent_data.get("intent") == "trend_analysis" and state.get('function_mode') != 'shuzhi':
                    print("🚫 [Intent Gating] Blocked 'trend_analysis'. User needs 'shuzhi' mode.")
                    # 1. 阻止执行昂贵的趋势 SQL
                    intent_data["intent"] = "query_latest_records" # Fallback for lightweight context
                    
                    # 2. 注入提示到 system prompt，让 AI 明确告知用户
                    context_prompt += "\n\n【系统警告】：用户试图请求趋势分析，但未开启“数智模式”。请在回答中明确告知用户：“如需生成专业的趋势分析图表，请点击输入框上方的【数智】按钮切换模式。”，并仅提供当前查询到的简要数据。\n"

                
                intent_data = validate_intent(intent_data)
                sql, params = build_sql_from_intent(intent_data)
                
                if sql:
                    # 4. 执行查询
                    db_result = db_manager.execute_query(sql, tuple(params))
                
            except Exception as e:
                print(f"⚠️ [Text-to-SQL 失败] 原因: {e}")
                # 降级逻辑或保持 db_result 为 None
        
        # ==================== End Text-to-SQL ====================

        # 如果有数据库结果，添加到上下文中
        if db_result is not None:
            # 如果是趋势分析，注入特殊的 JSON 指令给前端
            # NOTE: intent_data is defined in the try block above. Since db_result is not None, intent_data must be available.
            is_trend = False
            try:
                if 'intent_data' in locals() and intent_data.get("intent") == "trend_analysis":
                    is_trend = True
            except:
                pass

            if is_trend and state.get('function_mode') != 'shuzhi':
                is_trend = False
                print("🚫 [Trend Gating] Blocked trend generation because mode is not 'shuzhi'. Falling back to text.")

            if is_trend:
                # 计算 diff 并保留关键列
                chart_data = []
                for row in db_result:
                    try:
                        bal = float(row.get('sbact_acct_bal', 0))
                        gnl = float(row.get('gnl_ldgr_bal', 0))
                        diff = bal - gnl
                        
                        item = {
                            "acct_num": row.get('acct_num'),
                            "sbj_num": row.get('sbj_num'),
                            "org_num": row.get('org_num'),
                            "acg_dt": str(row.get('acg_dt')), # Ensure string
                            "ccy": row.get('ccy'),
                            "sbact_acct_bal": bal,
                            "gnl_ldgr_bal": gnl,
                            "diff": diff
                        }
                        chart_data.append(item)
                    except:
                        continue
                
                # 构造 JSON 响应块
                chart_json = {
                    "type": "trend_chart",
                    "title": "分户账与总账余额趋势分析",
                    "data": chart_data
                }
                
                # IMPORTANT: store for appending later
                pending_chart_json = chart_json
                
                context_prompt += f"""
【数智趋势分析数据】
(图表数据已由系统自动生成并将在回答后附加)

【数据库查询结果摘要】：
包含 {len(chart_data)} 条记录，时间跨度从 {chart_data[0]['acg_dt'] if chart_data else 'N/A'} 到 {chart_data[-1]['acg_dt'] if chart_data else 'N/A'}。

请根据上述数据，简要分析 'diff' (分户账-总账) 的走势，如果存在非零差额，请给出风险预警。
"""
            else:
                context_prompt += "\n\n【数据库查询结果】：\n" + json.dumps(db_result, ensure_ascii=False, default=str)
        elif state.get('should_query'):
            context_prompt += "\n\n【警告】：数据库查询未返回任何结果 (Result is None or Empty)。\n请务必告知用户：系统中未查询到相关数据。\n严禁编造任何数据！！"

        messages = [
            {"role": "system", "content": context_prompt},
            {"role": "user", "content": user_message}
        ]
        
        print("\n💭 [思考过程]", flush=True)
        
        full_reasoning = ""
        full_content = ""
        
        model_to_use = model_pool.knowledge_base_model 
        if state.get('model_selection') == 'fine_tuned':
            model_to_use = model_pool.fine_tuned_model
            
        print(f"🔍 [模型选择调试] should_query: {state.get('should_query')}, 使用模型: {model_to_use}", flush=True)

        for chunk in model_pool.stream_completion(messages, model_name=model_to_use):
            # 记录首Token
            if first_token_time is None:
                first_token_time = (time.time() - reasoning_start) * 1000
            
            # 服务器回调
            import stream_context
            handler = stream_context.get_stream_handler()
            if handler:
                handler(chunk)

            if chunk['type'] == 'reasoning':
                # 实时输出思考过程
                print(chunk['content'], end='', flush=True)
                full_reasoning = chunk['full_reasoning']

            elif chunk['type'] == 'content':
                # 切换到回答输出
                if not full_content:  # 第一次输出内容时换行
                    print("\n\n💬 [回答]", flush=True)
                print(chunk['content'], end='', flush=True)
                full_content = chunk['full_content']
                
        # ==================== Manually Append Chart JSON ====================
        # ==================== Manually Append Chart JSON ====================
        if pending_chart_json:
            # 1. Send to stream as structured data (Preferred for UI)
            import stream_context
            handler = stream_context.get_stream_handler()
            if handler:
                handler({"type": "trend_chart", "data": pending_chart_json})
                
            # 2. Log but DO NOT append fallback block (Data is now captured by server.py in structured field)
            print(f"📊 [Trend Chart] Sent structured data only. No fallback block appended.")
            
         # ====================================================================
         # ====================================================================
        
        print()  # 换行
        
        # 保存完整响应
        state['messages'].append(AIMessage(content=full_content))
        
        # 更新指标
        perf = PerformanceMetrics(**state['performance_metrics'])
        perf.update_accuracy(True)
        
        if first_token_time:
            perf.update_first_token_latency(first_token_time)
        
        reasoning_time = (time.time() - reasoning_start) * 1000
        perf.update_reasoning_time(reasoning_time)
        
        if state.get('current_round_start_time'):
            total_time = (time.time() - state['current_round_start_time']) * 1000
            perf.update_response_time(total_time)
        
        state['performance_metrics'] = asdict(perf)
        
    except Exception as e:
        print("\n❌ 错误: " + str(e))
        state['messages'].append(AIMessage(content=f"处理出错: {str(e)}"))
        
        perf = PerformanceMetrics(**state['performance_metrics'])
        perf.update_accuracy(False)
        state['performance_metrics'] = asdict(perf)
    
    return state
    """真正的流式输出节点 - 展示思考过程 + 数据库查询"""
    
    reasoning_start = time.time()
    first_token_time = None
    
    try:
        # 获取模型池和数据库管理器
        model_pool = ModelPool.get_instance()
        db_manager = DatabaseManager.get_instance()
        
        # 构建上下文
        context_prompt = ContextManager.build_context_prompt(state)
        
        # 如果有具体的查询意图，执行数据库查询
        user_message = state['messages'][-1].content
        db_result = None
        
        # 智能选表逻辑
        selected_table = None
        
        # 规则1: 账号+传票 → vchr_hist
        if state.get('account_number') and '传票' in user_message:
            selected_table = 'vchr_hist'
        # 规则2: 账号+交易/金额合计 → txn_hist
        elif state.get('account_number') and ('交易' in user_message or '金额合计' in user_message):
            selected_table = 'txn_hist'
        # 规则3: 账号+余额 → acct_bal_new2
        elif state.get('account_number') and '余额' in user_message:
            selected_table = 'acct_bal_new2'
        # 规则4: 科目号（无账号）→ vchr_hist
        elif state.get('subject_code') and not state.get('account_number'):
            selected_table = 'vchr_hist'
        # 规则5: 机构号（无账号）→ recon_bal
        elif '机构' in user_message and not state.get('account_number'):
            selected_table = 'recon_bal'
        # 默认: 有账号用 vchr_hist
        elif state.get('account_number'):
            selected_table = 'vchr_hist'
        
        # print(f"\n🎯 [智能选表] 选择表: {selected_table}")
        
        # 根据选择的表执行查询（使用实际建表字段名）
        if selected_table == 'acct_bal_new2' and state.get('account_number'):
            tbl = qualify_table('acct_bal_new2')
            query = f"""
            SELECT *
            FROM {tbl} 
            WHERE acct_num = %s
            ORDER BY acg_dt DESC
            LIMIT 10
            """
            db_result = db_manager.execute_query(query, (state['account_number'],))
            
        elif selected_table == 'txn_hist' and state.get('account_number'):
            tbl = qualify_table('txn_hist')
            if state.get('transaction_date'):
                # 查询特定日期的交易金额合计
                query = f"""
                SELECT SUM(txn_amt) as total_amount, COUNT(*) as txn_count, ccy
                FROM {tbl} 
                WHERE acct_num = %s AND acg_dt = %s
                GROUP BY ccy
                """
                db_result = db_manager.execute_query(
                    query,
                    (state['account_number'], state['transaction_date'])
                )
            else:
                # 查询最近的交易记录
                query = f"""
                SELECT *
                FROM {tbl} 
                WHERE acct_num = %s
                ORDER BY acg_dt DESC
                LIMIT 10
                """
                db_result = db_manager.execute_query(query, (state['account_number'],))
        
        elif selected_table == 'vchr_hist' and state.get('account_number'):
            tbl = qualify_table('vchr_hist')
            if state.get('transaction_date'):
                # 查询特定日期的传票
                query = f"""
                SELECT *
                FROM {tbl} 
                WHERE acct_num = %s AND acg_dt = %s
                ORDER BY txn_dt DESC
                LIMIT 10
                """
                db_result = db_manager.execute_query(
                    query, 
                    (state['account_number'], state['transaction_date'])
                )
            else:
                # 查询最近的传票
                query = f"""
                SELECT *
                FROM {tbl} 
                WHERE acct_num = %s
                ORDER BY acg_dt DESC
                LIMIT 10
                """
                db_result = db_manager.execute_query(query, (state['account_number'],))
        
        elif selected_table == 'recon_bal' and '机构' in user_message:
            tbl = qualify_table('recon_bal')
            # 从dimension_memory中提取机构号
            org_num = state.get('dimension_memory', {}).get('org_num')
            if org_num:
                query = f"""
                SELECT *
                FROM {tbl}
                WHERE org_num = %s
                ORDER BY dt_date DESC
                LIMIT 10
                """
                db_result = db_manager.execute_query(query, (org_num,))
        
        # 如果有数据库结果，添加到上下文中
        if db_result is not None:
            context_prompt += "\n\n【数据库查询结果】：\n" + json.dumps(db_result, ensure_ascii=False, default=str)
        
        messages = [
            {"role": "system", "content": context_prompt},
            {"role": "user", "content": user_message}
        ]
        
        print("\n💭 [思考过程]", flush=True)
        
        full_reasoning = ""
        full_content = ""
        
        
        model_to_use = model_pool.knowledge_base_model # Always use reasoner to show reasoning process
        print(f"🔍 [模型选择调试] should_query: {state.get('should_query')}, 使用模型: {model_to_use}", flush=True)

        for chunk in model_pool.stream_completion(messages, model_name=model_to_use):
            # 记录首Token
            if first_token_time is None:
                first_token_time = (time.time() - reasoning_start) * 1000
            
            # 服务器回调
            import stream_context
            handler = stream_context.get_stream_handler()
            if handler:
                handler(chunk)

            if not state.get('should_query') and chunk['type'] == 'reasoning':
                # 实时输出思考过程
                print(chunk['content'], end='', flush=True)
                full_reasoning = chunk['full_reasoning']
            
            elif chunk['type'] == 'content':
                # 切换到回答输出
                if not full_content:  # 第一次输出内容时换行
                    print("\n\n💬 [回答]", flush=True)
                print(chunk['content'], end='', flush=True)
                full_content = chunk['full_content']
        
        print()  # 换行
        
        # 保存完整响应(只保存最终回答)
        state['messages'].append(AIMessage(content=full_content))
        
        # 更新指标
        perf = PerformanceMetrics(**state['performance_metrics'])
        perf.update_accuracy(True)
        
        if first_token_time:
            perf.update_first_token_latency(first_token_time)
        
        reasoning_time = (time.time() - reasoning_start) * 1000
        perf.update_reasoning_time(reasoning_time)
        
        if state.get('current_round_start_time'):
            total_time = (time.time() - state['current_round_start_time']) * 1000
            perf.update_response_time(total_time)
        
        state['performance_metrics'] = asdict(perf)
        
    except Exception as e:
        print("\n❌ 错误: " + str(e))
        state['messages'].append(AIMessage(content=f"处理出错: {str(e)}"))
        
        perf = PerformanceMetrics(**state['performance_metrics'])
        perf.update_accuracy(False)
        state['performance_metrics'] = asdict(perf)
    
    return state


class PolicyKnowledgeBase:
    _instance = None
    def __init__(self):
        self.chunks: List[Dict] = []
        self.loaded = False
        self.faiss_index = None
        self.emb_dim = None
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    def load(self, chunks_path = None, faiss_path = None):
        # Default paths relative to backend directory
        backend_dir = Path(__file__).resolve().parent
        default_chunks = [
            str(backend_dir / "knowledge/kb-cut/chunks1214.json"),
            str(backend_dir / "knowledge/kb-cut/chunks_1214_book.json"),
            str(backend_dir / "knowledge/kb-cut/chunks_1214_kjzz.json"),
            str(backend_dir / "knowledge/kb-cut/chunks_1214_yhkj.json")
        ]
        default_faiss = [
            str(backend_dir / "knowledge/kb-cut/faiss1214.bin"),
            str(backend_dir / "knowledge/kb-cut/faiss_1214_book.bin"),
            str(backend_dir / "knowledge/kb-cut/faiss_1214_kjzz.bin"),
            str(backend_dir / "knowledge/kb-cut/faiss_1214_yhkj.bin")
        ]
        
        c_paths = chunks_path if chunks_path else default_chunks
        f_paths = faiss_path if faiss_path else default_faiss
        
        if not self.loaded:
            files = c_paths if isinstance(c_paths, (list, tuple)) else [c_paths]
            all_chunks = []
            for p in files:
                try:
                    if os.path.exists(p):
                        print(f"Loading chunks from: {p}")
                        with open(p, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            if isinstance(data, list):
                                all_chunks.extend(data)
                    else:
                        print(f"Warning: Chunk file not found: {p}")
                except Exception as e:
                    print(f"Error loading chunks {p}: {e}")
            self.chunks = all_chunks
            try:
                import faiss, numpy as np
                idxs = []
                fps = f_paths if isinstance(f_paths, (list, tuple)) else [f_paths]
                for fp in fps:
                    try:
                        if isinstance(fp, str) and os.path.exists(fp):
                            print(f"Loading index from: {fp}")
                            idxs.append(faiss.read_index(fp))
                        else:
                            print(f"Warning: Index file not found: {fp}")
                    except Exception:
                        pass
                if idxs:
                    try:
                        D = idxs[0].d
                        # Enable successive_ids=True so indices map to the concatenated chunks list correctly
                        sh = faiss.IndexShards(D, True, True)
                        for ix in idxs:
                            sh.add_shard(ix)
                        self.faiss_index = sh
                        self.emb_dim = D
                        self.loaded = True
                        return
                    except Exception:
                        pass
                # ... Fallback logic remains ...
                D = 1024
                vecs = []
                for ch in self.chunks:
                    ts = ch.get('title', '')
                    xs = ch.get('text', '')
                    # Read topic from top-level or metadata
                    topic = ch.get('topic') or ch.get('metadata', {}).get('topic', '')
                    
                    # Incorporate topic into the text for embedding
                    s = f"{topic} {ts} {xs}"
                    tokens = re.findall(r"\w+", s.lower())
                    v = np.zeros(D, dtype='float32')
                    for t in tokens:
                        v[hash(t) % D] += 1.0
                    n = np.linalg.norm(v)
                    if n > 0:
                        v /= n
                    vecs.append(v)
                if vecs:
                    mat = np.stack(vecs)
                    idx = faiss.IndexFlatIP(D)
                    idx.add(mat)
                    self.faiss_index = idx
                    self.emb_dim = D
            except Exception as e:
                print(f"Error initializing FAISS: {e}")
                self.faiss_index = None
            self.loaded = True

    def search(self, query: str, top_k: int = 5) -> List[Dict]:
        if not self.loaded:
            self.load() # Use defaults defined in load()
        
        # Helper to extract fields safely
        def get_fields(ch):
            meta = ch.get('metadata', {})
            # Top-level priority, fallback to metadata
            source = ch.get('source') or meta.get('source', '')
            folder = ch.get('folder') or meta.get('folder', '')
            topic = ch.get('topic') or meta.get('topic', '')
            text = ch.get('text', '')
            return source, folder, topic, text

        if self.faiss_index is not None and self.emb_dim:
            try:
                import numpy as np
                qstr = query if isinstance(query, str) else (json.dumps(query, ensure_ascii=False) if query is not None else "")
                toks = re.findall(r"\w+", qstr.lower())
                vq = np.zeros(self.emb_dim, dtype='float32')
                for t in toks:
                    vq[hash(t) % self.emb_dim] += 1.0
                n = np.linalg.norm(vq)
                if n > 0:
                    vq /= n
                D, K = self.emb_dim, max(1, min(top_k, len(self.chunks)))
                qmat = vq.reshape(1, D)
                sims, idxs = self.faiss_index.search(qmat, K)
                res = []
                for i in idxs[0]:
                    if i < 0 or i >= len(self.chunks):
                        continue
                    ch = self.chunks[i]
                    source, folder, topic, text = get_fields(ch)
                    
                    tstr = str(source)
                    topic_str = str(topic)
                    xstr = str(text)
                    
                    # Prepend topic to text for context
                    full_text = f"【主题: {topic_str}】\n{xstr}" if topic_str else xstr
                    
                    res.append({
                        "id": ch.get('id'),
                        "title": tstr,
                        "text": full_text[:1200], 
                        "metadata": {
                            "source": source,
                            "folder": folder,
                            "topic": topic
                        }
                    })
                return res
            except Exception:
                pass
        try:
            q = query if isinstance(query, str) else (json.dumps(query, ensure_ascii=False) if query is not None else "")
        except Exception:
            q = str(query) if query is not None else ""
        scores = []
        for ch in self.chunks:
            source, folder, topic, text = get_fields(ch)
            
            try:
                title_str = str(source)
            except Exception:
                title_str = ""
            try:
                topic_str = str(topic)
            except Exception:
                topic_str = ""
            try:
                text_str = str(text)
            except Exception:
                text_str = ""
                
            ts = title_str
            topic = topic_str
            xs = text_str
            
            # Include topic in fuzzy matching
            txt = (topic + "\n" + ts + "\n" + xs)[:1200]
            s = difflib.SequenceMatcher(None, q, txt).ratio()
            scores.append((s, ch))
        scores.sort(key=lambda x: x[0], reverse=True)
        res = []
        for _, ch in scores[:top_k]:
            source, folder, topic, text = get_fields(ch)
            
            tstr = str(source)
            topic_str = str(topic)
            xstr = str(text)
            
            full_text = f"【主题: {topic_str}】\n{xstr}" if topic_str else xstr

            res.append({
                "id": ch.get('id'),
                "title": tstr,
                "text": full_text[:1200],
                "metadata": {
                    "source": source,
                    "folder": folder,
                    "topic": topic
                }
            })
        return res


def policy_chat_node_streaming(state: AccountingState) -> AccountingState:
    reasoning_start = time.time()
    first_token_time = None 
    try:
        user_message = state['messages'][-1].content
        qa = get_cag_qa()
        
        if qa:
             # --- CAG Branch (New) ---
            import stream_context
            handler = stream_context.get_stream_handler()
            
            # 1) Check Cache
            hit = qa.get_cache_hit(user_message)
            
            if hit:
                # [CAG Hit] Replay cache
                print(f"🚀 [CAG Cache Hit]: {user_message}")
                cached_ans = hit.get("answer", "")
                cached_reason = hit.get("reasoning", "")
                cached_sources = hit.get("sources", [])
                
                # Replay Reasoning
                if cached_reason:
                    chunk_size = 50
                    for i in range(0, len(cached_reason), chunk_size):
                        sub = cached_reason[i:i+chunk_size]
                        if handler:
                            handler({'type': 'reasoning', 'content': sub, 'full_reasoning': cached_reason[:i+chunk_size]})
                        time.sleep(0.05)
                        print(sub, end='', flush=True)
                
                # Replay Content
                if handler:
                     # Break reasoning block
                    handler({'type': 'content', 'content': '', 'full_content': ''})
                
                chunk_size = 50
                for i in range(0, len(cached_ans), chunk_size):
                    sub = cached_ans[i:i+chunk_size]
                    if handler:
                        handler({'type': 'content', 'content': sub, 'full_content': cached_ans[:i+chunk_size]})
                    time.sleep(0.02)
                    print(sub, end='', flush=True)
                
                full_content = cached_ans
                full_reasoning = cached_reason
                used_sources = cached_sources
                
                first_token_time = 10 # Simulated
                
            else:
                # [CAG Miss] Search -> Stream LLM -> Cache
                print(f"🔍 [CAG Miss] Retrieving & Generating...")
                contexts = qa.retriever.search(user_message, top_k=6)
                
                # Collect sources at code level
                used_sources = sorted(set([str(c.get('source','')).strip() for c in contexts if c.get('source')]))
                kb_text_list = []
                for c in contexts:
                    cid = c.get('id')
                    txt = (c.get('text') or '').replace('\n', ' ')
                    # Prompt lacks source to prevent hallucination
                    kb_text_list.append(f"key: {cid}\ncontent: {txt}")
                kb_text = "\n".join(kb_text_list)
                
                system_prompt = (
                    "你是财会大师。\n\n"
                    "你必须遵守以下规则：\n"
                    "1. 只能基于我提供的 Context 回答，不要编造。\n"
                    "2. 【重要】只输出回答正文；严禁输出【引用来源】或任何文件名/来源列表（引用由系统自动追加）。\n\n"
                    "以下是相关资料片段(Context)：\n"
                    "3. 必须分点回答)：\n"
                    f"{kb_text}"
                )
                
                cag_messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ]
                
                model_pool = ModelPool.get_instance()
                print("\n💭 [思考过程]", flush=True)
                
                full_reasoning = ""
                full_content = ""
                
                for chunk in model_pool.stream_completion(cag_messages, model_name=model_pool.knowledge_base_model):
                    if first_token_time is None:
                        first_token_time = (time.time() - reasoning_start) * 1000
                    
                    if handler:
                        handler(chunk)
                    
                    if chunk['type'] == 'reasoning':
                        print(chunk['content'], end='', flush=True)
                        full_reasoning = chunk['full_reasoning']
                    elif chunk['type'] == 'content':
                        if not full_content:
                            print("\n\n💬 [回答]", flush=True)
                        print(chunk['content'], end='', flush=True)
                        full_content = chunk['full_content']
                print()
                
                # Write to Cache
                qa.save_to_cache(user_message, full_content, full_reasoning, used_sources, contexts)

            # === Common CAG Finalization ===
            # Enforce footer
            final_content = _ensure_citation_footer(full_content, used_sources)
            
            # Save to state
            state['messages'].append(AIMessage(content=final_content))
            
            # Send final update to frontend
            if handler:
                handler({'type': 'content', 'content': final_content, 'full_content': final_content})

                #handler({'type': 'citations', 'sources': used_sources})
# 或者（如果前端只认 content）
                handler({'type': 'content', 'content': "\n\n" + citation_block, 'full_content': full_content + "\n\n" + citation_block})



            # Update metrics
            perf = PerformanceMetrics(**state['performance_metrics'])
            perf.update_accuracy(True)
            if first_token_time:
                perf.update_first_token_latency(first_token_time)
            reasoning_time = (time.time() - reasoning_start) * 1000
            perf.update_reasoning_time(reasoning_time)
            if state.get('current_round_start_time'):
                total_time = (time.time() - state['current_round_start_time']) * 1000
                perf.update_response_time(total_time)
            state['performance_metrics'] = asdict(perf)
            
            return state # <--- STRICT RETURN FOR CAG BRANCH

        else:
            # --- Fallback (Legacy) Branch ---
            print("⚠️ CAG module not loaded, falling back to legacy logic...")
            model_pool = ModelPool.get_instance()
            kb = PolicyKnowledgeBase.get_instance()
            kb_results = kb.search(user_message, top_k=6)
            
            kb_text_list = []
            used_sources = [] 
            used_chunk_ids = [] 

            for i, r in enumerate(kb_results):
                chunk_key = r.get('id')
                meta = r.get('metadata', {}) or {}
                source = str(meta.get('source', '') or '').strip()
                text = (r.get('text', '') or '').replace('\n', ' ')

                kb_text_list.append(f"key: {chunk_key}\ncontent: {text}")

                if chunk_key is not None:
                    used_chunk_ids.append(chunk_key)
                if source and source.lower() != "unknown":
                    used_sources.append(source)
            
            kb_text = "\n\n".join(kb_text_list)
            used_sources = sorted(set(used_sources))
            
            system_prompt = (
                "你是财会大师。\n\n"
                "你必须遵守以下规则：\n"
                "1. 只能基于我提供的 Context 回答，不要编造。\n"
                "2. 【重要】只输出回答正文；严禁输出【引用来源】或任何文件名/来源列表（引用由系统自动追加）。\n\n"
                "以下是相关资料片段(Context)：\n"
                f"{kb_text}"
            )
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ]
            print("\n💭 [思考过程]", flush=True)
            full_reasoning = ""
            full_content = ""
            for chunk in model_pool.stream_completion(messages, model_name=model_pool.knowledge_base_model):
                if first_token_time is None:
                    first_token_time = (time.time() - reasoning_start) * 1000
                import stream_context
                handler = stream_context.get_stream_handler()
                if handler:
                    handler(chunk)
                if chunk['type'] == 'reasoning':
                    print(chunk['content'], end='', flush=True)
                    full_reasoning = chunk['full_reasoning']
                elif chunk['type'] == 'content':
                    if not full_content:
                        print("\n\n💬 [回答]", flush=True)
                    print(chunk['content'], end='', flush=True)
                    full_content = chunk['full_content']
            print()

            # === Common Legacy Finalization ===
            final_content = _ensure_citation_footer(full_content, locals().get("used_sources", []))

            state['messages'].append(AIMessage(content=final_content))

            if handler:
                handler({'type': 'content', 'content': final_content, 'full_content': final_content})
            
            perf = PerformanceMetrics(**state['performance_metrics'])
            perf.update_accuracy(True)
            if first_token_time:
                perf.update_first_token_latency(first_token_time)
            reasoning_time = (time.time() - reasoning_start) * 1000
            perf.update_reasoning_time(reasoning_time)
            if state.get('current_round_start_time'):
                total_time = (time.time() - state['current_round_start_time']) * 1000
                perf.update_response_time(total_time)
            state['performance_metrics'] = asdict(perf)
            
            return state

    except Exception as e:
        print("\n❌ 错误: " + str(e))
        state['messages'].append(AIMessage(content=f"处理出错: {str(e)}"))
        perf = PerformanceMetrics(**state['performance_metrics'])
        perf.update_accuracy(False)
        state['performance_metrics'] = asdict(perf)
    return state


# ==================== 7. 构建图 ====================
def create_accounting_agent(checkpointer=None):
    workflow = StateGraph(AccountingState)
    
    workflow.add_node("extract_info", extract_info_node)
    workflow.add_node("handle_noise", handle_noise_node)
    workflow.add_node("business_chat", business_chat_node_streaming)
    workflow.add_node("policy_qa", policy_chat_node_streaming)
    
    workflow.add_edge(START, "extract_info")
    workflow.add_conditional_edges(
        "extract_info",
        filter_noise_node,
        {
            "handle_noise": "handle_noise",
            "process_business": "business_chat",
            "policy_qa": "policy_qa"
        }
    )
    workflow.add_edge("handle_noise", END)
    workflow.add_edge("business_chat", END)
    
    memory = checkpointer if checkpointer else MemorySaver()
    return workflow.compile(checkpointer=memory)


# ==================== 8. 指标报告 ====================
def generate_report(state: AccountingState) -> str:
    perf = PerformanceMetrics(**state.get('performance_metrics', {}))
    ctx = ContextMemoryMetrics(**state.get('context_memory_metrics', {}))
    
    ps = perf.get_summary()
    cs = ctx.get_summary()
    
    report = "\n" + "="*80 + "\n"
    report += "📊 性能与上下文记忆指标报告\n"
    report += "="*80 + "\n\n"
    
    report += "【一、性能指标】\n" + "-"*80 + "\n"
    for cat, metrics in ps.items():
        report += f"\n{cat}:\n"
        for k, v in metrics.items():
            report += f"  {k}: {v}\n"
    
    report += "\n【二、上下文记忆指标】\n" + "-"*80 + "\n"
    for cat, metrics in cs.items():
        report += f"\n{cat}:\n"
        for k, v in metrics.items():
            report += f"  {k}: {v}\n"
    
    report += "\n【三、赛题达标情况】\n" + "-"*80 + "\n"
    report += f"\n任务2:\n"
    report += f"  意图连贯率: {ctx.intent_coherence_rate:.1f}% (≥90%) {'✓' if ctx.intent_coherence_rate >= 90 else '✗'}\n"
    report += f"  嵌套处理率: {ctx.nested_intent_accuracy:.1f}% (≥85%) {'✓' if ctx.nested_intent_accuracy >= 85 else '✗'}\n"
    report += f"  噪音过滤率: {perf.noise_filter_effectiveness:.1f}% (≥95%) {'✓' if perf.noise_filter_effectiveness >= 95 else '✗'}\n"
    report += f"  平均响应: {perf.avg_response_time:.1f}ms (≤200ms) {'✓' if perf.avg_response_time <= 200 else '✗'}\n"
    report += f"  峰值延迟: {perf.max_response_time:.1f}ms (≤500ms) {'✓' if perf.max_response_time <= 500 else '✗'}\n"
    
    report += f"\n任务3:\n"
    report += f"  推理准确率: {perf.accuracy_rate:.1f}% (≥80%) {'✓' if perf.accuracy_rate >= 80 else '✗'}\n"
    report += f"  推理耗时: {perf.avg_reasoning_time:.1f}ms (≤500ms) {'✓' if perf.avg_reasoning_time <= 500 else '✗'}\n"
    
    report += "\n" + "="*80 + "\n"
    return report


# ==================== 9. 主函数 ====================
def main():
    print("="*80)
    print("🚀 账务智能助手 - 多轮问答模式")
    print("="*80)
    
    mp = ModelPool.get_instance()
    try:
        sel = input("请选择模型来源 [api/local]（默认 api）：").strip().lower()
    except Exception:
        sel = "api"
    if sel in ["local", "ollama"]:
        try:
            mn = input("请输入本地模型名称（默认 deepseek-r1:8b）：").strip()
        except Exception:
            mn = ""
        mp.set_backend("ollama", mn if mn else "deepseek-r1:8b")
        print(f"已选择本地模型: {mp.ollama_model}")
    else:
        mp.set_backend("api")
        print("已选择默认API模型")
    agent = create_accounting_agent()
    config = {"configurable": {"thread_id": "fast_streaming"}}
    
    initial_state = {
        "messages": [],
        "account_number": "", "subject_code": "", "amount": 0.0,
        "currency": "", "transaction_date": "", "business_type": "",
        "exchange_rate": 0.0, "intent_history": [],
        "conversation_round": 0, "is_noise": False,
        "dimension_memory": {},
        "performance_metrics": asdict(PerformanceMetrics()),
        "context_memory_metrics": asdict(ContextMemoryMetrics()),
        "current_round_start_time": 0.0,
    }
    
    state = initial_state
    
    while True:
        user_input = input("\n请输入问题（输入“退出”结束）：").strip()
        if not user_input:
            continue
        if user_input.lower() in ["exit", "quit", "q"] or user_input == "退出":
            print("\n👋 已结束对话")
            break
        
        print(f"\n{'='*80}")
        print("新一轮对话")
        print(f"{'='*80}")
        print(f"👤 用户: {user_input}")
        
        state['messages'].append(HumanMessage(content=user_input))
        
        result = agent.invoke(state, config)
        state = result
        
        perf = PerformanceMetrics(**result['performance_metrics'])
        print(f"\n⏱️  性能: 总耗时{perf.response_times[-1] if perf.response_times else 0:.1f}ms | "
              f"首Token{perf.first_token_latency[-1] if perf.first_token_latency else 0:.1f}ms | "
              f"推理{perf.reasoning_times[-1] if perf.reasoning_times else 0:.1f}ms")


if __name__ == "__main__":
    main()
