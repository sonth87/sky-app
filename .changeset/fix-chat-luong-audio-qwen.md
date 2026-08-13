---
"@sky-app/shell-electron": minor
"@sky-app/tts-service": minor
"@sky-app/voice-catalog-ui": minor
"@sky-app/service-contracts": minor
"@sky-app/slide-shared": minor
"@sky-app/platform-electron": minor
"@sky-app/platform-web": minor
"@sky-app/app-db": minor
"@sky-app/module-tts-studio": minor
"@sky-app/data-service": minor
---

Sửa lỗi giọng Qwen3-TTS (0.6B/1.7B) đọc ra âm thanh hỏng hoàn toàn — ú ớ, sai độ dài, không ra tiếng người. Nguyên nhân: model cần biết file âm thanh mẫu ĐANG NÓI GÌ để học cách phát âm, nhưng phần mềm chưa bao giờ cung cấp thông tin đó. Đây cũng là lý do trước giờ Qwen không đọc được tiếng Việt: khi có nội dung file mẫu, model học phát âm tiếng Việt ngay từ chính file mẫu, dù bản thân nó không hỗ trợ tiếng Việt.

Khi tạo giọng mới từ file mẫu, giờ có ô "Audio mẫu đang nói gì?" — bắt buộc với các giọng cần nó (Qwen), tuỳ chọn với giọng khác (nhập vào thì clone giống giọng gốc hơn). Có thể sửa lại nội dung này sau cho giọng đã tạo.

Sửa lỗi giọng Qwen sinh audio kéo dài tới vài phút cho một câu ngắn, làm việc tạo audio chậm hơn nhiều lần mức cần thiết.

Sửa lỗi cấu hình nâng cao (độ ngẫu nhiên, top-k...) vốn được tinh chỉnh riêng cho giọng VieNeu lại bị áp nhầm sang các giọng khác — với Qwen thì chính nó gây ra lỗi đọc lạc nói trên.

File âm thanh mẫu giờ được tự động làm sạch trước khi dùng: cắt khoảng lặng thừa hai đầu, khử lệch nền, hạ mức nếu thu quá to. Thời lượng tối đa nới từ 15 lên 30 giây.

Khi tạo giọng, phần cảnh báo chất lượng file mẫu giờ chi tiết hơn hẳn — báo cả băng thông bị bít (nguyên nhân số 1 làm giọng clone lệch vùng miền), độ vang phòng, nhiễu nền, mức tín hiệu, và dấu hiệu file đã qua nén.

Văn bản dài giờ tự chia theo ranh giới câu rồi ghép lại mượt, không nghe thấy chỗ nối. Nhận diện đúng các viết tắt tiếng Việt (GS., PGS., TS., ThS., TP., NXB., ĐH.) nên không còn cắt đôi tên người giữa câu.

Nếu giọng đọc bị lạc giữa chừng, phần mềm tự đọc lại từng đoạn ngắn hơn; vẫn không được thì báo lỗi rõ ràng thay vì đưa ra một file âm thanh hỏng.

**Hiệu ứng âm thanh (mới)** — TTS Studio giờ có phần hiệu ứng hậu kỳ: vang phòng, tiếng vọng, đổi cao độ, lọc tần số, nén động, chorus/flanger, chỉnh âm lượng. Kèm 4 kiểu dựng sẵn: Giọng robot, Giọng radio, Phòng vang, Giọng trầm. Kéo thanh trượt để chỉnh rồi lưu lại thành kiểu riêng của bạn; kiểu dựng sẵn không sửa/xoá được nhưng dùng làm điểm bắt đầu được.

**Quản lý mô hình** — màn hình giờ chia theo nhóm (sinh giọng nói / nhận dạng giọng nói / mô hình ngôn ngữ), chuẩn bị cho việc thêm mô hình nhận dạng giọng nói sau này. Tiêu đề nhóm chỉ hiện khi thật sự có nhiều hơn một nhóm.

Sửa lỗi phần cấu hình nâng cao ở TTS Studio không có tác dụng gì — giá trị người dùng chỉnh bị mất giữa đường, không bao giờ tới được engine.

Mỗi giọng đọc giờ chạy ở tần số âm thanh gốc của nó thay vì bị ép về một mức chung, giúp tạo audio nhanh hơn mà không đổi chất lượng.
