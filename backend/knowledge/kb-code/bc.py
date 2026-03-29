#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每节一块 + 图片描述(OCR/Caption)并入正文 + 元数据记录图片路径（不再生成单独的图片块）

输出：
- {OUT_DIR}/chunks4_style.json
- {OUT_DIR}/faiss_index.bin

依赖（与你当前环境一致的最小集合）：
pip install markdown-it-py mdurl
pip install sentence-transformers faiss-cpu
pip install pillow
pip install paddleocr
# 如启用 BLIP：
pip install transformers accelerate
# 如启用 Qwen2-VL（CPU会慢，不建议无GPU时启用）：
# pip install transformers accelerate
"""

import os
import json
import re
import time
import requests
from pathlib import Path
from typing import List, Dict, Any, Tuple

import numpy as np
import faiss
from PIL import Image
from markdown_it import MarkdownIt
from sentence_transformers import SentenceTransformer
from langchain.docstore.document import Document

# ======== OCR（PaddleOCR，CPU 版本即可）========
from paddleocr import PaddleOCR

# ======== 可选：图像描述模型（BLIP 或 Qwen2-VL）========
import torch
from transformers import (
    BlipProcessor, BlipForConditionalGeneration,
    AutoTokenizer, AutoModelForCausalLM
)

# ====================== CONFIG ======================
MD_PATH = r"/Users/renzhenni/Library/Mobile Documents/com~apple~CloudDocs/学习/2025.12.09 代码备份/41212/知识库完整内容/合规问题与政策指引/"   # ← 你的 .md 文件或包含 .md 的文件夹
OUT_DIR = r"/Users/renzhenni/Library/Mobile Documents/com~apple~CloudDocs/学习/2025.12.09 代码备份/41212/知识库完整内容/合规问题与政策指引/"   # ← 输出目录
EMBED_MODEL = "/Users/renzhenni/Library/Mobile Documents/com~apple~CloudDocs/llm/embedding/local_bge_small"     # 句向量模型

# 图像描述开关： "blip" | "qwen2_vl" | "off"
ENABLE_CAPTION_PROVIDER = "blip"
# OCR 提供者（固定使用 PaddleOCR）
OCR_PROVIDER = "paddle"

# 每个小节最多合并的图片张数（按 images 目录字典序分配）
IMAGES_PER_SECTION = 1

# 余下图片如何处理： "append_to_last" | "drop"
ON_LEFTOVER_IMAGES = "append_to_last"

# ==================== LLM主题生成配置 ====================
API_HOST = "api.deepseek.com"
API_KEY = "sk-75c082ab38ae4d22be02ff1870edf7f2"
MODEL = "deepseek-chat"
# =====================================================


# ---------- Markdown 解析：每个标题（heading）算一个小节 ----------
def parse_markdown(md_text: str) -> List[Dict[str, str]]:
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


# ---------- Caption Providers ----------
_blip = None
_qwen2 = None


def get_blip_caption(img_path: str) -> str:
    global _blip
    try:
        if _blip is None:
            processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
            model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")
            if torch.cuda.is_available():
                model = model.to("cuda")
            _blip = (processor, model)
        processor, model = _blip
        image = Image.open(img_path).convert("RGB")
        inputs = processor(image, return_tensors="pt").to(model.device)
        out = model.generate(**inputs, max_new_tokens=40)
        return processor.decode(out[0], skip_special_tokens=True)
    except Exception as e:
        print(f"[WARN] BLIP caption failed for {img_path}: {e}")
        return ""


def get_qwen2_caption(img_path: str) -> str:
    global _qwen2
    try:
        if _qwen2 is None:
            tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2-VL-2B-Instruct", trust_remote_code=True)
            model = AutoModelForCausalLM.from_pretrained(
                "Qwen/Qwen2-VL-2B-Instruct",
                torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                device_map="auto",
                trust_remote_code=True
            )
            _qwen2 = (tokenizer, model)
        tokenizer, model = _qwen2
        prompt = "请用中文简要描述这张教材图片，突出其会计概念或要点。"
        msgs = [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image", "image": img_path}
        ]}]
        input_ids = tokenizer.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt").to(model.device)
        out = model.generate(input_ids, max_new_tokens=100)
        text = tokenizer.decode(out[0], skip_special_tokens=True)
        # 简单清理提示词残留
        if prompt in text:
            text = text.split(prompt, 1)[-1].strip()
        return text.strip()
    except Exception as e:
        print(f"[WARN] Qwen2-VL caption failed for {img_path}: {e}")
        return ""


# ---------- PaddleOCR ----------
# 延迟初始化OCR引擎，避免在不需要时加载
ocr_engine = None


def get_ocr_engine():
    global ocr_engine
    if ocr_engine is None:
        try:
            ocr_engine = PaddleOCR(use_textline_orientation=True, lang='ch', use_gpu=False)
        except Exception as e:
            print(f"[WARN] PaddleOCR初始化失败: {e}")
            print("[INFO] 将禁用OCR功能")
            ocr_engine = False  # 标记为失败，避免重复尝试
    return ocr_engine if ocr_engine is not False else None


def extract_ocr_text(img_path: str) -> str:
    engine = get_ocr_engine()
    if engine is None:
        return ""
    try:
        res = engine.ocr(img_path, cls=True)
        texts = []
        for page in res:
            if page:  # 检查page不为空
                for line in page:
                    texts.append(line[1][0])
        return " ".join(texts).strip()
    except Exception as e:
        print(f"[WARN] PaddleOCR failed for {img_path}: {e}")
        return ""


# ---------- 处理 images 目录：为每张图生成 {caption, ocr} ----------
def process_images(img_dir: Path) -> List[Tuple[str, Dict[str, str]]]:
    info: List[Tuple[str, Dict[str, str]]] = []
    if not img_dir.exists():
        print("[INFO] 未发现 images 目录，跳过图片处理。")
        return info

    allow = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    files = [p for p in sorted(img_dir.glob("*.*")) if p.suffix.lower() in allow]
    for p in files:
        entry: Dict[str, str] = {}
        if ENABLE_CAPTION_PROVIDER == "blip":
            entry["caption"] = get_blip_caption(str(p))
        elif ENABLE_CAPTION_PROVIDER == "qwen2_vl":
            entry["caption"] = get_qwen2_caption(str(p))
        else:
            entry["caption"] = ""
        if OCR_PROVIDER == "paddle":
            entry["ocr"] = extract_ocr_text(str(p))
        info.append((str(p), entry))
    print(f"[INFO] 共处理图片 {len(info)} 张")
    return info


# ---------- 将图片内容并入每节文本，并记录图片路径 ----------
def chunk_and_merge(md_path: Path) -> List[Dict[str, Any]]:
    md_text = md_path.read_text(encoding="utf-8")
    sections = parse_markdown(md_text)

    img_dir = md_path.parent / "images"
    img_items = process_images(img_dir)  # [(path, {"caption":..., "ocr":...}), ...]
    img_idx = 0
    chunks: List[Dict[str, Any]] = []

    for sec in sections:
        title = (sec.get("title") or "").strip()
        content = (sec.get("content") or "").strip()
        text_block = content if content else title

        merged_paths: List[str] = []
        merged_text_parts: List[str] = []

        # 给本节分配最多 IMAGES_PER_SECTION 张图片（按 images 目录顺序）
        for _ in range(IMAGES_PER_SECTION):
            if img_idx >= len(img_items):
                break
            img_path, data = img_items[img_idx]
            desc = data.get("caption", "")
            ocr = data.get("ocr", "")
            parts = []
            if desc:
                parts.append(f"图像自动描述（{os.path.basename(img_path)}）：{desc}")
            if ocr:
                parts.append(f"图像文字识别内容：{ocr}")
            if parts:
                merged_text_parts.append("\n".join(parts))
                merged_paths.append(img_path)
            img_idx += 1

        if merged_text_parts:
            text_block += "\n\n" + "\n\n".join(merged_text_parts)

        meta = {
            "chapter_path": title
        }
        if merged_paths:
            meta["image_local_paths"] = merged_paths
            meta["image_local_path"] = merged_paths[0]  # 兼容字段：首张图片

        chunks.append({
            "text": text_block,
            "meta": meta
        })

    # 处理余下的图片：不单独成块，按照配置并入“最后一节”
    if img_idx < len(img_items) and ON_LEFTOVER_IMAGES == "append_to_last" and len(chunks) > 0:
        leftover = img_items[img_idx:]
        add_parts, add_paths = [], []
        for img_path, data in leftover:
            desc = data.get("caption", "")
            ocr = data.get("ocr", "")
            seg = []
            if desc:
                seg.append(f"图像自动描述（{os.path.basename(img_path)}）：{desc}")
            if ocr:
                seg.append(f"图像文字识别内容：{ocr}")
            if seg:
                add_parts.append("\n".join(seg))
                add_paths.append(img_path)

        if add_parts:
            chunks[-1]["text"] += "\n\n" + "\n\n".join(add_parts)
            meta = chunks[-1]["meta"]
            prev_paths = list(meta.get("image_local_paths", []))
            prev_paths.extend(add_paths)
            meta["image_local_paths"] = prev_paths
            if "image_local_path" not in meta and prev_paths:
                meta["image_local_path"] = prev_paths[0]

        print(f"[INFO] 余下图片 {len(leftover)} 张已并入最后一节。")
    elif img_idx < len(img_items):
        print(f"[INFO] 余下图片 {len(img_items) - img_idx} 张被丢弃（ON_LEFTOVER_IMAGES='{ON_LEFTOVER_IMAGES}'）。")

    print(f"[INFO] 文本块 {len(sections)}，合并后 {len(chunks)} 块")
    return chunks


# ---------- 收集 .md：支持文件或文件夹（递归） ----------
def gather_chunks(md_path: Path) -> List[Dict[str, Any]]:
    """从单个 .md 文件或文件夹（递归）中收集所有文本块。
    为每个块附加源文件路径到 metadata.source_md。
    """
    if md_path.is_file():
        if md_path.suffix.lower() != ".md":
            print(f"[WARN] 指定的是文件，但不是 .md：{md_path}")
        chunks = chunk_and_merge(md_path)
        for c in chunks:
            meta = c.get("meta", {})
            meta["source_md"] = str(md_path)
            c["meta"] = meta
        return chunks

    if md_path.is_dir():
        md_files = sorted(md_path.glob("**/*.md"))
        if not md_files:
            print(f"[WARN] 文件夹 {md_path} 下未找到 .md 文件")
            return []
        print(f"[INFO] 在文件夹中发现 {len(md_files)} 个 .md 文件，将批量处理。")
        all_chunks: List[Dict[str, Any]] = []
        for mf in md_files:
            print(f"[INFO] 处理 Markdown：{mf}")
            cs = chunk_and_merge(mf)
            for c in cs:
                meta = c.get("meta", {})
                meta["source_md"] = str(mf)
                c["meta"] = meta
            all_chunks.extend(cs)
        print(f"[INFO] 汇总后共有 {len(all_chunks)} 块")
        return all_chunks

    raise FileNotFoundError(f"路径不存在：{md_path}")


# ---------- LLM主题生成函数 ----------
def _extract_content(choice):
    """兼容多种返回结构，提取文本内容"""
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
    """清洗主题字符串，去掉前缀和标点，只保留前 20 字"""
    if not isinstance(s, str):
        return ""
    topic = s.strip()
    for prefix in ["【主题】", "主题", "小标题", "标题"]:
        topic = re.sub(rf"^\s*{prefix}\s*[:：\-]\s*", "", topic)
    topic = topic.strip("：:;；，,。.!！?？[]（）()\"'""''")
    topic = topic[:20].strip()
    return topic


def generate_topics_with_llm(chunks: List[Document], max_retry=3, sleep_time=0.8) -> List[str]:
    topics: List[str] = []
    url = f"https://{API_HOST}/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }

    print(f"\n🏷️  开始生成主题标签（共 {len(chunks)} 个文本块）...")

    for idx, c in enumerate(chunks):
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

        topic = ""
        for attempt in range(max_retry):
            try:
                resp = requests.post(url, headers=headers, json=payload, timeout=60)
                if resp.status_code != 200:
                    if resp.status_code in (400, 422):
                        print(f"⚠️ API错误 {resp.status_code}，尝试降级重试")
                        resp = requests.post(url, headers=headers, json=fallback_payload, timeout=60)
                        if resp.status_code != 200:
                            print(f"⚠️ 降级后仍错误 {resp.status_code}：{resp.text[:300]}")
                            time.sleep(sleep_time)
                            continue
                    else:
                        print(f"⚠️ API错误 {resp.status_code}：{resp.text[:300]}")
                        time.sleep(sleep_time)
                        continue

                data = resp.json()
                choices = data.get("choices", [])
                if not choices:
                    print(f"⚠️ 无 choices 或为空：{resp.text[:300]}")
                    time.sleep(sleep_time)
                    continue

                raw = _extract_content(choices[0])
                cleaned = _sanitize_topic(raw)

                if not cleaned:
                    fr = choices[0].get("finish_reason")
                    print(f"⚠️ 第 {idx+1} 次解析为空（finish_reason={fr}），重试中 ({attempt+1}/{max_retry})")
                    time.sleep(sleep_time)
                    continue

                topic = cleaned
                print(f"   ✅ [{idx+1}/{len(chunks)}] 主题: {topic}")
                break

            except Exception as e:
                snippet = ""
                try:
                    snippet = resp.text[:300]
                except Exception:
                    pass
                print(f"⚠️ 请求/解析异常：{e}（第 {attempt+1} 次尝试） 响应片段：{snippet}")
                time.sleep(sleep_time)

        if not topic:
            topic = "未知主题"
            print(f"   ❌ [{idx+1}/{len(chunks)}] 主题生成失败，标记为'未知主题'")

        topics.append(topic)
        time.sleep(0.4)

    print(f"✅ 主题生成完成！\n")
    return topics


# ---------- 向量化 & 写出 JSON ----------
def embed_and_save(chunks: List[Dict[str, Any]], out_dir: Path, generate_topics: bool = False):
    texts = [c["text"] for c in chunks]
    metas = [c["meta"] for c in chunks]

    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[Embedding] 使用模型: {EMBED_MODEL}")
    model = SentenceTransformer(EMBED_MODEL)
    embs = model.encode(
        texts,
        batch_size=16,
        convert_to_numpy=True,
        show_progress_bar=True,
        normalize_embeddings=True
    ).astype("float32")

    dim = embs.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embs)
    faiss.write_index(index, str(out_dir / "faiss_index_tech.bin"))

    # 生成主题 using LLM
    doc_chunks = [Document(page_content=c["text"], metadata=c["meta"]) for c in chunks]
    topics = generate_topics_with_llm(doc_chunks)
    print(f"[INFO] 使用LLM生成主题")

    chunks4 = []
    for i, (txt, meta) in enumerate(zip(texts, metas)):
        md = meta.copy()
        md["embedding_model"] = EMBED_MODEL
        md["source"] = os.path.basename(MD_PATH)
        md["chunk_type"] = "text"
        md["chunk_id"] = i
        md["topic"] = topics[i] if i < len(topics) else "其他"  # 添加主题
        chunks4.append({
            "id": i,
            "title": meta.get("chapter_path", "无"),
            "text": txt,
            "full_len": len(txt),
            "metadata": md
        })

    out_json = out_dir / "chunks_tech.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(chunks4, f, ensure_ascii=False, indent=2)
    print(f"[OK] 输出 -> {out_json}, 共 {len(chunks4)} 块")


# ---------- 主程序 ----------
if __name__ == "__main__":
    md_path = Path(MD_PATH)
    out_dir = Path(OUT_DIR)
    print(f"[INFO] 加载教材：{md_path}")
    print(f"[INFO] Caption: {ENABLE_CAPTION_PROVIDER} | OCR: {OCR_PROVIDER} | IMAGES_PER_SECTION={IMAGES_PER_SECTION}")

    # 支持 MD_PATH 为单个 .md 或文件夹（递归）
    chunks = gather_chunks(md_path)
    
    # 是否使用LLM生成主题（设置为True启用，False使用规则提取）
    use_llm_topics = True  # 改为 True 可启用LLM主题生成
    embed_and_save(chunks, out_dir, generate_topics=use_llm_topics)
