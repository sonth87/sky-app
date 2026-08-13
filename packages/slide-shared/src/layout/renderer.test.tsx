import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LayoutRenderer, computeScale, resolveVariant } from './renderer.js';
import { sampleLayoutContent, sampleSubject, sampleGroup, sampleNamedGroup, makeGroupMembers } from './fixtures.js';
import type { LayoutContent, RichTextContent } from './types.js';

describe('resolveVariant', () => {
  it('chọn variant khớp tỷ lệ màn 16:9', () => {
    const v = resolveVariant(sampleLayoutContent, { w: 1920, h: 1080 });
    expect(v?.aspect.id).toBe('16:9');
  });

  it('chọn variant khớp tỷ lệ màn 25:9 (ultrawide)', () => {
    const v = resolveVariant(sampleLayoutContent, { w: 2560, h: 900 });
    expect(v?.aspect.id).toBe('25:9');
  });

  it('không có variant nào → trả null (không throw)', () => {
    const empty: LayoutContent = { variants: [] };
    expect(resolveVariant(empty, { w: 1920, h: 1080 })).toBeNull();
  });
});

describe('computeScale', () => {
  it('màn khớp đúng refW/refH → scaleX = scaleY (không méo)', () => {
    const variant = sampleLayoutContent.variants[0]!;
    const scale = computeScale(variant, { w: 1920, h: 1080 });
    expect(scale.scaleX).toBeCloseTo(1, 5);
    expect(scale.scaleY).toBeCloseTo(1, 5);
  });

  it('màn lệch tỷ lệ → scaleX ≠ scaleY (stretch, không letterbox)', () => {
    const variant = sampleLayoutContent.variants[0]!; // refW=1920 refH=1080 (16:9)
    const scale = computeScale(variant, { w: 3840, h: 1080 }); // màn rộng gấp đôi, cao như cũ
    expect(scale.scaleX).toBeCloseTo(2, 5);
    expect(scale.scaleY).toBeCloseTo(1, 5);
    expect(scale.scaleX).not.toBeCloseTo(scale.scaleY, 2);
  });
});

describe('LayoutRenderer — cá nhân', () => {
  it('render đúng vị trí/scale theo refW/refH khi màn khớp tỷ lệ', () => {
    const { container } = render(
      <LayoutRenderer content={sampleLayoutContent} screen={{ w: 1920, h: 1080 }} record={sampleSubject} />,
    );
    // item "name" box.x=100 → left=100*1=100
    const nameEl = screen.getByText(/Xin chúc mừng NGUYỄN VĂN A/);
    expect(nameEl).toBeTruthy();
    expect((nameEl as HTMLElement).style.left).toBe('100px');
    void container;
  });

  it('token @full_name/@gpa được điền đúng giá trị record', () => {
    render(<LayoutRenderer content={sampleLayoutContent} screen={{ w: 1920, h: 1080 }} record={sampleSubject} />);
    expect(screen.getByText('Xin chúc mừng NGUYỄN VĂN A')).toBeTruthy();
    expect(screen.getByText('Điểm GPA: 3.85')).toBeTruthy();
  });

  it('scale-to-fit: đổi kích thước container (vẫn khớp variant 16:9 gần nhất) đổi vị trí render theo scaleX', () => {
    const { rerender } = render(
      <LayoutRenderer content={sampleLayoutContent} screen={{ w: 1920, h: 1080 }} record={sampleSubject} />,
    );
    const at1920 = (screen.getByText(/Xin chúc mừng/) as HTMLElement).style.left;
    expect(at1920).toBe('100px');

    // 2400x1080 (tỷ lệ 2.22) vẫn gần 16:9 (1.78) hơn 25:9 (2.78) → variant không đổi, chỉ scale.
    rerender(<LayoutRenderer content={sampleLayoutContent} screen={{ w: 2400, h: 1080 }} record={sampleSubject} />);
    const at2400 = (screen.getByText(/Xin chúc mừng/) as HTMLElement).style.left;
    expect(at2400).toBe('125px'); // scaleX=2400/1920=1.25 → 100*1.25
  });

  it('token thiếu key (fail-soft) → render rỗng, không throw, không lỗi UI', () => {
    const subjectNoGpa = { ...sampleSubject, extra: {} };
    expect(() =>
      render(<LayoutRenderer content={sampleLayoutContent} screen={{ w: 1920, h: 1080 }} record={subjectNoGpa} />),
    ).not.toThrow();
    expect(screen.getByText('Điểm GPA:')).toBeTruthy();
  });

  it('LoopItem không áp dụng cho record cá nhân → tự ẩn, không lỗi', () => {
    expect(() =>
      render(<LayoutRenderer content={sampleLayoutContent} screen={{ w: 1920, h: 1080 }} record={sampleSubject} />),
    ).not.toThrow();
    // Không có tên thành viên nhóm nào bị render nhầm
    expect(screen.queryByText(/Sinh viên \d/)).toBeNull();
  });

  it('resolveVariant null (không có variant nào) → nền trung tính, không throw', () => {
    const empty: LayoutContent = { variants: [] };
    expect(() => render(<LayoutRenderer content={empty} screen={{ w: 1920, h: 1080 }} record={sampleSubject} />)).not.toThrow();
  });
});

// Bước 12 kế hoạch resize/rotate (2026-07-18, sửa lại 2026-07-19) — TextItem.content có thể là
// RichTextContent {json, html} (đã sửa qua rich-text editor). LayoutRenderer render THẲNG
// content.html (đã sinh sẵn lúc soạn qua editor.getHTML(), KHÔNG gọi generateHTML() ở render
// time — xem types.ts's RichTextContent comment: bỏ generateHTML/happy-dom khỏi slide-shared vì
// vỡ build Electron main process khi bundle). Đây vẫn là điều kiện "WYSIWYG" đã chốt — chỉ khác
// HTML được sinh lúc soạn thay vì lúc render.
describe('LayoutRenderer — TextItem.content dạng RichTextContent (Bước 12)', () => {
  function contentWithRichText(rich: RichTextContent): LayoutContent {
    return {
      variants: [
        {
          aspect: { id: '16:9', w: 16, h: 9 },
          refW: 1920,
          refH: 1080,
          items: [{ id: 'rich', type: 'text', box: { x: 0, y: 0, w: 400, h: 100 }, content: rich, fontSize: 24 }],
        },
      ],
    };
  }

  it('render đúng content.html có sẵn (bold giữ nguyên), không phải text thô', () => {
    const rich: RichTextContent = {
      json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Xin chào ' }, { type: 'text', text: 'thế giới', marks: [{ type: 'bold' }] }] }],
      },
      html: '<p>Xin chào <strong>thế giới</strong></p>',
    };
    const { container } = render(<LayoutRenderer content={contentWithRichText(rich)} screen={{ w: 1920, h: 1080 }} record={sampleSubject} />);

    const strong = container.querySelector('strong');
    expect(strong).toBeTruthy();
    expect(strong!.textContent).toBe('thế giới');
    expect(container.textContent).toContain('Xin chào thế giới');
  });

  it('token @var TRONG content.html được resolve đúng giá trị record, giữ nguyên tag <strong>', () => {
    const rich: RichTextContent = {
      json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Xin chúc mừng @full_name', marks: [{ type: 'bold' }] }] }] },
      html: '<p><strong>Xin chúc mừng @full_name</strong></p>',
    };
    const { container } = render(<LayoutRenderer content={contentWithRichText(rich)} screen={{ w: 1920, h: 1080 }} record={sampleSubject} />);

    const strong = container.querySelector('strong');
    expect(strong!.textContent).toBe('Xin chúc mừng NGUYỄN VĂN A');
  });

  it('layout CŨ (content vẫn string, chưa qua rich-text editor) → hiển thị đúng, KHÔNG lỗi/mất dữ liệu (backward-compat bắt buộc)', () => {
    expect(() =>
      render(<LayoutRenderer content={sampleLayoutContent} screen={{ w: 1920, h: 1080 }} record={sampleSubject} />),
    ).not.toThrow();
    expect(screen.getByText('Xin chúc mừng NGUYỄN VĂN A')).toBeTruthy();
  });

  it('content.html rỗng → không throw, không crash', () => {
    const rich: RichTextContent = { json: { type: 'doc', content: [{ type: 'paragraph' }] }, html: '<p></p>' };
    expect(() => render(<LayoutRenderer content={contentWithRichText(rich)} screen={{ w: 1920, h: 1080 }} record={sampleSubject} />)).not.toThrow();
  });
});

describe('LayoutRenderer — nhóm (LoopItem)', () => {
  it('nhóm CÓ danh sách (≤ maxItems) → render đủ member, không overflow text', () => {
    render(<LayoutRenderer content={sampleLayoutContent} screen={{ w: 1920, h: 1080 }} record={sampleGroup} />);
    for (const m of sampleGroup.members!) {
      expect(screen.getByText(m.full_name)).toBeTruthy();
    }
    expect(screen.queryByText(/người khác/)).toBeNull();
  });

  it('nhóm vượt maxItems (truncate) → cắt đúng số, hiện overflowMoreText', () => {
    const bigGroup = { ...sampleGroup, members: makeGroupMembers(12) };
    render(<LayoutRenderer content={sampleLayoutContent} screen={{ w: 1920, h: 1080 }} record={bigGroup} />);
    expect(screen.getByText('Sinh viên 0')).toBeTruthy();
    expect(screen.getByText('Sinh viên 7')).toBeTruthy();
    expect(screen.queryByText('Sinh viên 8')).toBeNull();
    expect(screen.getByText('+4 người khác')).toBeTruthy();
  });

  it('nhóm DANH NGHĨA (không members) → LoopItem tự ẩn, tên nhóm vẫn hiển thị như cá nhân', () => {
    render(<LayoutRenderer content={sampleLayoutContent} screen={{ w: 1920, h: 1080 }} record={sampleNamedGroup} />);
    expect(screen.getByText('Xin chúc mừng Phòng Công nghệ thông tin')).toBeTruthy();
    expect(screen.queryByText(/người khác/)).toBeNull();
  });

  it('render record là group VÀ record là subject trong CÙNG layout không lỗi (11 DoD)', () => {
    expect(() => {
      const r1 = render(<LayoutRenderer content={sampleLayoutContent} screen={{ w: 1920, h: 1080 }} record={sampleSubject} />);
      r1.unmount();
      const r2 = render(<LayoutRenderer content={sampleLayoutContent} screen={{ w: 1920, h: 1080 }} record={sampleGroup} />);
      r2.unmount();
    }).not.toThrow();
  });
});
