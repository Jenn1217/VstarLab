import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# 优先加载 backend 目录下的 .env，避免受启动目录影响
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "Missing DATABASE_URL. Please set it in backend/.env or system environment."
    )

# 创建 SQLAlchemy 引擎
engine = create_engine(
    DATABASE_URL,
    pool_recycle=3600,
)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 获取数据库的依赖函数
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
