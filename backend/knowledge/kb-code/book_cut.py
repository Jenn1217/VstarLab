import json
import re
import time
import os
import requests
import numpy as np
import faiss
from pathlib import Path
from typing import List, Dict, Any, Tuple
from langchain_core.documents import Document
from sentence_transformers import SentenceTransformer
from markdown_it import MarkdownIt

# ==================== 配置区 (来自 law_cut.py) ====================
API_HOST = "api.deepseek.com"
API_KEY = "sk-75c082ab38ae4d22be02ff1870edf7f2"
MODEL = "deepseek-chat"

PROJECT_ROOT = Path("/Users/renzhenni/Library/Mobile Documents/com~apple~CloudDocs/学习/2025.12.09 代码备份/41212")
INPUT_DIR = PROJECT_ROOT / "知识库完整内容"
OUTPUT_DIR = PROJECT_ROOT / "kb-cut"
OUTPUT_DIR.mkdir(exist_ok=True)
EMBEDDING_MODEL_PATH = "/Users/renzhenni/Library/Mobile Documents/com~apple~CloudDocs/llm/embedding/local_bge_small"

# ==================== 工具函数 (来自 law_cut.py) ====================
def _extract_content(choice):
    if not isinstance(choice, dict):
        return ""
    msg = choice.get("message", {})
    content = msg.get("content", "")
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
            elif isinstance(item, str):
                parts.append(item)
        content = "\n".join(parts)
    if isinstance(content, str):
        return content.strip()
    text = choice.get("text", "")
    return (text or "").strip()

def _sanitize_topic(s):
    if not isinstance(s, str):
        return ""
    topic = s.strip()
    for prefix in ["【主题】", "主题", "小标题", "标题"]:
        topic = re.sub(rf"^\s*{prefix}\s*[:：\-]\s*", "", topic)
    topic = topic.strip("：:;；，,。.!！?？[]（）()\"'“”‘’")
    topic = topic[:20].strip()
    return topic

def generate_topics_with_llm(chunks, max_retry=3, sleep_time=0.8):
    print(f"🤖 Generating topics with LLM for {len(chunks)} chunks...")
    
    url = f"https://{API_HOST}/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }

    from concurrent.futures import ThreadPoolExecutor, as_completed

    def process_one(idx, c):
        text = c.page_content.strip()
        if len(text) > 1200:
            text = text[:1200] + "……（以下内容省略）"

        prompt = (
            "请从下面文本中提炼一个简短的中文主题（2-8字），"
            "只输出主题本身，不要任何解释或标点：\n\n"
            f"{text}"
        )

        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": "你是一名中文知识工程师，只输出主题，不加任何额外字符。"},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2,
            "top_p": 0.9,
            "response_format": {"type": "text"},
            "max_output_tokens": 32 
        }
        
        fallback_payload = {
             "model": MODEL,
             "messages": [
                 {"role": "system", "content": "你是一名中文知识工程师，只输出主题，不加任何额外字符。"},
                 {"role": "user", "content": prompt}
             ],
             "temperature": 0.2,
             "top_p": 0.9,
             "max_tokens": 64
        }

        topic = "未知主题"
        for attempt in range(max_retry):
            try:
                try:
                     resp = requests.post(url, headers=headers, json=payload, timeout=30)
                except Exception:
                     time.sleep(sleep_time)
                     continue
                
                if resp.status_code in (400, 422):
                     resp = requests.post(url, headers=headers, json=fallback_payload, timeout=30)

                if resp.status_code != 200:
                    time.sleep(sleep_time)
                    continue

                data = resp.json()
                choices = data.get("choices", [])
                if not choices:
                    time.sleep(sleep_time)
                    continue

                raw = _extract_content(choices[0])
                cleaned = _sanitize_topic(raw)
                
                if cleaned:
                    topic = cleaned
                    return idx, topic

            except Exception:
                time.sleep(sleep_time)
                
        # print(f"❌ Chunk {idx} topic generation failed after retries.")
        fallback_topic = c.metadata.get('title', '')
        if not fallback_topic or fallback_topic == "无标题":
             fallback_topic = "片段"
        return idx, fallback_topic

    topics = [""] * len(chunks)
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_idx = {executor.submit(process_one, i, c): i for i, c in enumerate(chunks)}
        
        completed_count = 0
        total_count = len(chunks)
        
        for future in as_completed(future_to_idx):
            idx, topic = future.result()
            topics[idx] = topic
            completed_count += 1
            if completed_count % 10 == 0:
                print(f"   Progress: {completed_count}/{total_count} topics generated...", end='\r')
                
    print(f"\n✅ All {total_count} topics generated.")
    return topics

def embed_chunks(chunks: List[Document], batch_size: int = 32):
    print(f"🧠 Loading Embedding Model: {EMBEDDING_MODEL_PATH}...")
    try:
        model = SentenceTransformer(EMBEDDING_MODEL_PATH)
    except Exception as e:
        print(f"⚠️ Failed to load local model ({e}), falling back to 'BAAI/bge-small-zh-v1.5'...")
        model = SentenceTransformer('BAAI/bge-small-zh-v1.5')
        
    texts = [c.page_content for c in chunks]
    print(f"🚀 Embedding {len(texts)} chunks...")
    embeddings = model.encode(texts, batch_size=batch_size, show_progress_bar=True, normalize_embeddings=True)
    return embeddings

def save_faiss(embeddings: np.ndarray, output_path: Path):
    print(f"💾 Saving FAISS index...")
    dimension = embeddings.shape[1]
    index = faiss.IndexFlatIP(dimension)
    index.add(embeddings)
    faiss.write_index(index, str(output_path))
    print(f"✅ Saved FAISS index → {output_path}")

def export_json(chunks, topics, embedding_model_name, output_path):
    data = []
    for i, c in enumerate(chunks):
        source = c.metadata.get("source", "")
        folder = c.metadata.get("folder", "")
        
        md = c.metadata.copy()
        if "source" in md: del md["source"]
        if "folder" in md: del md["folder"]
        
        md["embedding_model"] = embedding_model_name
        
        data.append({
            "id": c.metadata.get("chunk_id", i),
            "topic": topics[i],
            "text": c.page_content,
            "full_len": len(c.page_content),
            "source": source,
            "folder": folder,
            "metadata": md
        })
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ Exported {len(chunks)} chunks → {output_path}")

# ==================== Markdown 切分逻辑 (来自 bc.py) ====================

def parse_markdown(md_text: str) -> List[Dict[str, str]]:
    """解析 Markdown，以 Header 为界分割章节"""
    md = MarkdownIt()
    tokens = md.parse(md_text)

    sections: List[Dict[str, str]] = []
    cur = {"title": "", "content": ""}

    i, n = 0, len(tokens)
    while i < n:
        tok = tokens[i]
        if tok.type == "heading_open":
            # 结束上一节
            if cur["title"] or cur["content"]:
                sections.append(cur)
            # 新节标题
            title = tokens[i + 1].content.strip() if i + 1 < n and tokens[i + 1].type == "inline" else ""
            cur = {"title": title, "content": ""}
            i += 3
            continue
        if tok.type == "inline" and tok.content:
            cur["content"] += tok.content.strip() + "\n"
        i += 1

    if cur["title"] or cur["content"]:
        sections.append(cur)
    return sections

def load_and_chunk_markdown(file_path: Path) -> List[Document]:
    """读取 MD 文件并使用 bc.py 的逻辑进行切分"""
    try:
        md_text = file_path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"❌ 读取文件失败 {file_path}: {e}")
        return []

    sections = parse_markdown(md_text)
    folder_name = file_path.parent.name
    
    docs = []
    for i, sec in enumerate(sections):
        title = (sec.get("title") or "").strip()
        content = (sec.get("content") or "").strip()
        
        # 简单合并：如果没有内容只有标题，就只用标题；主要内容是 content
        # bc.py 中有一步是如果有图片则合并图片描述，这里为了简单（且避免额外依赖），只处理文本
        # 如果需要保留原 bc.py 的图片逻辑，需要引入 OCR 代码。为降低风险，此处仅保留文本切分逻辑。
        
        text_block = content
        if not text_block and title:
            text_block = title
        elif title and content:
            # 文本块内容包含标题，提供上下文
            text_block = f"## {title}\n{content}"
            
        if not text_block.strip():
            continue
            
        docs.append(Document(
            page_content=text_block,
            metadata={
                "source": file_path.name,
                "folder": folder_name,
                "chunk_id": i,
                "title": title or "无标题",
                "chunk_type": "markdown_section"
            }
        ))
    return docs

# ==================== 主程序 ====================
if __name__ == "__main__":
    TARGET_DIR_NAME = "银行会计相关教材"
    TARGET_DIR = INPUT_DIR / TARGET_DIR_NAME
    
    if not TARGET_DIR.exists():
        print(f"❌ 目录不存在: {TARGET_DIR}")
        exit()

    print(f"📂 扫描目录: {TARGET_DIR}")
    
    # 仅针对 .md 文件
    files = list(TARGET_DIR.glob("**/*.md"))
    
    if not files:
        print(f"⚠️ 未找到 .md 文件，请检查目录: {TARGET_DIR}")
        exit()
    
    print(f"✅ 找到 {len(files)} 个 .md 文件。")
    
    all_chunks = []
    
    # 1. 加载与切分 (Merge load and chunk steps for Markdown)
    for idx, f in enumerate(files):
        print(f"[{idx+1}/{len(files)}] 处理: {f.name}")
        file_chunks = load_and_chunk_markdown(f)
        print(f"   → {len(file_chunks)} 块")
        all_chunks.extend(file_chunks)
        
    if not all_chunks:
        print("❌ 未生成任何切片，退出。")
        exit()
        
    # 3. Embedding
    embeddings = embed_chunks(all_chunks)
    
    # 4. 生成主题
    topics = generate_topics_with_llm(all_chunks)
    
    # 5. 保存
    save_faiss(np.array(embeddings), OUTPUT_DIR / "faiss_1214_book.bin")
    export_json(all_chunks, topics, EMBEDDING_MODEL_PATH, OUTPUT_DIR / "chunks_1214_book.json")
    
    print("\n🎉 处理完成！")
