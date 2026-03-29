from fastapi import FastAPI, HTTPException, Request
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import json
import asyncio
import sys
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
import queue
import threading
from langchain_core.messages import HumanMessage
import shutil
import uuid
from fastapi import File, UploadFile, Form
from langgraph.checkpoint.memory import MemorySaver

# Base directory for relative paths
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
KNOWLEDGE_DIR = BASE_DIR / "knowledge"
MODELS_DIR = BASE_DIR / "models"
PIC_ROOT = BASE_DIR / "pic"
KB_ROOT = KNOWLEDGE_DIR / "知识库完整内容"
KB_NEW_DIR = KNOWLEDGE_DIR / "kb-new"


# Add current directory to path to import run3
sys.path.append(str(BASE_DIR))

from run3 import create_accounting_agent, ModelPool, PerformanceMetrics, ContextMemoryMetrics
from learn import create_learning_agent

app = FastAPI()

# Static files directory
STATIC_DIR = BASE_DIR / "static"
if not STATIC_DIR.exists():
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Agent
print("Initializing Agent...")
model_pool = ModelPool.get_instance()
model_pool.set_backend("api") # Default to API

# Create shared memory checkpointer
shared_memory = MemorySaver()

# Pass shared checkpointer to both agents
agent = create_accounting_agent(checkpointer=shared_memory)
learning_agent = create_learning_agent(checkpointer=shared_memory)
print("Agent Initialized.")

import time
from typing import List, Dict, Optional

# ... (Imports remain the same)

import csv
# ... imports

# User Management
USERS = {}

def load_users():
    global USERS
    csv_path = DATA_DIR / "user_data.csv"
    if csv_path.exists():
        try:
            with open(csv_path, 'r', encoding='utf-8-sig', newline='') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Strip all keys and values to handle potential BOM or whitespace
                    clean_row = {str(k).strip(): str(v).strip() for k, v in row.items()}
                    
                    user = {
                        "name": clean_row.get("姓名"),
                        "id": clean_row.get("工号"),
                        "department": clean_row.get("部门"),
                        "email": clean_row.get("电子邮箱"),
                        "phone": clean_row.get("手机号码"),
                        "location": clean_row.get("办公地点"),
                        "bio": clean_row.get("个人简介"),
                        "security_level": clean_row.get("安全级别"),
                        "valid_until": clean_row.get("有效期至"),
                        "password": clean_row.get("登录密码"),
                        "title": "员工",
                        "avatarUrl": "https://ui-avatars.com/api/?name=" + clean_row.get("姓名", "User") + "&background=random"
                    }
                    if user["id"]:
                        USERS[user["id"]] = user
            print(f"✅ Successfully loaded {len(USERS)} users: {list(USERS.keys())}")
        except Exception as e:
            print(f"❌ Error loading users: {e}")
    else:
        print(f"⚠️ user_data.csv not found at {csv_path}")

load_users()

class LoginRequest(BaseModel):
    jobId: str
    password: str

@app.post("/api/login")
async def login(request: LoginRequest):
    # Strip whitespace to be robust against copy-paste errors
    job_id = request.jobId.strip()
    password = request.password.strip()
    
    print(f"🔑 Login attempt for jobId: '{job_id}'")
    user = USERS.get(job_id)
    if user:
        if user["password"] == password:
            print(f"✅ Login successful for {job_id}")
            # Return user info without password
            user_response = user.copy()
            del user_response["password"]
            return {"status": "success", "user": user_response}
        else:
            print(f"❌ Login failed for {job_id}: Password mismatch. Expected '{user['password']}', got '{password}'")
    else:
        print(f"❌ Login failed for {job_id}: User not found (Available: {list(USERS.keys())})")
        
    raise HTTPException(status_code=401, detail="Invalid credentials")

# ==================== Table Query API ====================
class TableQueryParams(BaseModel):
    tableName: str
    accountNum: Optional[str] = None
    orgNum: Optional[str] = None
    subjNum: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    page: int = 1
    pageSize: int = 20

from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import Depends
from db import get_db

@app.post("/api/query")
async def query_table(params: TableQueryParams, db_session: Session = Depends(get_db)):
    # Construct base SQL
    base_sql = f"FROM {params.tableName} WHERE 1=1"
    where_sql = ""
    args = {}
    
    if params.accountNum:
        where_sql += " AND acct_num = :accountNum"
        args["accountNum"] = params.accountNum
    if params.orgNum:
        where_sql += " AND org_num = :orgNum"
        args["orgNum"] = params.orgNum
    if params.subjNum:
        where_sql += " AND sbj_num = :subjNum"
        args["subjNum"] = params.subjNum
    
    # Date handling
    date_col = "acg_dt" 
    if params.tableName == "recon_bal":
        date_col = "dt_date"
    
    if params.startDate:
        where_sql += f" AND {date_col} >= :startDate"
        args["startDate"] = params.startDate
        
    if params.endDate:
        where_sql += f" AND {date_col} <= :endDate"
        args["endDate"] = params.endDate
        
    # 1. Get Total Count
    count_sql = text(f"SELECT COUNT(*) as total {base_sql} {where_sql}")
    print(f"Executing Count Query: {count_sql}")
    total = db_session.execute(count_sql, args).scalar()
        
    # 2. Get Data with Pagination
    offset = (params.page - 1) * params.pageSize
    args["limit"] = params.pageSize
    args["offset"] = offset
    data_sql = text(f"SELECT * {base_sql} {where_sql} LIMIT :limit OFFSET :offset")
    
    print(f"Executing Data Query: {data_sql}")
    results = db_session.execute(data_sql, args)
    
    columns = results.keys()
    final_results = []
    for i, row in enumerate(results.fetchall()):
        new_row = dict(zip(columns, row))
        # Handle datetime/bytes objects for JSON serialization
        for k, v in new_row.items():
            if hasattr(v, "isoformat"):
                new_row[k] = v.isoformat()
            elif isinstance(v, bytes):
                new_row[k] = v.decode("utf-8", errors="ignore")

        if 'id' not in new_row:
             new_row['id'] = f"row-{offset + i}-{uuid.uuid4()}"
        final_results.append(new_row)
        
    return {"total": total or 0, "data": final_results}


# History Manager Update
class ChatHistoryManager:
    def __init__(self, filepath=DATA_DIR / "chat_history.json"):
        self.filepath = filepath
        self.lock = threading.Lock()
        self.load()

    def load(self):
        if self.filepath.exists():
            try:
                with open(self.filepath, 'r', encoding='utf-8') as f:
                    self.data = json.load(f)
                if not isinstance(self.data, dict) or "sessions" not in self.data:
                    self.data = {"sessions": []}
            except Exception:
                self.data = {"sessions": []}
        else:
            self.data = {"sessions": []}

    def save(self):
        # Serialize in main thread to ensure data consistency
        try:
            data_str = json.dumps(self.data, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error serializing history: {e}")
            return

        def write_file():
            with self.lock: # Use lock for file access if needed, or just rely on OS. 
                # Actually, self.Lock was checking data integrity, but we serialized already.
                # But we might want to prevent concurrent writes to file.
                try:
                    with open(self.filepath, 'w', encoding='utf-8') as f:
                        f.write(data_str)
                except Exception as e:
                    print(f"Error saving history to file: {e}")

        # Run file I/O in separate thread to prevent blocking API responses
        # especially on iCloud Drive folders
        threading.Thread(target=write_file).start()

    def get_sessions(self, user_id: Optional[str] = None):
        # Filter sessions by user_id
        all_sessions = sorted(self.data["sessions"], key=lambda x: x.get("updated_at", 0), reverse=True)
        
        if user_id:
            # Return sessions for this user OR legacy sessions (no user_id)
            # This allows users to see their old history after we added auth
            return [s for s in all_sessions if s.get("user_id") == user_id or not s.get("user_id")]
        else:
            return all_sessions

    def get_session(self, session_id):
        for s in self.data["sessions"]:
            if s["id"] == session_id:
                return s
        return None

    def create_session(self, session_id, user_id=None, title="新对话"):
        session = {
            "id": session_id,
            "user_id": user_id,
            "title": title,
            "created_at": time.time(),
            "updated_at": time.time(),
            "messages": []
        }
        self.data["sessions"].append(session)
        self.save()
        return session
    
    def delete_session(self, session_id):
        initial_len = len(self.data["sessions"])
        self.data["sessions"] = [s for s in self.data["sessions"] if s["id"] != session_id]
        if len(self.data["sessions"]) < initial_len:
            self.save()
            return True
        return False

    def add_message(self, session_id, role, content, reasoning=None, user_id=None, chart_data=None):
        session = self.get_session(session_id)
        if not session:
            session = self.create_session(session_id, user_id)
        
        # Backfill user_id
        if user_id and not session.get("user_id"):
             session["user_id"] = user_id
        
        msg = {
            "role": role,
            "content": content,
            "timestamp": time.time()
        }
        if reasoning:
            msg["reasoning"] = reasoning
        
        if chart_data:
            msg["chartData"] = chart_data
            
        session["messages"].append(msg)
        session["updated_at"] = time.time()
        
        if role == "user" and len([m for m in session["messages"] if m["role"] == "user"]) == 1:
            session["title"] = content[:20] + ("..." if len(content) > 20 else "")
            
        self.save()

    def rename_session(self, session_id, new_title):
        session = self.get_session(session_id)
        if session:
            session["title"] = new_title
            self.save()
            return True
        return False

history_manager = ChatHistoryManager()

# API Endpoints
@app.get("/api/history")
async def get_history(userId: Optional[str] = None):
    sessions = history_manager.get_sessions(user_id=userId)
    if userId:
        favorites = load_favorites()
        user_favs = favorites.get(userId, {})
        # Safety check for sessions key
        fav_sessions = user_favs.get("sessions", [])
        
        for session in sessions:
            if session["id"] in fav_sessions:
                session["is_favorite"] = True
            else:
                session["is_favorite"] = False
    return sessions

@app.get("/api/history/{session_id}")
async def get_session_endpoint(session_id: str):
    session = history_manager.get_session(session_id)
    if session:
        return session
    raise HTTPException(status_code=404, detail="Session not found")

@app.delete("/api/history/{session_id}")
async def delete_session_endpoint(session_id: str):
    if history_manager.delete_session(session_id):
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Session not found")

class RenameRequest(BaseModel):
    title: str

@app.put("/api/history/{session_id}")
async def rename_session_endpoint(session_id: str, request: RenameRequest):
    if history_manager.rename_session(session_id, request.title):
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Session not found")

class ChatRequest(BaseModel):
    message: str
    sessionId: str = "default"
    userId: Optional[str] = None
    model: str = "gemini-2.5-flash"
    functionMode: Optional[str] = None

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    print(f"Received request: {request.message} session: {request.sessionId} user: {request.userId}")
    
    history_manager.add_message(request.sessionId, "user", request.message, user_id=request.userId)


    # Handle Fine-tuned Model
    # Logic now unified: we pass model choice to run3.py
    # if request.model == "gemini-3-pro-preview": 
    #    pass # fall through to Standard Model Logic but with flag checked below
    
    # Standard Model Logic (DeepSeek Agent)
    q = queue.Queue()
    
    def stream_handler(chunk):
        q.put(chunk)
        
    def run_agent():
        try:
            import stream_context
            stream_context.set_stream_handler(stream_handler)
            
            # ... (Agent invocation logic remains same)
            # Determine model selection
            model_selection = "fine_tuned" if request.model == "gemini-3-pro-preview" else "default"
            
            inputs = {
                "messages": [HumanMessage(content=request.message)],
                "function_mode": request.functionMode,
                "model_selection": model_selection
            }
            config = {"configurable": {"thread_id": request.sessionId}}
            
            if request.functionMode == 'wenzhi':
                 learning_agent.invoke(inputs, config)
            else:
                 agent.invoke(inputs, config)
        except Exception as e:
            print(f"Error in agent thread: {e}")
            q.put({"type": "error", "content": str(e)})
        finally:
            q.put(None) # Sentinel

    thread = threading.Thread(target=run_agent)
    thread.start()

    async def event_generator():
        full_content = ""
        full_reasoning = ""
        captured_chart_data = None
        
        while True:
            try:
                chunk = await asyncio.to_thread(q.get)
                if chunk is None:
                    break
                
                if isinstance(chunk, dict):
                    if chunk.get('type') == 'content':
                        full_content = chunk.get('full_content', full_content + chunk.get('content', ''))
                    elif chunk.get('type') == 'reasoning':
                        full_reasoning = chunk.get('full_reasoning', full_reasoning + chunk.get('content', ''))
                    elif chunk.get('type') == 'trend_chart':
                        # Capture chart data for persistence
                        # Make sure to wrap it in the expected schema { type: ..., data: ... }
                        # The chunk itself is { "type": "trend_chart", "data": {...} }
                        captured_chart_data = chunk.get('data') 
                        
                    yield json.dumps(chunk, ensure_ascii=False) + "\n"
                else:
                    yield json.dumps({"type": "content", "content": str(chunk)}, ensure_ascii=False) + "\n"
                    
            except Exception as e:
                print(f"Generator error: {e}")
                break
        
        # Save AI Response after generation is complete
        if full_content or captured_chart_data:
            history_manager.add_message(request.sessionId, "model", full_content, full_reasoning, chart_data=captured_chart_data)

    return StreamingResponse(event_generator(), media_type="text/plain")

# --- Knowledge Base Endpoints ---

# --- Knowledge Base Endpoints ---

# Knowledge Base Root
KB_ROOT = KB_ROOT
PIC_ROOT = PIC_ROOT

# System KBs (Immutable)
SYSTEM_KBS = {
    "1": {
        "id": "1",
        "title": "会计准则及解释",
        "description": "包含最新的企业会计准则、解释公告及应用指南",
        "directory": str(KB_ROOT / "会计准则及解释"),
        "is_system": True,
        "coverColor": "from-blue-400 to-blue-600"
    },
    "2": {
        "id": "2",
        "title": "银行会计相关教材",
        "description": "银行会计学基础理论与实务操作教材",
        "directory": str(KB_ROOT / "银行会计相关教材"),
        "is_system": True,
        "coverColor": "from-indigo-400 to-purple-600"
    },
    "3": {
        "id": "3",
        "title": "银行会计操作手册",
        "description": "详细的银行会计业务流程与操作规范",
        "directory": str(KB_ROOT / "银行会计操作手册"),
        "is_system": True,
        "coverColor": "from-emerald-400 to-teal-600"
    },
    "4": {
        "id": "4",
        "title": "合规问题与政策指引",
        "description": "银行会计业务合规风险提示与政策解读",
        "directory": str(KB_ROOT / "合规问题与政策指引"),
        "is_system": True,
        "coverColor": "from-orange-400 to-red-500"
    }
}

CUSTOM_KBS_FILE = DATA_DIR / "custom_kbs.json"
KB_NEW_DIR = KB_NEW_DIR

# Ensure kb-new directory exists
if not KB_NEW_DIR.exists():
    KB_NEW_DIR.mkdir(parents=True, exist_ok=True)

def load_custom_kbs():
    """
    仅加载可用的自定义知识库目录，避免迁移到新服务器后因为历史绝对路径失效导致异常数据污染。
    """
    if not CUSTOM_KBS_FILE.exists():
        return {}

    try:
        with open(CUSTOM_KBS_FILE, 'r', encoding='utf-8') as f:
            raw_kbs = json.load(f)
    except Exception:
        return {}

    if not isinstance(raw_kbs, dict):
        return {}

    sanitized = {}
    changed = False

    for kb_id, kb in raw_kbs.items():
        if not isinstance(kb, dict):
            changed = True
            continue

        directory = kb.get("directory")
        if not directory:
            changed = True
            continue

        kb_path = Path(directory)
        if not kb_path.exists():
            # 最小迁移策略：首发不迁移历史目录，自动跳过不可用目录
            changed = True
            continue

        sanitized[kb_id] = kb

    if changed:
        save_custom_kbs(sanitized)

    return sanitized

def save_custom_kbs(kbs):
    with open(CUSTOM_KBS_FILE, 'w', encoding='utf-8') as f:
        json.dump(kbs, f, ensure_ascii=False, indent=2)

def get_all_kbs():
    custom_kbs = load_custom_kbs()
    all_kbs = SYSTEM_KBS.copy()
    all_kbs.update(custom_kbs)
    return all_kbs

def get_kb_directory(kb_id):
    kbs = get_all_kbs()
    if kb_id in kbs:
        return kbs[kb_id]["directory"]
    return None

def check_kb_permission(kb_id, user_id):
    # System KBs are always visible/accessible
    if kb_id in SYSTEM_KBS:
        return True
        
    custom_kbs = load_custom_kbs()
    if kb_id not in custom_kbs:
        return False
        
    kb = custom_kbs[kb_id]
    visibility = kb.get("visibility", "PUBLIC").upper()
    owner_id = kb.get("owner_id")
    creator_id = kb.get("creator_id", owner_id) # Fallback to owner_id
    
    if visibility == "PUBLIC":
        return True
        
    # For private and department, we need a valid user
    if not user_id:
        return False
        
    user = USERS.get(user_id)
    if not user:
        return False
        
    if visibility == "PRIVATE":
        return creator_id == user_id
        
    if visibility == "DEPARTMENT":
        # Check if user is in same department as creator
        # 1. Try to get creator_department from KB (New logic)
        creator_department = kb.get("creator_department")
        
        # 2. If not in KB, fallback to looking up owner (Old logic backup)
        if not creator_department:
            owner = USERS.get(creator_id)
            if owner:
                creator_department = owner.get("department")
                
        # 3. Compare with current user's department
        if not creator_department:
            return False # Cannot determine department
            
        return user.get("department") == creator_department
        
    return False

@app.get("/api/kbs")
async def list_kbs(userId: Optional[str] = None):
    kbs = get_all_kbs()
    kb_list = []
    
    # Filter based on permissions
    for kb_id, kb in kbs.items():
        if check_kb_permission(kb_id, userId):
            kb_list.append(kb)

    # Sort: System KBs first, then by creation time
    kb_list.sort(key=lambda x: (not x.get("is_system", False), x.get("createdAt", 0)))

    # Calculate file counts
    for kb in kb_list:
        try:
            if Path(kb["directory"]).exists():
                kb_path = Path(kb["directory"])
                kb["fileCount"] = len([f for f in kb_path.iterdir() if f.is_file() and not f.name.startswith('.')])
            else:
                kb["fileCount"] = 0
        except:
            kb["fileCount"] = 0
            
    return kb_list

class CreateKBRequest(BaseModel):
    title: str
    description: str
    visibility: str
    userId: str

@app.post("/api/kbs")
async def create_kb(request: CreateKBRequest):
    custom_kbs = load_custom_kbs()
    
    # Permission Check
    user = USERS.get(request.userId)
    if not user:
        # Fallback for dev/test if strict user check is not desired, but requirement is strict about permissions
        # For now, let's enforce it.
        raise HTTPException(status_code=401, detail="User not identified")
        
    try:
        sec_level = int(user.get("security_level", 0))
    except:
        sec_level = 0
        
    if sec_level < 3:
        raise HTTPException(status_code=403, detail="Permission denied: Security level must be 3 or higher to create a Knowledge Base.")

    # Generate ID
    kb_id = str(uuid.uuid4())
    
    # Create directory
    safe_title = "".join([c for c in request.title if c.isalnum() or c in (' ', '-', '_')]).strip()
    if not safe_title:
        safe_title = "kb_" + kb_id[:8]
        
    directory = (KB_NEW_DIR / safe_title).resolve()
    if not directory.exists():
        directory.mkdir(parents=True, exist_ok=True)
    
    # Store directory as string for compatibility with other parts of the code
    directory_str = str(directory)
    
    # Normalize visibility
    visibility = request.visibility.upper()
    if visibility not in ["PRIVATE", "DEPARTMENT", "PUBLIC"]:
        visibility = "PUBLIC" # Default fallback
        
    new_kb = {
        "id": kb_id,
        "title": request.title,
        "description": request.description,
        "directory": directory_str,
        "is_system": False,
        "coverColor": "from-pink-400 to-rose-500", # Default color for new KBs
        "visibility": visibility,
        "owner_id": request.userId,
        "creator_id": request.userId,
        "creator_department": user.get("department", "Unknown"),
        "createdAt": time.time()
    }
    
    custom_kbs[kb_id] = new_kb
    save_custom_kbs(custom_kbs)
    
    return {"status": "success", "kb": new_kb}

@app.delete("/api/kbs/{kb_id}")
async def delete_kb(kb_id: str, userId: str): # Require userId for deletion check
    if kb_id in SYSTEM_KBS:
        raise HTTPException(status_code=403, detail="System KBs cannot be deleted")
        
    custom_kbs = load_custom_kbs()
    if kb_id not in custom_kbs:
        raise HTTPException(status_code=404, detail="KB not found")
        
    kb = custom_kbs[kb_id]
    
    # Permission Check: Only owner can delete
    # (Or admin if we had admins, but for now strict ownership)
    if kb.get("owner_id") != userId:
         raise HTTPException(status_code=403, detail="Permission denied: Only the owner can delete this Knowledge Base.")

    
    # Remove directory if it exists and is within KB_NEW_DIR (safety check)
    if Path(kb["directory"]).exists():
        # Verify it's inside kb-new to prevent deleting system folders
        if str(KB_NEW_DIR) in str(Path(kb["directory"]).resolve()):
             try:
                 shutil.rmtree(kb["directory"])
             except Exception as e:
                 print(f"Error deleting directory: {e}")
    
    del custom_kbs[kb_id]
    save_custom_kbs(custom_kbs)
    
    return {"status": "success"}

@app.get("/api/kb/{kb_id}/files")
async def get_kb_files(kb_id: str, userId: Optional[str] = None):
    if not check_kb_permission(kb_id, userId):
        raise HTTPException(status_code=403, detail="Access denied")

    directory = get_kb_directory(kb_id)
    kb_dir = Path(directory) if directory else None
    if not kb_dir or not kb_dir.exists():
        return []

    files = []
    try:
        # List all files in directory
        for file_path in kb_dir.iterdir():
            if file_path.is_file() and not file_path.name.startswith('.'):
                stats = file_path.stat()
                filename = file_path.name
                files.append({
                    "id": filename, # Use filename as ID for simplicity
                    "name": filename,
                    "type": file_path.suffix.lower().replace('.', ''),
                    "size": f"{stats.st_size / 1024:.1f} KB",
                    "uploadDate": time.strftime('2025-%m-%d', time.localtime(stats.st_mtime))
                })
    except Exception as e:
        print(f"Error listing files: {e}")
        return []
        
    return files

@app.post("/api/kb/{kb_id}/upload")
async def upload_file(kb_id: str, file: UploadFile = File(...), userId: str = Form(...)):
    if not check_kb_permission(kb_id, userId):
         raise HTTPException(status_code=403, detail="Access denied")

    # Security Check for System KBs: Only level >= 4 can upload
    if kb_id in SYSTEM_KBS:
        user = USERS.get(userId)
        try:
            sec_level = int(user.get("security_level", 0)) if user else 0
        except:
            sec_level = 0
            
        if sec_level < 4:
             raise HTTPException(status_code=403, detail="Permission denied: Security level insufficient for this Knowledge Base.")

    directory = get_kb_directory(kb_id)
    if not directory:
        raise HTTPException(status_code=404, detail="KB not found")
        
    kb_dir = Path(directory)
    if not kb_dir.exists():
        kb_dir.mkdir(parents=True, exist_ok=True)
        
    try:
        file_location = Path(directory) / file.filename
        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(file.file, file_object)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"info": f"file '{file.filename}' saved at '{file_location}'"}

@app.get("/api/kb/{kb_id}/file")
async def get_kb_file_content(kb_id: str, filename: str, userId: Optional[str] = None):
    if not check_kb_permission(kb_id, userId):
        raise HTTPException(status_code=403, detail="Access denied")
        
    directory = get_kb_directory(kb_id)
    if not directory:
        raise HTTPException(status_code=404, detail="KB not found")
    kb_dir = Path(directory)
    filepath = (kb_dir / filename).resolve()
    
    # Security check: prevent directory traversal
    if not filepath.is_relative_to(kb_dir.resolve()):
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"content": content}
    except UnicodeDecodeError:
         # Fallback for non-text files (or try different encoding)
         # For now, return a message saying it's binary
         return {"content": "(This appears to be a binary file, preview not available in text mode.)"}
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import FileResponse

@app.get("/api/kb/{kb_id}/file/raw")
async def get_kb_file_raw(kb_id: str, filename: str, userId: Optional[str] = None):
    if not check_kb_permission(kb_id, userId):
        raise HTTPException(status_code=403, detail="Access denied")

    directory = get_kb_directory(kb_id)
    if not directory:
        raise HTTPException(status_code=404, detail="KB not found")
    kb_dir = Path(directory)
    filepath = (kb_dir / filename).resolve()
    
    # Security check: prevent directory traversal
    if not filepath.is_relative_to(kb_dir.resolve()):
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(filepath)


# --- Favorites Management ---

FAVORITES_FILE = DATA_DIR / "user_favorites.json"
favorites_lock = threading.Lock()

def load_favorites():
    if FAVORITES_FILE.exists():
        try:
            with open(FAVORITES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_favorites(data):
    with favorites_lock:
        with open(FAVORITES_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

class ToggleFavoriteRequest(BaseModel):
    userId: str
    itemId: str
    itemType: str # 'kb' or 'message'

@app.post("/api/favorites/toggle")
async def toggle_favorite(request: ToggleFavoriteRequest):
    favorites = load_favorites()
    # Ensure all keys exist
    user_favs = favorites.get(request.userId, {"kbs": [], "messages": [], "files": [], "sessions": []})
    if "kbs" not in user_favs: user_favs["kbs"] = []
    if "messages" not in user_favs: user_favs["messages"] = []
    if "files" not in user_favs: user_favs["files"] = []
    if "sessions" not in user_favs: user_favs["sessions"] = [] # Add sessions support
    
    target_list = []
    if request.itemType == 'kb':
        target_list = user_favs["kbs"]
    elif request.itemType == 'message':
        target_list = user_favs["messages"]
    elif request.itemType == 'file':
        target_list = user_favs["files"]
    elif request.itemType == 'session':
        target_list = user_favs["sessions"]
    else:
        raise HTTPException(status_code=400, detail="Invalid item type")
        
    if request.itemId in target_list:
        target_list.remove(request.itemId)
        is_favorite = False
    else:
        target_list.append(request.itemId)
        is_favorite = True
        
    favorites[request.userId] = user_favs
    save_favorites(favorites)
    
    return {"status": "success", "isFavorite": is_favorite}

@app.get("/api/favorites")
async def get_favorites(userId: str):
    favorites = load_favorites()
    user_favs = favorites.get(userId, {"kbs": [], "messages": [], "files": [], "sessions": []})
    # Ensure keys exist for frontend safety
    if "kbs" not in user_favs: user_favs["kbs"] = []
    if "messages" not in user_favs: user_favs["messages"] = []
    if "files" not in user_favs: user_favs["files"] = []
    if "sessions" not in user_favs: user_favs["sessions"] = []
    return user_favs

# --- Local Database Endpoints ---
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import Depends
from db import get_db

@app.get("/db/health")
async def db_health(db: Session = Depends(get_db)):
    try:
        # 执行一个简单的查询测试连接
        result = db.execute(text("SELECT 1")).scalar()
        if result == 1:
            return {"status": "ok", "message": "Database connection is healthy"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")

@app.get("/tables")
async def list_tables(db: Session = Depends(get_db)):
    try:
        # 查询当前数据库所有的表名
        result = db.execute(text("SHOW TABLES"))
        tables = [row[0] for row in result.fetchall()]
        return {"status": "success", "tables": tables}
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Failed to fetch tables: {str(e)}")

@app.get("/acct_bal_new2")
async def query_acct_bal_new2(limit: int = 20, db: Session = Depends(get_db)):
    try:
        # 使用参数化查询优先，提取前N行
        sql = text("SELECT * FROM acct_bal_new2 LIMIT :limit")
        result = db.execute(sql, {"limit": limit})
        
        # 将结果转为字典的列表
        columns = result.keys()
        data = [dict(zip(columns, row)) for row in result.fetchall()]
        
        # 手动处理日期等无法直接 JSON 序列化的数据类型
        for item in data:
            for k, v in item.items():
                if hasattr(v, "isoformat"):
                    item[k] = v.isoformat()
                elif isinstance(v, bytes):
                    item[k] = v.decode("utf-8", errors="ignore")
        
        return {"status": "success", "count": len(data), "data": data}
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")

# --- Static File Hosting for Production ---

# Mount /assets so Vite-built JS/CSS/images are served at the correct paths
ASSETS_DIR = STATIC_DIR / "assets"
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

# Mount static root (for index.html and any other top-level static files)
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Mount pic directory for image assets
if PIC_ROOT.exists():
    app.mount("/pic", StaticFiles(directory=str(PIC_ROOT / "pic")), name="pic")

# Serve index.html for all other routes to support React SPA routing
@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    # Skip API routes - they should have been caught by the handlers above
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
        
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    
    return HTMLResponse(content="<h1>Backend is running</h1><p>Frontend build (index.html) not found in /static. Run <code>./prod.sh</code> to build.</p>")

if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("UVICORN_RELOAD", "true").lower() == "true"
    uvicorn.run("app:app", host=host, port=port, reload=reload)
