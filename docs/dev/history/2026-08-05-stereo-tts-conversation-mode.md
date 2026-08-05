# Stereo TTS cho Conversation/Podcast Mode — Feature Proposal

**Date:** 2026-08-05  
**Context:** Khi phát triển MOSS-TTS-Nano engine, phát hiện codec xuất audio stereo (2 kênh). Hiện tại downmix về mono vì app chỉ sinh single-speaker TTS. Tài liệu này ghi lại use case stereo để future development.

## Vấn đề hiện tại

- App TTS chỉ sinh **1 giọng nói duy nhất** (single-speaker)
- MOSS codec xuất **stereo (2 kênh)** nhưng downmix thành mono vì không cần
- Stereo panning chưa có logic routing

## Stereo Use Case: Conversation/Podcast Mode

Khi app thêm tính năng **multi-speaker dialogue** (kiểu NotebookLM, podcast), stereo sẽ mang lợi ích:

```
Speaker A (phát biểu):  70% Left + 30% Right   → nghe từ bên trái
Speaker B (phản hồi):   30% Left + 70% Right   → nghe từ bên phải
```

Kết quả: người nghe cảm nhận được **spatial awareness** — như 2 người nói chuyện trực tiếp, immersive.

## Implementation Plan (khi phát triển feature này)

1. **Backend** — MOSS engine:
   - ✅ MOSS codec đã support stereo (không cần sửa)
   - Tạo `/synthesize/conversation` endpoint (hoặc param mode)
   - Input: `[{speaker: "A", text: "..."}, {speaker: "B", text: "..."}]`
   - Tại [engine_moss_nano.py:176-180](../../apps/tts-service/server/engine_moss_nano.py#L176-L180): **GIỮ NGUYÊN stereo** thay vì downmix
   - Thêm routing: speaker A → L channel, speaker B → R channel

2. **Protocol** — `/synthesize` response:
   - Hiện tại: trả `{waveform: ndarray (N,), ...}` (mono)
   - Future: option trả `{waveform: ndarray (N, 2), audio_format: "stereo", ...}`

3. **UI/Renderer**:
   - Thêm button/toggle "Conversation Mode" (chỉ available khi MOSS active)
   - Audio player hỗ trợ stereo playback (Web Audio API hỗ trợ sẵn)

## Notes

- **Backward compatibility**: downmix mono vẫn work, conversation mode là opt-in
- **MOSS only**: VieNeu/VoxCPM mono, chỉ MOSS support stereo → condition trên engine
- **Performance**: stereo (2 channels) so với mono (1 channel) không có cost khác biệt đáng kể

## References

- [engine_moss_nano.py — downmix location](../../apps/tts-service/server/engine_moss_nano.py#L176-L180)
- Codec metadata: `apps/shell-electron/resources/vieneu/hub/models--OpenMOSS-Team--MOSS-Audio-Tokenizer-Nano-ONNX/.../codec_browser_onnx_meta.json` (channels: 2)
