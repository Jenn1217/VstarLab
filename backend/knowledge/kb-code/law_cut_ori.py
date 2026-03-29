# 添加了数据的清洗函数
import json
import re
from pathlib import Path
from unstructured.partition.auto import partition
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.docstore.document import Document
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
import os
from transformers import pipeline

import requests
import time
import json

from pathlib import Path
from typing import List, Dict, Any
import re

# 推荐：在系统安装 Tesseract 并启用中文语言包（chi_sim）
# macOS: brew install tesseract && brew install tesseract-lang
# Ubuntu: apt-get install tesseract-ocr && apt-get install tesseract-ocr-chi-sim
##############################清洗数据2#####################################
#1) 坐标排序与类别过滤- 只保留正文类别（NarrativeText、ListItem、Text），
# 跳过 Header/Footer/Title 在预览阶段，避免“标题重复”。后续做条款切分时再单独从正文里提取标题。

from typing import Tuple
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
    return (0.0, 1e9)  # 没有坐标时，放在页面底部

def _category(el) -> str:
    # Unstructured 元素通常有 .category，如 "Title", "NarrativeText", "ListItem"
    return getattr(el, "category", "") or getattr(getattr(el, "metadata", {}), "category", "") or ""

'''def sort_and_filter_elements(elements):
    # 按页号、y（从上到下）、x（从左到右）排序
    elements = sorted(elements, key=lambda e: (_get_page_no(e), _get_xy(e)[1], _get_xy(e)[0]))
    keep_cats = {"NarrativeText", "ListItem", "Text"}  # 预览/拼接正文优先这几类
    cleaned = []
    for el in elements:
        cat = _category(el)
        t = getattr(el, "text", "") or ""
        if not t.strip():
            continue
        # 跳过明显的页眉页脚类别
        if cat in {"Header", "Footer"}:
            continue
        cleaned.append(el)
    return cleaned'''

def _is_page_marker_text(t: str) -> bool:
    s = t.strip()
    # 典型页码行：第 5 页、共 12 页、5/12、5 / 12、Page 5 of 12
    if re.fullmatch(r"第\s*\d+\s*页(\s*[/／]\s*共\s*\d+\s*页)?", s):
        return True
    if re.fullmatch(r"共\s*\d+\s*页", s):
        return True
    if re.fullmatch(r"\d{1,3}\s*[/／]\s*\d{1,3}", s):
        return True
    if re.fullmatch(r"Page\s*\d+(\s*of\s*\d+)?", s, flags=re.I):
        return True
    return False

def sort_and_filter_elements(elements):
    elements = sorted(elements, key=lambda e: (_get_page_no(e), _get_xy(e)[1], _get_xy(e)[0]))
    keep_cats = {"NarrativeText", "ListItem", "Text"}
    cleaned = []
    for el in elements:
        cat = _category(el)
        t = getattr(el, "text", "") or ""
        if not t.strip():
            continue
        # 跳过页眉页脚类别
        if cat in {"Header", "Footer"}:
            continue
        # 跳过页码元素（不论类别）
        if _is_page_marker_text(t):
            continue
        cleaned.append(el)
    return cleaned

#2) 全局噪声行过滤（不依赖位置）- 无论在页的任何位置，匹配 URL、报头、页码、日期都去掉。
def remove_noise_lines(text: str) -> str:
    lines = text.splitlines()
    out = []
    for ln in lines:
        s = ln.strip()
        # URL/域名（包括“httpswww”这种 OCR 异形）
        if re.search(r"(https?[:／/\\]|httpswww|gov\.cn|中国政府网|gongbao|content_\d+)", s, re.I):
            continue
        # 报头/抬头
        if re.search(r"(中华人民共和国财政部令|国务院公报|金融企业财务规则)", s):
            continue
        # 页码/纯数字行
        if re.fullmatch(r"\d{1,4}", s):
            continue
        # 日期/时间戳
        if re.fullmatch(r"\d{4}[/-]\d{1,2}[/-]\d{1,2}(\s+\d{2}:\d{2})?", s):
            continue
        out.append(ln)
    return "\n".join(out)

#  句末标点不完善时合并下一行；相邻重复的“第X条”去重。
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
        # 相邻重复标题句去重（“第二十一条 第二十一条 …”）
        line = re.sub(r"(第\s*[一二三四五六七八九十百零〇]+\s*条)\s*\1", r"\1", line)
        if not buf:
            buf = line
        else:
            if buf[-1] in CN_END or re.match(r"^第\s*[一二三四五六七八九十百零〇]+\s*条", line):
                out.append(buf)
                buf = line
            else:
                # 无句末标点，直接拼接（去掉硬换行导致的断词）
                buf += line
    if buf:
        out.append(buf)
    return "\n".join(out)


def partition_file(path: Path):
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        from unstructured.partition.pdf import partition_pdf
        elements = partition_pdf(
            filename=str(path),
            strategy="hi_res",             # 更强版面分析
            include_page_breaks=True,      # 保留分页信息
            ocr_strategy="auto",           # 扫描件自动OCR
            languages=["chi_sim"],         # 中文OCR
            infer_table_structure=False    # 如需表格结构，可改为 True（可能更慢）
        )
        return elements
    elif suffix in [".docx", ".doc"]:
        from unstructured.partition.docx import partition_docx
        elements = partition_docx(filename=str(path))
        return elements
    else:
        # 其他类型仍用 auto
        from unstructured.partition.auto import partition
        return partition(filename=str(path), strategy="auto")

def normalize_line(s: str) -> str:
    # 归一化行用于重复判定：去多余空白、统一数字格式等
    s = s.strip()
    s = re.sub(r"\s+", " ", s)
    # 页码常见模式“第 5 页”、“Page 3 of 10”，可进一步归一化
    s = re.sub(r"第\s*\d+\s*页", "第#页", s)
    s = re.sub(r"Page\s*\d+(\s*of\s*\d+)?", "Page#", s, flags=re.I)
    return s

def remove_headers_footers(elements, top_n: int = 2, bottom_n: int = 2, min_repeat_ratio: float = 0.3):
    """
    基于重复行的页眉/页脚剔除：
    - 取每页前 top_n 和后 bottom_n 行作为候选
    - 出现频率 >= min_repeat_ratio 的候选视为页眉/页脚
    - 从每页对应位置剔除这些候选
    """
    # 组织为 {page_number: [element_texts]}
    pages: Dict[int, List[Any]] = {}
    for el in elements:
        # Unstructured 元素通常有 .text 和 .metadata.page_number
        try:
            page_no = getattr(el, "metadata", {}).get("page_number", None)
        except Exception:
            page_no = None
        txt = getattr(el, "text", None) or str(el)
        if page_no is None:
            # 没有页号的元素放在特殊页 -1
            pages.setdefault(-1, []).append((el, txt))
        else:
            pages.setdefault(page_no, []).append((el, txt))

    # 收集候选头尾
    header_counts = {}
    footer_counts = {}
    total_pages = len([p for p in pages.keys() if p != -1]) or 1

    for pno, items in pages.items():
        if pno == -1 or not items:
            continue
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

    # 过滤：仅在每页的前 top_n/后 bottom_n 位置剔除这些重复文本
    cleaned_elements = []
    for pno, items in pages.items():
        if pno == -1:
            cleaned_elements.extend([el for el, _ in items])
            continue
        head_idx = set(range(min(top_n, len(items))))
        tail_idx = set(range(max(0, len(items) - bottom_n), len(items)))
        for idx, (el, txt) in enumerate(items):
            key = normalize_line(txt)
            # 在头部且匹配重复头；或在尾部且匹配重复尾 -> 跳过
            if idx in head_idx and key in header_set:
                continue
            if idx in tail_idx and key in footer_set:
                continue
            cleaned_elements.append(el)

    return cleaned_elements

# === 文档加载：分类型解析 + 页眉页脚剔除 ===
def load_documents(file_paths: List[Path]):
    docs = []
    for path in file_paths:
        elements = partition_file(path)
        elements = remove_headers_footers(elements, top_n=2, bottom_n=2, min_repeat_ratio=0.3)
        elements = sort_and_filter_elements(elements)  # 新增：排序 + 类别过滤

        text_parts = []
        for el in elements:
            t = getattr(el, "text", None)
            if not t:
                continue  # 不再 str(el)，避免把类型/坐标串进正文
            text_parts.append(t)

        text = "\n".join(text_parts)
        text = remove_noise_lines(text)      # 新增：全局噪声过滤
        text = merge_lines_smart(text)       # 新增：断行合并
        text = clean_text(text)              # 原有：轻量清洗

        docs.append(Document(page_content=text, metadata={"source": path.name}))
    return docs
'''
def load_documents(file_paths: List[Path]):
    docs = []
    for path in file_paths:
        elements = partition_file(path)
        # 剔除页眉页脚（仅对 PDF 有分页意义，其他类型同样执行也无害）
        elements = remove_headers_footers(elements, top_n=2, bottom_n=2, min_repeat_ratio=0.3)

        # 拼接为纯文本时，优先用 element.text
        text_parts = []
        for el in elements:
            t = getattr(el, "text", None)
            if not t:
                t = str(el)
            text_parts.append(t)
        text = "\n".join(text_parts)

        docs.append(Document(page_content=text, metadata={"source": path.name}))
    return docs
'''

# === 更温和的清洗：避免误删有效字符 ===
'''def clean_text(text: str) -> str:
    # 去回车，统一空白，压缩多余空行
    text = text.replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # 不再用“删除非中英文”的大杀器，避免删掉《》—·/% 等在法规里常见的字符
    return text.strip()'''

import re

RE_ART = re.compile(r"^(第\s*[一二三四五六七八九十百零〇]+\s*条)(?:\s*(.*))?$")
CN_END = "。！？；：…）】》」』”'\"、"

def clean_text(text: str) -> str:
    # 轻量预处理：不删字符，只规范空白
    text = text.replace("\r", "")
    lines = text.splitlines()

    # 逐行规范空白，保留单个空行
    norm = [re.sub(r"[ \t]+", " ", ln).rstrip() for ln in lines]

    out = []
    i = 0
    while i < len(norm):
        line = norm[i]
        if not line.strip():
            # 折叠多空行为一个空行
            if out and out[-1] != "":
                out.append("")
            i += 1
            continue

        m = RE_ART.match(line.strip())
        if m:
            # 命中“第X条”
            title = re.sub(r"\s+", "", m.group(1))  # 统一为“第二十四条”这种无空格
            rest = (m.group(2) or "").strip()
            if not rest:
                # 标题行后紧跟的第一行正文并入同一行（只吸收一行）
                j = i + 1
                while j < len(norm) and not norm[j].strip():
                    j += 1
                if j < len(norm):
                    rest = norm[j].strip()
                    i = j  # 消耗这一行
            merged = f"{title} {rest}".strip()
            out.append(merged)
            i += 1
            continue

        # 普通行：若上一行未以中文句末/停顿符号结束，则直接拼接（修复断行）
        if out and out[-1] and out[-1][-1] not in CN_END:
            out[-1] = out[-1] + line.strip()
        else:
            out.append(line.strip())
        i += 1

    # 去除文首文尾空白并返回
    return "\n".join(out).strip()

##############################清洗数据2#####################################


# ==================== 配置区 ====================
API_HOST = "api.deepseek.com"
API_KEY = "sk-75c082ab38ae4d22be02ff1870edf7f2"
#MODEL = "gpt-5"
MODEL = "deepseek-chat"
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
    topics = []
    url = f"https://{API_HOST}/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }

    for idx, c in enumerate(chunks):
        text = c.page_content.strip()
        # 控制输入长度，避免触发 provider 的截断或报错
        if len(text) > 1200:
            text = text[:1200] + "……（以下内容省略）"

        # 更短、更明确的提示词，避免长输出
        prompt = (
            "请从下面文本中提炼一个简短的中文主题（2-8字），"
            "只输出主题本身，不要任何解释或标点：\n\n"
            f"{text}"
        )

        # 对推理型模型，显式指定文本输出格式和输出 token 上限
        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": "你是一名中文知识工程师，只输出主题，不加任何额外字符。"},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2,
            "top_p": 0.9,
            "response_format": {"type": "text"},   # 关键：强制文本输出
            "max_output_tokens": 32                # 关键：限制最终输出的 token（而非总 max_tokens）
        }

        # 如果某些模型不识别 max_output_tokens/response_format，我们在失败时降级重试
        fallback_payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": "你是一名中文知识工程师，只输出主题，不加任何额外字符。"},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2,
            "top_p": 0.9,
            "max_tokens": 64                       # 传统字段，作为降级
        }

        topic = ""
        for attempt in range(max_retry):
            try:
                resp = requests.post(url, headers=headers, json=payload, timeout=60)
                if resp.status_code != 200:
                    # 对部分 400/422 错误降级使用 fallback
                    if resp.status_code in (400, 422):
                        print(f"⚠️ API错误 {resp.status_code}（可能不支持 response_format/max_output_tokens），尝试降级重试")
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

                # 有些推理模型可能返回空 + finish_reason=length，这里直接重试或降级
                if not cleaned:
                    fr = choices[0].get("finish_reason")
                    print(f"⚠️ 第 {idx+1} 次解析为空（finish_reason={fr}），原始片段：{raw!r}，重试中 ({attempt+1}/{max_retry})")
                    time.sleep(sleep_time)
                    continue

                topic = cleaned
                print(f"✅ 第 {idx+1} 个主题生成成功：{topic}")
                break

            except Exception as e:
                # 打印有助排查的响应片段
                snippet = ""
                try:
                    snippet = resp.text[:300]
                except:
                    pass
                print(f"⚠️ 请求/解析异常：{e}（第 {attempt+1} 次尝试） 响应片段：{snippet}")
                time.sleep(sleep_time)

        if not topic:
            topic = "未知主题"
            print(f"❌ 第 {idx+1} 个主题生成失败，标记为‘未知主题’")

        topics.append(topic)
        time.sleep(0.4)

    return topics

def generate_topics_with_llm(chunks, max_retry=3, sleep_time=0.8):
    topics = []
    url = f"https://{API_HOST}/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }

    for idx, c in enumerate(chunks):
        text = c.page_content.strip()
        # 控制输入长度，避免触发 provider 的截断或报错
        if len(text) > 1200:
            text = text[:1200] + "……（以下内容省略）"

        # 更短、更明确的提示词，避免长输出
        prompt = (
            "请从下面文本中提炼一个简短的中文主题（2-8字），"
            "只输出主题本身，不要任何解释或标点：\n\n"
            f"{text}"
        )

        # 对推理型模型，显式指定文本输出格式和输出 token 上限
        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": "你是一名中文知识工程师，只输出主题，不加任何额外字符。"},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2,
            "top_p": 0.9,
            "response_format": {"type": "text"},   # 关键：强制文本输出
            "max_output_tokens": 32                # 关键：限制最终输出的 token（而非总 max_tokens）
        }

        # 如果某些模型不识别 max_output_tokens/response_format，我们在失败时降级重试
        fallback_payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": "你是一名中文知识工程师，只输出主题，不加任何额外字符。"},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2,
            "top_p": 0.9,
            "max_tokens": 64                       # 传统字段，作为降级
        }

        topic = ""
        for attempt in range(max_retry):
            try:
                resp = requests.post(url, headers=headers, json=payload, timeout=60)
                if resp.status_code != 200:
                    # 对部分 400/422 错误降级使用 fallback
                    if resp.status_code in (400, 422):
                        print(f"⚠️ API错误 {resp.status_code}（可能不支持 response_format/max_output_tokens），尝试降级重试")
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

                # 有些推理模型可能返回空 + finish_reason=length，这里直接重试或降级
                if not cleaned:
                    fr = choices[0].get("finish_reason")
                    print(f"⚠️ 第 {idx+1} 次解析为空（finish_reason={fr}），原始片段：{raw!r}，重试中 ({attempt+1}/{max_retry})")
                    time.sleep(sleep_time)
                    continue

                topic = cleaned
                print(f"✅ 第 {idx+1} 个主题生成成功：{topic}")
                break

            except Exception as e:
                # 打印有助排查的响应片段
                snippet = ""
                try:
                    snippet = resp.text[:300]
                except:
                    pass
                print(f"⚠️ 请求/解析异常：{e}（第 {attempt+1} 次尝试） 响应片段：{snippet}")
                time.sleep(sleep_time)

        if not topic:
            topic = "未知主题"
            print(f"❌ 第 {idx+1} 个主题生成失败，标记为‘未知主题’")

        topics.append(topic)
        time.sleep(0.4)

    return topics

# === 1. 文档加载 ===
'''
def load_documents(file_paths):
    docs = []
    for path in file_paths:
        elements = partition(filename=str(path), strategy="auto")
        text = "\n".join([str(el) for el in elements])
        docs.append(Document(page_content=text, metadata={"source": path.name}))
    return docs
'''

# === 2. 清洗 ===
'''
def clean_text(text):
    text = re.sub(r'\n\s*\n', '\n\n', text)
    text = re.sub(r'[^\u4e00-\u9fff\w\s\.\，\。\！\？\（\）\、\；\：]', '', text)
    return text.strip()
'''


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
    for i, raw in enumerate(chunks_raw):
        raw_str = str(raw).strip()
        if len(raw_str) > 50:
            title_match = re.match(
                r'(第[零一二三四五六七八九十百千]+[章条款节项号]?|[一二三四五六七八九十]+[、]|\d+[.)、]|[ivxlcdm]+[.)、])', 
                raw_str
            )
            metadata = {
                "source": doc.metadata["source"],
                "chunk_type": "rule",
                "chunk_id": i,
                "title": title_match.group(1) if title_match else "无标题"
            }
            chunks.append(Document(page_content=raw_str, metadata=metadata))
    return chunks

# === 4. Embedding 模块 ===
def embed_chunks(chunks, model_name="/Users/renzhenni/Library/Mobile Documents/com~apple~CloudDocs/llm/embedding/local_bge_small", device="mps"):
    print(f"\n🧠 [Embedding] 使用模型：{model_name}")
    model = SentenceTransformer(model_name, device=device)
    texts = [c.page_content for c in chunks]
    print(f"🚀 开始生成 embedding，共 {len(texts)} 个文本块 ...")
    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)
    print("✅ embedding 生成完成！")
    return embeddings

# === 5. 生成主题标签 (Topic) ===
def generate_topics(chunks):
    topic_gen = pipeline("text-classification", model="uer/roberta-base-finetuned-jd-binary-chinese", top_k=None)
    topics = []
    for c in chunks:
        text = c.page_content[:200]  # 提取开头部分生成主题
        try:
            result = topic_gen(text)
            topic = result[0]['label'] if result else "未知主题"
            
        except Exception:
            topic = "未知主题"
        topics.append(topic)
    return topics

# === 6. FAISS 索引保存 ===
def save_faiss(embeddings, output_path="faiss_index.bin"):
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings)
    faiss.write_index(index, output_path)
    print(f"✅ FAISS index saved: {output_path}")

# === 7. 导出 JSON（新增 embedding_model + topic） ===
def export_json(chunks, topics, embedding_model_name, output="chunks7.json"):
    data = []
    for i, c in enumerate(chunks):
        md = c.metadata.copy()
        md["embedding_model"] = embedding_model_name
        md["topic"] = topics[i]
        data.append({
            "id": c.metadata.get("chunk_id", i),
            "title": c.metadata.get("title", "无"),
            "text": c.page_content,
            "full_len": len(c.page_content),
            "metadata": md
        })
    with open(output, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ Exported {len(chunks)} chunks → {output}")

# === RUN ===
ROOT_FOLDER = Path("/Users/renzhenni/kb/合规问题与政策指引")
# === RUN ===
if __name__ == "__main__":
    # 使用 glob() 方法递归查找文件夹及其子文件夹中的所有 .pdf 和 .docx 文件
    # **/*.* 表示在当前目录下及其所有子目录中查找所有文件
    
    # 查找所有 .pdf 文件
    pdf_files = list(ROOT_FOLDER.glob("**/*.pdf"))
    # 查找所有 .docx 文件
    docx_files = list(ROOT_FOLDER.glob("**/*.docx"))
    
    # 将所有找到的文件列表合并
    files = pdf_files + docx_files
    
    if not files:
        print(f"⚠️ 警告：在目录 {ROOT_FOLDER} 及其子目录中未找到任何 .pdf 或 .docx 文件。")
    else:
        print(f"✅ 成功找到 {len(files)} 个文件进行处理。")
        
    docs = load_documents(files)
    all_chunks = []
    for doc in docs:
        print(f"\n🔥 处理: {doc.metadata['source']}")
        chunks = chunk_rule_based(doc)
        print(f"   → 切出 {len(chunks)} 块")
        all_chunks.extend(chunks)

    # === 生成 embedding + topic ===
    embedding_model_path = "/Users/renzhenni/Library/Mobile Documents/com~apple~CloudDocs/llm/embedding/local_bge_small"
    embeddings = embed_chunks(all_chunks, model_name=embedding_model_path)
    
    # 示例：规则提取，可替换为 generate_topics()
    #topics = ["担保与风险控制" if "担保" in c.page_content else "其他" for c in all_chunks] 
    topics = generate_topics_with_llm(all_chunks)

    # === 保存 ===
    # 确保在处理完所有文件后进行保存
    if all_chunks:
        save_faiss(np.array(embeddings))
        export_json(all_chunks, topics, embedding_model_path)
        print("\n🎉 所有文件处理完毕，数据已保存。")
    else:
        print("\n❌ 未生成任何数据块，跳过保存步骤。")
'''if __name__ == "__main__":
    files = [
        #Path("/Volumes/Elements/zsk2/企业会计准则第1号——存货（2006）.docx"),
        #Path("/Volumes/Elements/zsk2/testpage5.pdf"),
        #Path("/Volumes/Elements/zsk2/kk/企业会计准则及最新解释/企业会计准则第33号——合并财务报表（2014）.docx"),
        Path("/Volumes/Elements/zsk2/kk/企业会计准则及最新解释/企业会计准则解释/企业会计准则解释/企业会计准则解释第13号.pdf"),
        #Path("/Volumes/Elements/zsk2/金融企业财务规则.pdf")
    ]
    
    docs = load_documents(files)
    all_chunks = []
    for doc in docs:
        print(f"\n🔥 处理: {doc.metadata['source']}")
        chunks = chunk_rule_based(doc)
        print(f"   → 切出 {len(chunks)} 块")
        all_chunks.extend(chunks)

    # === 生成 embedding + topic ===
    embedding_model_path = "/Users/renzhenni/Library/Mobile Documents/com~apple~CloudDocs/llm/embedding/local_bge_small"
    embeddings = embed_chunks(all_chunks, model_name=embedding_model_path)
    topics = ["担保与风险控制" if "担保" in c.page_content else "其他" for c in all_chunks]  # 示例：规则提取，可替换为 generate_topics()
    #topics = generate_topics_with_llm(all_chunks)

    # === 保存 ===
    save_faiss(np.array(embeddings))
    export_json(all_chunks, topics, embedding_model_path)
'''