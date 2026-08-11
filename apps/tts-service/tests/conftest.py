"""conftest.py — cho phép test import trực tiếp module trong `server/`.

`server/` không phải package (main.py import `engine`, `voice_registry`… theo tên phẳng,
đúng cách PyInstaller spec đặt `pathex=[server_dir]`), nên test phải thêm thư mục đó vào
sys.path thay vì import theo đường dẫn có dấu chấm.
"""
import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent.parent / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))
