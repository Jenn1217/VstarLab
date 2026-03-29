import json, re, time, os, hashlib
from pathlib import Path
from typing import List, Dict, Any, Tuple

import numpy as np
import faiss
import requests
from sentence_transformers import SentenceTransformer

# ========== 1) 配置 ==========
# 更新为当前项目的实际根目录
PROJECT_ROOT = Path(__file__).resolve().parent.parent
KB_DIR = PROJECT_ROOT / "backend" / "knowledge" / "kb-cut"
CAG_DIR = PROJECT_ROOT / "cag"
CAG_DIR.mkdir(exist_ok=True)

# 你的 embedding 模型路径（与构建 faiss 时一致）
EMBEDDING_MODEL_PATH = str(PROJECT_ROOT / "backend" / "models" / "local_bge_small")

# DeepSeek API（不要把 key 写死在仓库里；建议用环境变量）
API_HOST = os.getenv("DS_API_HOST", "api.deepseek.com")
API_KEY = os.getenv("DS_API_KEY", "")  # export DS_API_KEY="..."
MODEL = os.getenv("DS_MODEL", "deepseek-chat")

# CAG 缓存
CACHE_PATH = CAG_DIR / "cag_store.json"
CACHE_TTL_SECONDS = 60 * 30  # 30分钟
CACHE_MAX_ITEMS = 200

# ========== 2) 工具：归一化与 cache key ==========
def _normalize_query(q: str) -> str:
    q = (q or "").strip()
    q = re.sub(r"\s+", " ", q)
    return q

def _cache_key(query: str) -> str:
    s = _normalize_query(query).lower()
    return hashlib.sha1(s.encode("utf-8")).hexdigest()

def _load_cache() -> Dict[str, Any]:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}

def _save_cache(cache: Dict[str, Any]) -> None:
    # 简单裁剪避免无限增长
    if len(cache) > CACHE_MAX_ITEMS:
        # 按 ts 从旧到新删除
        items = sorted(cache.items(), key=lambda kv: kv[1].get("ts", 0))
        for k, _ in items[: max(0, len(cache) - CACHE_MAX_ITEMS)]:
            cache.pop(k, None)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")

# ========== 3) 加载：多库 chunks + 多 faiss index ==========
def _discover_kb_pairs(kb_dir: Path) -> List[Tuple[Path, Path]]:
    """
    自动发现 kb-cut 下的 (chunks*.json, faiss*.bin) 配对。
    规则：chunks 文件名去掉前缀 'chunks' 后的部分，与 faiss 文件名去掉 'faiss' 后的部分一致。
    例如：chunks1214.json <-> faiss1214.bin
          chunks_1214_book.json <-> faiss_1214_book.bin
    """
    chunks_files = sorted(kb_dir.glob("chunks*.json"))
    pairs = []
    for cf in chunks_files:
        suffix = cf.name.replace("chunks", "", 1).replace(".json", "")
        ff = kb_dir / f"faiss{suffix}.bin"
        if ff.exists():
            pairs.append((cf, ff))
    return pairs

def _load_chunks(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        return []
    # 这里每条至少应有: id/topic/text/source/folder/metadata
    return data

def _load_indices_and_chunks(kb_dir: Path):
    pairs = _discover_kb_pairs(kb_dir)
    if not pairs:
        raise FileNotFoundError(f"No (chunks*.json, faiss*.bin) pairs found in {kb_dir}")

    corpora = []
    for chunks_path, faiss_path in pairs:
        chunks = _load_chunks(chunks_path)
        index = faiss.read_index(str(faiss_path))
        corpora.append({
            "chunks_path": chunks_path,
            "faiss_path": faiss_path,
            "chunks": chunks,
            "index": index
        })
    return corpora

# ========== 4) 检索：对每个 index 搜 topk，然后全局合并 ==========
class CAGRetriever:
    def __init__(self, kb_dir: Path, embed_model_path: str):
        self.corpora = _load_indices_and_chunks(kb_dir)
        self.embedder = SentenceTransformer(embed_model_path)

    def embed_query(self, query: str) -> np.ndarray:
        v = self.embedder.encode([query], normalize_embeddings=True)
        return np.asarray(v, dtype="float32")

    def search(self, query: str, top_k: int = 6) -> List[Dict[str, Any]]:
        qv = self.embed_query(query)

        hits = []
        for corp in self.corpora:
            index = corp["index"]
            chunks = corp["chunks"]
            D, I = index.search(qv, top_k)  # inner product
            for score, idx in zip(D[0].tolist(), I[0].tolist()):
                if idx < 0 or idx >= len(chunks):
                    continue
                ch = chunks[idx]
                hits.append({
                    "score": float(score),
                    "chunk": ch
                })

        # 全局按相似度排序
        hits.sort(key=lambda x: x["score"], reverse=True)
        # 取全局 top_k
        hits = hits[:top_k]

        # 标准化输出（仅保留我们需要的字段）
        out = []
        for h in hits:
            ch = h["chunk"]
            out.append({
                "id": ch.get("id"),
                "topic": ch.get("topic", ""),
                "text": ch.get("text", ""),
                "source": ch.get("source", ""),   # 原始文献文件名（关键）
                "folder": ch.get("folder", ""),
                "metadata": ch.get("metadata", {}),
                "score": h["score"]
            })
        return out

# ========== 5) 生成：LLM 只输出正文；系统拼引用 ==========
def call_llm(question: str, contexts: List[Dict[str, Any]]) -> str:
    # 只把 text 喂给模型；不要给 source
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

    url = f"https://{API_HOST}/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question}
        ],
        "temperature": 0.2
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return (data.get("choices", [{}])[0].get("message", {}) or {}).get("content", "").strip()

def build_citation_block(contexts: List[Dict[str, Any]]) -> str:
    # 只取 source 字段，去重，保持稳定顺序
    sources = []
    for c in contexts:
        s = str(c.get("source", "") or "").strip()
        if s:
            sources.append(s)
    sources = sorted(set(sources))

    block = "【引用来源】\n"
    if sources:
        block += "\n".join(f"- {s}" for s in sources)
    return block

# ========== 6) 对外接口：CAG（缓存命中直接返回） ==========
class CAGQA:
    def __init__(self, kb_dir: Path, embed_model_path: str, llm_func=None):
        self.retriever = CAGRetriever(kb_dir, embed_model_path)
        self.cache = _load_cache()
        self.llm_func = llm_func or call_llm

    def ask(self, question: str, top_k: int = 6) -> str:
        ck = _cache_key(question)
        now = time.time()

        hit = self.cache.get(ck)
        if hit and (now - hit.get("ts", 0) <= CACHE_TTL_SECONDS):
            # 缓存命中：直接返回“正文 + 引用来源”
            answer = hit.get("answer", "")
            sources = hit.get("sources", [])
            block = "【引用来源】\n" + ("\n".join(f"- {s}" for s in sources) if sources else "")
            return answer.rstrip() + "\n\n" + block

        # 未命中：检索 -> 生成 -> 引用拼接 -> 写缓存
        contexts = self.retriever.search(question, top_k=top_k)

        answer = self.llm_func(question, contexts)
        citation_block = build_citation_block(contexts)
        final_text = answer.rstrip() + "\n\n" + citation_block

        # 写缓存：缓存答案正文 + sources + chunk_ids
        sources = sorted(set([c.get("source", "") for c in contexts if c.get("source")]))
        chunk_ids = [c.get("id") for c in contexts if c.get("id") is not None]
        self.cache[ck] = {
            "answer": answer,
            "sources": sources,
            "chunk_ids": chunk_ids,
            "ts": now
        }
        _save_cache(self.cache)
        return final_text

    def get_cache_hit(self, question: str):
        ck = _cache_key(question)
        now = time.time()
        hit = self.cache.get(ck)
        if hit and (now - hit.get("ts", 0) <= CACHE_TTL_SECONDS):
            return hit
        return None

    def save_to_cache(self, question: str, answer: str, reasoning: str, sources: List[str], chunks: List[Dict]):
        ck = _cache_key(question)
        chunk_ids = [c.get("id") for c in chunks if c.get("id") is not None]
        self.cache[ck] = {
            "answer": answer,
            "reasoning": reasoning,
            "sources": sources,
            "chunk_ids": chunk_ids,
            "ts": time.time()
        }
        _save_cache(self.cache)

# ========== 7) CLI 测试入口 ==========
if __name__ == "__main__":
    qa = CAGQA(KB_DIR, EMBEDDING_MODEL_PATH)
    while True:
        q = input("\nQ> ").strip()
        if not q:
            continue
        if q.lower() in {"exit", "quit"}:
            break
        print("\n" + qa.ask(q, top_k=6))
