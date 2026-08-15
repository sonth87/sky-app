import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMockPlatformContext } from '@sky-app/kernel';
import type { SttPort } from '@sky-app/service-contracts';
import { SpeechToTextApp } from '../SpeechToTextApp';

function makeMockStt(overrides: Partial<SttPort> = {}): SttPort {
  return {
    transcribe: vi.fn().mockResolvedValue({ ok: true, text: 'xin chào', language: 'vi', durationSec: 1.2 }),
    listHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('SpeechToTextApp — degrade khi thiếu service stt', () => {
  it('hiện thông báo "không khả dụng", KHÔNG render form khi platform.services.get(stt) trả undefined', () => {
    const platform = createMockPlatformContext({ capabilities: [] }); // không register 'stt'

    render(<SpeechToTextApp appId="speech-to-text" windowId="w1" platform={platform} isActive />);

    expect(screen.getByText(/không khả dụng/i)).toBeInTheDocument();
    expect(screen.queryByText('Kết quả')).not.toBeInTheDocument();
  });
});

describe('SpeechToTextApp — render bình thường khi có service stt', () => {
  it('render các phần chính: tiêu đề, khu vực chọn file, kết quả, lịch sử', async () => {
    const platform = createMockPlatformContext();
    platform.services.register('stt', makeMockStt());

    render(<SpeechToTextApp appId="speech-to-text" windowId="w1" platform={platform} isActive />);

    expect(await screen.findByText('Speech to Text')).toBeInTheDocument();
    expect(screen.getByText(/Chọn hoặc kéo-thả file audio/)).toBeInTheDocument();
    expect(screen.getByText('Kết quả')).toBeInTheDocument();
    expect(screen.getByText(/Lịch sử phiên âm/)).toBeInTheDocument();
  });

  it('chọn file rồi bấm Phiên âm gọi đúng sttPort.transcribe với source speech_to_text, hiện kết quả', async () => {
    const stt = makeMockStt();
    const platform = createMockPlatformContext();
    platform.services.register('stt', stt);

    render(<SpeechToTextApp appId="speech-to-text" windowId="w1" platform={platform} isActive />);

    const file = new File(['fake audio bytes'], 'sample.wav', { type: 'audio/wav' });
    const input = document.getElementById('stt-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText('sample.wav')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /phiên âm/i }));

    await screen.findByDisplayValue('xin chào');
    expect(stt.transcribe).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ source: 'speech_to_text' }),
    );
  });

  it('lỗi transcribe hiện đúng thông báo, không crash', async () => {
    const stt = makeMockStt({
      transcribe: vi.fn().mockResolvedValue({ ok: false, error: 'Engine chưa cài' }),
    });
    const platform = createMockPlatformContext();
    platform.services.register('stt', stt);

    render(<SpeechToTextApp appId="speech-to-text" windowId="w1" platform={platform} isActive />);

    const file = new File(['fake audio bytes'], 'sample.wav', { type: 'audio/wav' });
    const input = document.getElementById('stt-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText('sample.wav');

    fireEvent.click(screen.getByRole('button', { name: /phiên âm/i }));

    expect(await screen.findByText('Engine chưa cài')).toBeInTheDocument();
  });
});
