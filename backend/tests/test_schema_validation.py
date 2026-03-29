
import unittest
import sys
import os
import json
from unittest.mock import MagicMock

# ==================== Mocking Dependencies ====================
sys.modules["langchain_core"] = MagicMock()
sys.modules["langchain_core.messages"] = MagicMock()
sys.modules["langchain_core.prompts"] = MagicMock()
sys.modules["langchain_core.runnables"] = MagicMock()
sys.modules["langgraph"] = MagicMock()
sys.modules["langgraph.graph"] = MagicMock()
sys.modules["langgraph.graph.message"] = MagicMock()
sys.modules["langgraph.checkpoint.memory"] = MagicMock()
sys.modules["stream_context"] = MagicMock()
sys.modules["requests"] = MagicMock() # Mock requests too
sys.modules["pymysql"] = MagicMock()
sys.modules["pymysql.cursors"] = MagicMock()

# Add the directory containing before/run3.py to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../before')))

# Now import the functions to test
from run3 import validate_and_rewrite_intent, validate_intent, build_sql_from_intent

class TestSchemaValidation(unittest.TestCase):
    def test_rewrite_fields(self):
        # Case 1: Rewrite 'acct_no' to 'acct_num' and 'txn_date' to 'acg_dt'
        intent_data = {
            "intent": "query_balance",
            "table": "acct_bal_new2", # Short name
            "filters": {
                "acct_no": "12345678", # Synonym
                "txn_date": "2023-01-01" # Synonym
            }
        }
        
        normalized = validate_and_rewrite_intent(intent_data)
        
        self.assertEqual(normalized["table"], "sz_bank_b1.acct_bal_new2") # Should normalize table
        self.assertIn("acct_num", normalized["filters"])
        self.assertIn("acg_dt", normalized["filters"])
        self.assertNotIn("acct_no", normalized["filters"])
        
    def test_normalize_table_name(self):
        # Case 2: Normalize partial table name 'vchr_hist' to 'sz_bank_b2.vchr_hist'
        intent_data = {
            "intent": "query_latest_records",
            "table": "vchr_hist", # Short name
            "filters": {}
        }
        normalized = validate_and_rewrite_intent(intent_data)
        self.assertEqual(normalized["table"], "sz_bank_b2.vchr_hist")
        
    def test_invalid_table(self):
        # Case 3: Invalid table
        intent_data = {
            "intent": "query_balance",
            "table": "invalid_table",
            "filters": {}
        }
        with self.assertRaises(ValueError):
            validate_and_rewrite_intent(intent_data)
            
    def test_invalid_column(self):
        # Case 4: Column not in whitelist and not rewritable
        intent_data = {
            "intent": "query_balance",
            "table": "acct_bal_new2",
            "filters": {
                "some_random_column": "123"
            }
        }
        with self.assertRaises(ValueError) as cm:
            validate_and_rewrite_intent(intent_data)
        print(f"\nCaught expected error: {cm.exception}")
        
    def test_full_flow(self):
        # Case 5: Full validation flow
        intent_data = {
            "intent": "query_balance",
            "table": "acct_bal_new2", # Short name
            "filters": {
                "account": "88888888" # Synonym matches 'acct_num'
            }
        }
        
        # This calls validate_intent which calls validate_and_rewrite_intent
        validated = validate_intent(intent_data)
        
        self.assertEqual(validated["table"], "sz_bank_b1.acct_bal_new2")
        self.assertEqual(validated["filters"]["acct_num"], "88888888")
        
        # Check SQL generation
        sql, params = build_sql_from_intent(validated)
        print(f"\nGenerated SQL: {sql}")
        self.assertIn("FROM sz_bank_b1.acct_bal_new2", sql) # Should handle full name without double prefix
        self.assertIn("acct_num =", sql)
        self.assertNotIn("sz_bank.sz_bank_b1", sql) # Ensure no double prefix

if __name__ == '__main__':
    unittest.main()
