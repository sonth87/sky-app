"""Test config_store.py's ConfigStore — đặc biệt tình huống 2 tiến trình cùng ghi.

Bug thật: tier 'bundled' và 'ext' (xem python-server.ts's blue-green — tier cũ KHÔNG bị kill
khi đổi engine) dùng CHUNG 1 file config nhưng MỖI tiến trình giữ 1 `ConfigStore` RIÊNG, nạp
1 lần lúc khởi động. Đổi engine sang Qwen (tier 'ext') lưu đúng `engine: "qwen-1.7b"` xuống
đĩa — nhưng tier 'bundled' cũ (vẫn sống, snapshot bộ nhớ còn `engine: "moss-tts-nano"`) gọi
`update()` sau đó (vd đổi `device`/`infer`) sẽ ghi đè `engine` về giá trị CŨ trong bộ nhớ NÓ,
xoá mất lựa chọn Qwen vừa lưu — dù bản thân partial update đó không hề nhắc tới `engine`.
"""
from config_store import ConfigStore


def test_update_doc_lai_field_khong_doi_tu_dia(tmp_path):
    path = tmp_path / "config.json"
    store = ConfigStore(path)
    store.update({"engine": "qwen-1.7b"})

    result = store.update({"device": {"threads": 4}})

    assert result["engine"] == "qwen-1.7b"
    assert result["device"]["threads"] == 4


def test_2_tien_trinh_gia_lap_khong_ghi_de_nguoc_engine(tmp_path):
    """Tái hiện đúng bug thật: 2 ConfigStore RIÊNG (mô phỏng tier 'bundled' + 'ext') cùng
    trỏ 1 file — instance B đổi engine, instance A (đã nạp TRƯỚC đó, snapshot cũ) đổi 1
    field khác không liên quan — engine của B phải sống sót qua lượt ghi của A."""
    path = tmp_path / "config.json"
    store_bundled = ConfigStore(path)  # mô phỏng tier 'bundled', nạp lúc khởi động
    store_bundled.update({"engine": "moss-tts-nano"})

    # Tier 'ext' khởi động SAU, nạp lại từ đĩa (đã có moss-tts-nano), rồi đổi sang Qwen.
    store_ext = ConfigStore(path)
    store_ext.update({"engine": "qwen-1.7b"})

    # Tier 'bundled' (snapshot bộ nhớ vẫn "moss-tts-nano") ghi 1 field KHÁC, không đụng
    # engine — không được phép làm mất lựa chọn Qwen vừa lưu.
    result = store_bundled.update({"device": {"threads": 8}})

    assert result["engine"] == "qwen-1.7b"
    assert result["device"]["threads"] == 8

    # Đọc lại từ đĩa qua 1 instance thứ 3 (mô phỏng lần khởi động sau) — phải khớp.
    fresh = ConfigStore(path).get()
    assert fresh["engine"] == "qwen-1.7b"


def test_infer_van_duoc_clamp_sau_khi_nap_lai(tmp_path):
    path = tmp_path / "config.json"
    store = ConfigStore(path)

    result = store.update({"infer": {"temperature": 999}})

    assert result["infer"]["temperature"] == 1.5  # clamp theo _INFER_BOUNDS
