import json
import re
import time
import os
import requests
import numpy as np
import faiss
from pathlib import Path
from typing import List, Dict, Any, Tuple
from unstructured.partition.auto import partition
from unstructured.partition.pdf import partition_pdf
from unstructured.partition.docx import partition_docx
from langchain_core.documents import Document
from sentence_transformers import SentenceTransformer
from transformers import pipeline

# ==================== 配置区 ====================
# API 配置
API_HOST = "api.deepseek.com"
API_KEY = "sk-75c082ab38ae4d22be02ff1870edf7f2"
MODEL = "deepseek-chat"

# 路径配置
PROJECT_ROOT = Path("/Users/renzhenni/Library/Mobile Documents/com~apple~CloudDocs/学习/2025.12.09 代码备份/41212")
INPUT_DIR = PROJECT_ROOT / "知识库完整内容"
OUTPUT_DIR = PROJECT_ROOT / "kb-cut"
OUTPUT_DIR.mkdir(exist_ok=True)

EMBEDDING_MODEL_PATH = "/Users/renzhenni/Library/Mobile Documents/com~apple~CloudDocs/llm/embedding/local_bge_small"

# ==================== 工具函数 ====================

def _get_page_no(el) -> int:
    md = getattr(el, "metadata", None)
    if isinstance(md, dict):
        return md.get("page_number") or -1
    return getattr(md, "page_number", None) or -1

def _get_xy(el) -> Tuple[float, float]:
    md = getattr(el, "metadata", None)
    coords = md.get("coordinates") if isinstance(md, dict) else getattr(md, "coordinates", None)
    if coords and hasattr(coords, "points"):
        xs = [p[0] for p in coords.points]
        ys = [p[1] for p in coords.points]
        return (min(xs), min(ys))
    return (0.0, 1e9)

def _category(el) -> str:
    return getattr(el, "category", "") or getattr(getattr(el, "metadata", {}), "category", "") or ""

def _is_page_marker_text(t: str) -> bool:
    s = t.strip()
    if re.fullmatch(r"第\s*\d+\s*页(\s*[/／]\s*共\s*\d+\s*页)?", s): return True
    if re.fullmatch(r"共\s*\d+\s*页", s): return True
    if re.fullmatch(r"\d{1,3}\s*[/／]\s*\d{1,3}", s): return True
    if re.fullmatch(r"Page\s*\d+(\s*of\s*\d+)?", s, flags=re.I): return True
    return False

def sort_and_filter_elements(elements):
    elements = sorted(elements, key=lambda e: (_get_page_no(e), _get_xy(e)[1], _get_xy(e)[0]))
    cleaned = []
    for el in elements:
        cat = _category(el)
        t = getattr(el, "text", "") or ""
        if not t.strip(): continue
        if cat in {"Header", "Footer"}: continue
        if _is_page_marker_text(t): continue
        cleaned.append(el)
    return cleaned

def remove_noise_lines(text: str) -> str:
    lines = text.splitlines()
    out = []
    for ln in lines:
        s = ln.strip()
        if re.search(r"(https?[:／/\\]|httpswww|gov\.cn|中国政府网|gongbao|content_\d+)", s, re.I): continue
        if re.search(r"(中华人民共和国财政部令|国务院公报|金融企业财务规则)", s): continue
        if re.fullmatch(r"\d{1,4}", s): continue
        if re.fullmatch(r"\d{4}[/-]\d{1,2}[/-]\d{1,2}(\s+\d{2}:\d{2})?", s): continue
        out.append(ln)
    return "\n".join(out)

CN_END = "。！？；：、）】》\"”'"
def merge_lines_smart(text: str) -> str:
    out = []
    buf = ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            if buf:
                out.append(buf)
                buf = ""
            out.append("")
            continue
        line = re.sub(r"(第\s*[一二三四五六七八九十百零〇]+\s*条)\s*\1", r"\1", line)
        if not buf:
            buf = line
        else:
            if buf[-1] in CN_END or re.match(r"^第\s*[一二三四五六七八九十百零〇]+\s*条", line):
                out.append(buf)
                buf = line
            else:
                buf += line
    if buf: out.append(buf)
    return "\n".join(out)

RE_ART = re.compile(r"^(第\s*[一二三四五六七八九十百零〇]+\s*条)(?:\s*(.*))?$")
def clean_text(text: str) -> str:
    text = text.replace("\r", "")
    lines = text.splitlines()
    norm = [re.sub(r"[ \t]+", " ", ln).rstrip() for ln in lines]
    out = []
    i = 0
    while i < len(norm):
        line = norm[i]
        if not line.strip():
            if out and out[-1] != "": out.append("")
            i += 1
            continue
        m = RE_ART.match(line.strip())
        if m:
            title = re.sub(r"\s+", "", m.group(1))
            rest = (m.group(2) or "").strip()
            if not rest:
                j = i + 1
                while j < len(norm) and not norm[j].strip(): j += 1
                if j < len(norm):
                    rest = norm[j].strip()
                    i = j
            merged = f"{title} {rest}".strip()
            out.append(merged)
            i += 1
            continue
        if out and out[-1] and out[-1][-1] not in CN_END:
            out[-1] = out[-1] + line.strip()
        else:
            out.append(line.strip())
        i += 1
    return "\n".join(out).strip()

def normalize_line(s: str) -> str:
    s = s.strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"第\s*\d+\s*页", "第#页", s)
    s = re.sub(r"Page\s*\d+(\s*of\s*\d+)?", "Page#", s, flags=re.I)
    return s

def remove_headers_footers(elements, top_n: int = 2, bottom_n: int = 2, min_repeat_ratio: float = 0.3):
    pages: Dict[int, List[Any]] = {}
    for el in elements:
        try: page_no = getattr(el, "metadata", {}).get("page_number", None)
        except: page_no = None
        txt = getattr(el, "text", None) or str(el)
        if page_no is None: pages.setdefault(-1, []).append((el, txt))
        else: pages.setdefault(page_no, []).append((el, txt))

    header_counts = {}
    footer_counts = {}
    total_pages = len([p for p in pages.keys() if p != -1]) or 1

    for pno, items in pages.items():
        if pno == -1 or not items: continue
        head = items[:top_n]
        tail = items[-bottom_n:] if len(items) >= bottom_n else items[-1:]
        for _, txt in head:
            key = normalize_line(txt)
            header_counts[key] = header_counts.get(key, 0) + 1
        for _, txt in tail:
            key = normalize_line(txt)
            footer_counts[key] = footer_counts.get(key, 0) + 1

    header_set = {k for k, c in header_counts.items() if c / total_pages >= min_repeat_ratio}
    footer_set = {k for k, c in footer_counts.items() if c / total_pages >= min_repeat_ratio}

    cleaned_elements = []
    for pno, items in pages.items():
        if pno == -1:
            cleaned_elements.extend([el for el, _ in items])
            continue
        head_idx = set(range(min(top_n, len(items))))
        tail_idx = set(range(max(0, len(items) - bottom_n), len(items)))
        for idx, (el, txt) in enumerate(items):
            key = normalize_line(txt)
            if idx in head_idx and key in header_set: continue
            if idx in tail_idx and key in footer_set: continue
            cleaned_elements.append(el)
    return cleaned_elements

def partition_file(path: Path):
    suffix = path.suffix.lower()
    try:
        if suffix == ".pdf":
            return partition_pdf(
                filename=str(path),
                strategy="hi_res",
                include_page_breaks=True,
                ocr_strategy="auto",
                languages=["chi_sim"],
                infer_table_structure=False
            )
        elif suffix in [".docx", ".doc"]:
            return partition_docx(filename=str(path))
        else:
            return partition(filename=str(path), strategy="auto")
    except Exception as e:
        print(f"解析错误 {path.name}: {e}")
        return []

def load_documents(file_paths: List[Path]):
    docs = []
    total = len(file_paths)
    for i, path in enumerate(file_paths):
        print(f"[{i+1}/{total}] 解析: {path.name}")
        elements = partition_file(path)
        if not elements: continue
        elements = remove_headers_footers(elements)
        elements = sort_and_filter_elements(elements)

        text_parts = []
        for el in elements:
            t = getattr(el, "text", None)
            if not t: continue
            text_parts.append(t)
        
        text = "\n".join(text_parts)
        text = remove_noise_lines(text)
        text = merge_lines_smart(text)
        text = clean_text(text)
        
        # 获取文件夹名称 (相对于 INPUT_DIR 的直接子目录，如果文件在根目录则为 root)
        # 这里为了简单，取 path.parent.name
        folder_name = path.parent.name
        
        docs.append(Document(page_content=text, metadata={"source": path.name, "folder": folder_name}))
    return docs

def chunk_rule_based(doc):
    pattern = (
        r"((?:第[零一二三四五六七八九十百千]+[章条款节项号]?|"
        r"\n[一二三四五六七八九十]+[、]|"
        r"\n\d+[.)、]|"
        r"\n[ivxlcdm]+[.)、])\s*.*?)(?="
        r"(?:第[零一二三四五六七八九十百千]+[章条款节项号]?|"
        r"\n[一二三四五六七八九十]+[、]|"
        r"\n\d+[.)、]|"
        r"\n[ivxlcdm]+[.)、]|\Z))")
    
    chunks_raw = re.findall(pattern, doc.page_content, re.DOTALL | re.MULTILINE)
    chunks = []
    
    source = doc.metadata.get("source", "")
    folder = doc.metadata.get("folder", "")
    
    if not chunks_raw:
        if len(doc.page_content) > 50:
             chunks.append(Document(page_content=doc.page_content, metadata={
                "source": source,
                "folder": folder,
                "chunk_type": "full",
                "chunk_id": 0,
                "title": "全文"
            }))
        return chunks

    for i, raw in enumerate(chunks_raw):
        raw_str = str(raw).strip()
        if len(raw_str) > 50:
            title_match = re.match(
                r'(第[零一二三四五六七八九十百千]+[章条款节项号]?|[一二三四五六七八九十]+[、]|\d+[.)、]|[ivxlcdm]+[.)、])', 
                raw_str
            )
            metadata = {
                "source": source,
                "folder": folder,
                "chunk_type": "rule",
                "chunk_id": i,
                "title": title_match.group(1) if title_match else "无标题"
            }
            chunks.append(Document(page_content=raw_str, metadata=metadata))
    return chunks

# ... (LLM Topic Generation Parts remain unchanged) ...

def export_json(chunks, topics, embedding_model_name, output_path):
    data = []
    for i, c in enumerate(chunks):
        # Extract source and folder from metadata to put at top level
        source = c.metadata.get("source", "")
        folder = c.metadata.get("folder", "")
        
        # Prepare filtered metadata
        md = c.metadata.copy()
        if "source" in md: del md["source"]
        if "folder" in md: del md["folder"]
        
        md["embedding_model"] = embedding_model_name
        # topic is at top level
        
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

# ==================== Missing Functions ====================

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

def _extract_content(choice):
    """兼容多种返回结构，提取文本内容"""
    if not isinstance(choice, dict):
        return ""
    msg = choice.get("message", {})
    content = msg.get("content", "")
    # content 可能是 list（新式结构），拼接其中的文本片段
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
    # 老接口兼容
    text = choice.get("text", "")
    return (text or "").strip()

def _sanitize_topic(s):
    """清洗主题字符串，去掉前缀和标点，只保留前 20 字"""
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
        # 控制输入长度
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
        
        # Fallback payload without max_output_tokens
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
                # First attempt with standard payload
                try:
                     resp = requests.post(url, headers=headers, json=payload, timeout=30)
                except Exception:
                     # Network error, retry immediately
                     time.sleep(sleep_time)
                     continue
                
                # Handle specific HTTP errors that might indicate param issues
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
                    # Success
                    return idx, topic

            except Exception:
                time.sleep(sleep_time)
                
        # If all retries failed
        print(f"❌ Chunk {idx} topic generation failed after retries.")
        # Fallback to existing title or source if API fails
        fallback_topic = c.metadata.get('title', '')
        if not fallback_topic or fallback_topic == "无标题":
             fallback_topic = "片段"
        return idx, fallback_topic

    topics = [""] * len(chunks)
    
    # Use ThreadPool to speed up
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


# ==================== 主程序 ====================
if __name__ == "__main__":
    # Test specific directory as requested by USER
    TEST_SUBDIR = INPUT_DIR / "合规问题与政策指引"
    if TEST_SUBDIR.exists():
        print(f"🧪 测试模式: 仅扫描 {TEST_SUBDIR}")
        target_dir = TEST_SUBDIR
    else:
        print(f"📂 扫描目录: {INPUT_DIR}")
        target_dir = INPUT_DIR
        
    files = list(target_dir.glob("**/*.pdf")) + list(target_dir.glob("**/*.docx"))
    
    if not files:
        print(f"⚠️ 未找到文件，请检查目录: {target_dir}")
        exit()
    
    print(f"✅ 找到 {len(files)} 个文件。")
    
    # 1. 加载与清洗
    docs = load_documents(files)
    
    # 2. 切片
    all_chunks = []
    for doc in docs:
        print(f"🔪 切分: {doc.metadata['source']}")
        chunks = chunk_rule_based(doc)
        print(f"   → {len(chunks)} 块")
        all_chunks.extend(chunks)
        
    if not all_chunks:
        print("❌ 未生成任何切片，退出。")
        exit()
        
    # 3. Embedding
    embeddings = embed_chunks(all_chunks)
    
    # 4. 生成主题
    topics = generate_topics_with_llm(all_chunks)
    
    # 5. 保存
    save_faiss(np.array(embeddings), OUTPUT_DIR / "faiss1214.bin")
    export_json(all_chunks, topics, EMBEDDING_MODEL_PATH, OUTPUT_DIR / "chunks1214.json")
    
    print("\n🎉 处理完成！")