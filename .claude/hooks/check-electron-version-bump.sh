#!/bin/bash
# Nhắc bump version khi sửa apps/shell-electron/electron/ — không chặn, chỉ cảnh báo.
# Xem docs/dev/versioning.md mục "Quy trình BẮT BUỘC khi sửa code renderer/Electron".
set -euo pipefail

INPUT="$(cat)"
FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')"

# Chỉ quan tâm file .ts trong apps/shell-electron/electron/
if [[ "$FILE_PATH" != *"/apps/shell-electron/electron/"*.ts ]]; then
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION_JSON="$REPO_ROOT/apps/shell-electron/VERSION.json"
PACKAGE_JSON="$REPO_ROOT/apps/shell-electron/package.json"

[[ -f "$VERSION_JSON" && -f "$PACKAGE_JSON" ]] || exit 0

ENTRY_DATE="$(jq -r '.entries[0].date // empty' "$VERSION_JSON")"
ENTRY_VERSION="$(jq -r '.entries[0].version // empty' "$VERSION_JSON")"
PKG_VERSION="$(jq -r '.version // empty' "$PACKAGE_JSON")"
TODAY="$(date +%Y-%m-%d)"

if [[ "$ENTRY_DATE" == "$TODAY" && "$ENTRY_VERSION" == "$PKG_VERSION" ]]; then
  exit 0
fi

cat <<EOF
{"systemMessage": "⚠️ Đã sửa apps/shell-electron/electron/ nhưng VERSION.json/package.json chưa được cập nhật hôm nay — đọc docs/dev/versioning.md mục 'Quy trình BẮT BUỘC khi sửa code renderer/Electron' trước khi báo xong, vì việc này ảnh hưởng trực tiếp cơ chế OTA."}
EOF
