# Debug Guide

## 1. CSS Semantic Classes

Tất cả các element trong app có class định danh theo chức năng, giúp dễ identify khi inspect:

### Format: `[ComponentName]__[ElementName]--[Modifier]`

**Ví dụ:**
```
DebugMenu__trigger         - nút menu chính
DebugMenu__submenu--debug  - submenu Debug
DebugMenu__item--delete-students  - mục xóa sinh viên
DeleteConfirmModal__countdown-value  - giá trị countdown
```

### Cách sử dụng:
1. Mở DevTools (Cmd+Option+I hoặc F12)
2. Cmd+F để search element
3. Tìm class semantic, ví dụ: `DeleteConfirmModal__confirm-btn`

## 2. Console Logging

Toàn bộ các action được log vào console với structured format:

### Log Levels:
- **info** (xanh) - thông tin chung
- **warn** (vàng) - cảnh báo
- **error** (đỏ) - lỗi

### Ví dụ logs:
```
[14:30:45] [DebugMenu] [Menu toggle] { isOpen: true }
[14:30:46] [DeleteConfirmModal] [Modal opened] { title: "Xóa dữ liệu quét" }
[14:30:56] [DebugMenu] [Confirm delete scans]
[14:30:57] [DebugMenu] [Delete scans success] { message: "Dữ liệu quét đã được xóa." }
```

## 3. Debug Inspector

Sử dụng `window.__DEBUG_INSPECT` để inspect logs từ console:

### Các command:
```javascript
// Xem tất cả logs
window.__DEBUG_INSPECT.all()

// Lọc theo log level
window.__DEBUG_INSPECT.info()
window.__DEBUG_INSPECT.warn()
window.__DEBUG_INSPECT.error()

// Lọc theo component
window.__DEBUG_INSPECT.component('DebugMenu')
window.__DEBUG_INSPECT.component('DeleteConfirmModal')

// Lọc theo action
window.__DEBUG_INSPECT.action('Modal opened')

// In logs dạng table
window.__DEBUG_INSPECT.table()

// Xuất logs dạng JSON
window.__DEBUG_INSPECT.export()

// Clear logs
window.__DEBUG_INSPECT.clear()
```

### Ví dụ sử dụng:
```javascript
// Xem tất cả error
window.__DEBUG_INSPECT.error()

// Xem logs từ component DebugMenu
window.__DEBUG_INSPECT.component('DebugMenu')

// In tất cả logs dạng bảng
window.__DEBUG_INSPECT.table()

// Copy tất cả logs để gửi developer
copy(window.__DEBUG_INSPECT.export())
```

## 4. Workflow Debug

### Khi gặp lỗi:
1. Mở DevTools
2. Chạy lại action gây lỗi
3. Chạy `window.__DEBUG_INSPECT.error()` để xem error logs
4. Chạy `window.__DEBUG_INSPECT.all()` để xem toàn bộ hoạt động trước lỗi

### Khi muốn trace workflow:
1. Mở DevTools Console
2. Xem logs real-time khi thao tác
3. Sử dụng `window.__DEBUG_INSPECT.component('NameComponent')` để focus logs

### Khi muốn tìm element:
1. Mở DevTools Elements
2. Search (Cmd+F) class semantic, ví dụ: `DebugMenu__trigger`
3. Inspect để xem DOM structure
