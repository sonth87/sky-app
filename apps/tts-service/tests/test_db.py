"""Test db.py — kết nối tới DB dùng chung, đúng nguyên tắc "không migrate, tự kiểm version".

Không đụng driver TypeScript thật (đó là việc của app-db's test suite) — chỉ dựng tối thiểu
schema_version + INSERT version để mô phỏng "Electron đã migrate xong tới đâu".
"""
import sqlite3

import pytest

import db


@pytest.fixture(autouse=True)
def reset_db_module_state(monkeypatch):
    """`db.connect()` cố ý chỉ thử 1 lần mỗi TIẾN TRÌNH rồi cache (kể cả thất bại) — đúng
    cho runtime thật (biến môi trường không đổi giữa chừng 1 phiên chạy), nhưng test cần
    mỗi case bắt đầu từ trạng thái sạch, nên reset thủ công 2 biến module-level."""
    monkeypatch.setattr(db, "_conn", None)
    monkeypatch.setattr(db, "_attempted", False)
    monkeypatch.delenv("SKY_APP_DB_PATH", raising=False)
    yield


def _make_db(path, schema_version: int, with_schema_version_table: bool = True):
    conn = sqlite3.connect(str(path))
    if with_schema_version_table:
        conn.execute("CREATE TABLE schema_version (version INTEGER PRIMARY KEY)")
        for v in range(1, schema_version + 1):
            conn.execute("INSERT INTO schema_version (version) VALUES (?)", (v,))
    conn.commit()
    conn.close()


def test_khong_co_env_tra_none():
    assert db.connect() is None


def test_env_rong_tra_none(monkeypatch):
    monkeypatch.setenv("SKY_APP_DB_PATH", "")
    assert db.connect() is None


def test_file_khong_ton_tai_tra_none(monkeypatch, tmp_path):
    monkeypatch.setenv("SKY_APP_DB_PATH", str(tmp_path / "khong-co-that.db"))
    assert db.connect() is None


def test_schema_qua_cu_tra_none(monkeypatch, tmp_path):
    """Electron đang chạy bản CŨ HƠN schema mà bản Python này cần — từ chối dùng SQL thay vì
    đọc nhầm một bảng chưa tồn tại."""
    dbfile = tmp_path / "sky-app.db"
    _make_db(dbfile, schema_version=db.REQUIRED_SCHEMA_VERSION - 1)
    monkeypatch.setenv("SKY_APP_DB_PATH", str(dbfile))
    assert db.connect() is None


def test_khong_co_bang_schema_version_tra_none(monkeypatch, tmp_path):
    """File .db tồn tại nhưng chưa từng được Electron migrate (không nên xảy ra vì spawn()
    luôn sau bootstrap — nhưng không tin tưởng suông)."""
    dbfile = tmp_path / "sky-app.db"
    _make_db(dbfile, schema_version=0, with_schema_version_table=False)
    monkeypatch.setenv("SKY_APP_DB_PATH", str(dbfile))
    assert db.connect() is None


def test_du_dieu_kien_ket_noi_thanh_cong(monkeypatch, tmp_path):
    dbfile = tmp_path / "sky-app.db"
    _make_db(dbfile, schema_version=db.REQUIRED_SCHEMA_VERSION)
    monkeypatch.setenv("SKY_APP_DB_PATH", str(dbfile))

    conn = db.connect()
    assert conn is not None

    pragmas = {
        "journal_mode": conn.execute("PRAGMA journal_mode").fetchone()[0],
        "foreign_keys": conn.execute("PRAGMA foreign_keys").fetchone()[0],
        "busy_timeout": conn.execute("PRAGMA busy_timeout").fetchone()[0],
    }
    assert pragmas["journal_mode"].lower() == "wal"
    assert pragmas["foreign_keys"] == 1
    assert pragmas["busy_timeout"] == 5000


def test_schema_moi_hon_yeu_cau_van_ket_noi_duoc(monkeypatch, tmp_path):
    """Electron đã chạy migration MỚI HƠN bản Python này biết — vẫn dùng được, Python chỉ
    cần bảng nó biết còn tồn tại, không quan tâm bảng nào mới hơn."""
    dbfile = tmp_path / "sky-app.db"
    _make_db(dbfile, schema_version=db.REQUIRED_SCHEMA_VERSION + 5)
    monkeypatch.setenv("SKY_APP_DB_PATH", str(dbfile))
    assert db.connect() is not None


def test_chi_thu_ket_noi_1_lan_moi_tien_trinh(monkeypatch, tmp_path):
    """Sau lần thử đầu (thành công hay thất bại), kết quả được cache — không mở lại file dù
    môi trường đổi giữa chừng (không nên xảy ra ở runtime thật, nhưng hành vi phải nhất quán)."""
    monkeypatch.delenv("SKY_APP_DB_PATH", raising=False)
    assert db.connect() is None

    dbfile = tmp_path / "sky-app.db"
    _make_db(dbfile, schema_version=db.REQUIRED_SCHEMA_VERSION)
    monkeypatch.setenv("SKY_APP_DB_PATH", str(dbfile))
    assert db.connect() is None  # vẫn None — đã cache lần thử đầu, không thử lại
