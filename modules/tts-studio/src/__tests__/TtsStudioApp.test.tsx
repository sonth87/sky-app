import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMockPlatformContext } from '@sky-app/kernel';
import type { TtsPort } from '@sky-app/service-contracts';
import { TtsStudioApp } from '../TtsStudioApp';

function makeMockTts(overrides: Partial<TtsPort> = {}): TtsPort {
  return {
    speak: vi.fn().mockResolvedValue(undefined),
    listVoices: vi.fn().mockResolvedValue([{ id: 'NF', name: 'Lan Anh', gender: 'female' }]),
    synthesizeBuffer: vi.fn().mockResolvedValue({ buffer: new ArrayBuffer(0), sampleRate: 48000 }),
    getPreviewUrl: vi.fn().mockResolvedValue('http://localhost/preview/NF'),
    ...overrides,
  };
}

describe('TtsStudioApp — degrade khi thiếu service tts', () => {
  it('hiện thông báo "không khả dụng", KHÔNG render form khi platform.services.get(tts) trả undefined', () => {
    const platform = createMockPlatformContext({ capabilities: [] }); // không register 'tts'

    render(<TtsStudioApp appId="tts-studio" windowId="w1" platform={platform} isActive />);

    expect(screen.getByText(/không khả dụng/i)).toBeInTheDocument();
    expect(screen.queryByText('Giọng nói')).not.toBeInTheDocument();
    expect(screen.queryByText('Tạo giọng nói')).not.toBeInTheDocument();
  });
});

describe('TtsStudioApp — render bình thường khi có service tts', () => {
  it('render layout 2 cột: voice picker/tốc độ/hướng dẫn (trái) + text/generate/history (phải)', async () => {
    const platform = createMockPlatformContext();
    platform.services.register('tts', makeMockTts());

    render(<TtsStudioApp appId="tts-studio" windowId="w1" platform={platform} isActive />);

    expect(await screen.findByText('Giọng nói')).toBeInTheDocument();
    expect(screen.getByText('Tốc độ đọc')).toBeInTheDocument();
    expect(screen.getByText('Hướng dẫn sử dụng')).toBeInTheDocument();
    expect(screen.getByText('Trình soạn thảo văn bản')).toBeInTheDocument();
    expect(screen.getByText('Tạo giọng nói')).toBeInTheDocument();
    expect(screen.getByText('Các bản ghi gần đây')).toBeInTheDocument();
  });

  it('hiện lỗi khi listVoices() reject', async () => {
    const platform = createMockPlatformContext();
    platform.services.register(
      'tts',
      makeMockTts({ listVoices: vi.fn().mockRejectedValue(new Error('network down')) }),
    );

    render(<TtsStudioApp appId="tts-studio" windowId="w1" platform={platform} isActive />);

    expect(await screen.findByText(/network down/)).toBeInTheDocument();
  });
});
