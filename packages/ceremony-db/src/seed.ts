import type { Ceremony } from '@sky-app/slide-shared';

/** Ceremony mặc định khi khởi động app lần đầu (chưa có ceremony nào trong DB). */
export function defaultCeremony(): Ceremony {
  return {
    id: 1,
    name: 'Lễ Trao Bằng Tốt Nghiệp',
    graduation_year: new Date().getFullYear().toString(),
    date: new Date().toISOString().slice(0, 10),
    venue: 'Trường ĐH Đại Nam',
    university_name: 'TRƯỜNG ĐẠI HỌC ĐẠI NAM',
    ministry_name: 'BỘ GIÁO DỤC VÀ ĐÀO TẠO',
    title_line1: 'LỄ TRAO BẰNG TỐT NGHIỆP',
    title_line2: '',
    logo: 'logo.png',
    backdrops_config: 'assets/2026/backdrops_layouts.json',
  };
}
