
import unittest
from typing import Optional

# ==================== MOCK of IntentManager Logic (Copied from before/run3.py) ====================
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
        k_keywords = ['是什么', '定义', '解释', '区别', '为什么', '怎么', '原理', '举例', '什么是']
        # Data triggers
        data_nouns = ['账号', '科目', '金额', '余额', '交易', '传票', '核对', '总分', '数据']
        data_verbs = ['看下', '帮我看', '拉一下', '出一下', '查询', '检索', '查', '查看', '获取', '明细', '列表', '合计']
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

# ==================== Tests ====================

class TestIntentRecognition(unittest.TestCase):
    def test_intents(self):
        test_cases = [
            # 1. Data: 口语动词 + 名词
            ("帮我看下账号余额", {}, "data"),
            
            # 2. Data: 帮我看 + 维度(暗示)
            ("帮我看下", {"account_number": "123"}, "data"),
            
            # 3. Data: 疑问句触发 + 数据名词
            ("最新余额是多少", {}, "data"),
            
            # 4. Data: 上一轮Data + 本轮有维度 (多轮继承)
            ("有没有异常", {
                "intent_history": ["data"],
                "account_number": "123", # Has dimension
                "dimension_memory": {"account_number": "123"}
            }, "data"),
            
            # 5. Data: 表名触发
            ("查一下 vchr_hist 表", {}, "data"),
            
            # 6. Knowledge: 数据名词 + 定义提问 (优先 Knowledge)
            ("余额是什么意思", {}, "knowledge"),
            
            # 7. Knowledge: 纯定义提问
            ("什么是会计准则", {}, "knowledge"),
            
            # 8. Knowledge: 解释原理
            ("这个原理是什么", {}, "knowledge"),
            
            # 9. Knowledge: 区别
            ("总分核对和明细核对的区别", {}, "knowledge"),
            
            # 10. Chitchat: 纯闲聊
            ("今天天气不错", {}, "chitchat"),
            
            # 11. Chitchat: 问候
            ("早上好", {}, "chitchat"),
            
            # 12. Mix/Edge: Data noun but no verb/question/context -> uncertain (LLM) or chitchat?
            # Existing logic: if has_noun but no other trigger -> uncertain (None)
            ("余额", {}, None),
            
            # 13. Mix: "去看下" (has '看下') + no noun -> Uncertain?
            # Verb list has '看下'. has_noun=False.
            # has_current_dim=False.
            # condition: (has_verb and (has_noun or has_current_dim))
            # So "去看下" -> None.
            ("去看下", {}, None),
             
            # 14. Data: "去看下" with context
            ("去看下", {"account_number": "123"}, "data"),
        ]
        
        print(f"\n{'Input':<30} | {'Expected':<10} | {'Actual':<10} | {'Result'}")
        print("-" * 65)
        
        for text, state, expected in test_cases:
            intent, is_noise, _ = IntentManager.detect_intent(text, state)
            
            actual = intent
            status = "PASS" if actual == expected else "FAIL"
            print(f"{text:<30} | {str(expected):<10} | {str(actual):<10} | {status}")
            
            self.assertEqual(actual, expected, f"Input: {text}")

if __name__ == '__main__':
    unittest.main()
