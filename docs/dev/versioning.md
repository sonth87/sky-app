# Versioning — Quy tắc bump version

> Quy tắc BẮT BUỘC khi thay đổi code. Monorepo → mỗi package version độc lập, quản bằng **Changesets** + **SemVer**.

## Nguyên tắc

- **SemVer** `MAJOR.MINOR.PATCH` cho từng package trong `packages/*`, `modules/*`, `apps/*`.
- **Changesets** là công cụ chính: mỗi thay đổi đáng kể → tạo 1 changeset mô tả + mức bump. Version + CHANGELOG tự sinh khi release.
- **Không sửa tay `version` trong package.json** khi đã dùng Changesets (để `changeset version` làm) — trừ lần khởi tạo.

## Mức bump

| Mức | Khi nào | Ví dụ |
|---|---|---|
| **PATCH** (0.1.**0**→0.1.**1**) | Fix bug, sửa nhỏ không đổi API | sửa style, fix tính toán, cải thiện perf |
| **MINOR** (0.**1**.0→0.**2**.0) | Thêm tính năng, tương thích ngược | thêm app con, thêm port mới, thêm option |
| **MAJOR** (**0**.1.0→**1**.0.0) | Breaking change | đổi interface `AppModule`, đổi contract port, đổi format license |

**Đặc thù nền tảng:**
- Đổi **contract trong `packages/kernel`/`service-contracts`** → thường **MAJOR** (mọi app phụ thuộc). Cân nhắc kỹ, ghi [history.md](./history.md).
- Thêm **app con mới** (`modules/*`) → **MINOR** của package app đó (không ảnh hưởng version core).
- Đổi **adapter** (`platform-*`) không đổi port → **PATCH/MINOR**.

## Quy trình (khi đã có Changesets)

```bash
# 1. Sau khi code xong, tạo changeset:
pnpm changeset            # chọn package bị ảnh hưởng + mức bump + mô tả

# 2. Commit cả code + file .changeset/*.md

# 3. Khi release (maintainer):
pnpm changeset version    # bump version + sinh CHANGELOG
pnpm changeset publish     # (nếu publish package)
```

## Phân biệt 3 loại "log" — KHÔNG trộn lẫn

| Loại | Ở đâu | Cho ai | Nội dung |
|---|---|---|---|
| **version** | `package.json` mỗi package | máy/tooling | số version SemVer |
| **CHANGELOG.md** | mỗi package (Changesets sinh) | người dùng | tính năng/fix theo góc nhìn dùng |
| **history.md** | [dev/history.md](./history.md) | dev/AI tương lai | quyết định kỹ thuật + LÝ DO + ngày |

→ Changeset mô tả **cho người dùng** (vào CHANGELOG). Quyết định kiến trúc/lý do sâu **cho dev** → ghi [history.md](./history.md). Đừng nhét lý do kỹ thuật dài vào CHANGELOG, và đừng để history.md thành changelog.

## Version toàn nền tảng (app phân phối)

`apps/shell-electron` (bản đóng gói giao người dùng) có version riêng đại diện cả bản build (giống installer version). Bump khi release bản phân phối, độc lập với version các package con.
