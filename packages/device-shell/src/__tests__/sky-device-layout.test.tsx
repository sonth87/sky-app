import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useStore } from '@sonth87/device-layout';
import { createMockPlatformContext } from '@sky-app/kernel';
import { mockAppModule } from '@sky-app/module-mock-app';
import { toDeviceAppConfig } from '../to-device-app-config.js';
import { SkyDeviceLayout } from '../SkyDeviceLayout.js';

describe('toDeviceAppConfig', () => {
  it('map AppModule sang AppConfig, giữ đúng id/name/icon/window', () => {
    const platform = createMockPlatformContext();
    const config = toDeviceAppConfig(mockAppModule, platform);

    expect(config.id).toBe('mock-app');
    expect(config.name).toBe('Mock App');
    expect(config.icon).toBe('lucide:FlaskConical');
    expect(config.defaultSize).toEqual({ width: 480, height: 320 });
    expect(typeof config.render).toBe('function');
  });

  it('component bridge render đúng props platform vào AppModule.render', () => {
    const platform = createMockPlatformContext({ env: 'electron', capabilities: ['tts', 'secondary-display'] });
    const config = toDeviceAppConfig(mockAppModule, platform);
    const Bridged = config.render!;

    render(<Bridged appId="mock-app" windowId="w1" />);

    // MockApp reads platform.env + capabilities — nếu bridge quên truyền platform,
    // các data-testid dưới đây sẽ không khớp giá trị mong đợi.
    const root = screen.getByText('secondary-display:yes').closest('[data-app-id]');
    expect(root).toHaveAttribute('data-env', 'electron');
    expect(screen.getByTestId('tts-available').textContent).toBe('tts:unavailable'); // chưa register service
  });

  it('isActive phản ánh đúng device-layout activeAppId', () => {
    const platform = createMockPlatformContext();
    const config = toDeviceAppConfig(mockAppModule, platform);
    const Bridged = config.render!;

    useStore.setState({ activeAppId: 'mock-app' });
    const { unmount } = render(<Bridged appId="mock-app" windowId="w1" />);
    expect(screen.getByText('is-active:yes')).toBeInTheDocument();
    unmount();

    useStore.setState({ activeAppId: 'other-app' });
    render(<Bridged appId="mock-app" windowId="w2" />);
    expect(screen.getByText('is-active:no')).toBeInTheDocument();
  });
});

describe('SkyDeviceLayout', () => {
  it('render được device-layout thật với 1 AppModule đã đăng ký (không throw)', () => {
    const platform = createMockPlatformContext();
    const { container } = render(<SkyDeviceLayout apps={[mockAppModule]} platform={platform} />);

    // device-layout mount desktop chrome (wallpaper/icon grid) — không rỗng.
    expect(container.firstChild).not.toBeNull();
  });
});
