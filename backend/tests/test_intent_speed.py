import time
import json
import sys
import os
from pathlib import Path

# Add before directory to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent / "before"))

import run3
from run3 import IntentManager, IntentClassifier, ModelPool

def test_intent_speed():
    model_pool = ModelPool.get_instance()
    classifier = IntentClassifier.get_instance()
    
    test_cases = [
        # T1: 规则命中 - 数据
        {"text": "查下账号SZB001的余额", "expected": "data", "id": "T1"},
        # T2: 规则命中 - 知识
        {"text": "什么是资产负债表？", "expected": "knowledge", "id": "T2"},
        # T3: 上下文继承
        {"text": "那再看下12月20日的", "expected": "data", "id": "T3", "state": {"intent_history": ["data"], "account_number": "SZB001"}},
        # T4: LLM 推理
        {"text": "帮我分析下最近的风险情况", "expected": "data", "id": "T4"},
        # T5: 缓存验证 (重复 T4)
        {"text": "帮我分析下最近的风险情况", "expected": "data", "id": "T5"},
        # T6: 闲聊
        {"text": "你好呀，今天天气不错", "expected": "chitchat", "id": "T6"}
    ]

    print(f"{'ID':<5} | {'Path':<10} | {'Result':<10} | {'Time (ms)':<10} | {'Input'}")
    print("-" * 70)

    for case in test_cases:
        start = time.time()
        text = case["text"]
        state = case.get("state", {"intent_history": []})
        
        # 1. Try IntentManager (Rules/Context)
        intent, is_noise, is_nested = IntentManager.detect_intent(text, state)
        path = "Rule"
        
        # 2. If None, try Classifier (Cache/LLM)
        if intent is None:
            intent = classifier.classify(text, state)
            path = "LLM/Cache"
        
        duration = (time.time() - start) * 1000
        
        print(f"{case['id']:<5} | {path:<10} | {intent:<10} | {duration:>8.2f}ms | {text}")
        
        # Basic assertion
        if intent != case["expected"]:
            print(f"  [Error] Expected {case['expected']}, got {intent}")

if __name__ == "__main__":
    # Ensure ModelPool is initialized for API mode if needed, 
    # but here we just want to measure the logic flow.
    test_intent_speed()
