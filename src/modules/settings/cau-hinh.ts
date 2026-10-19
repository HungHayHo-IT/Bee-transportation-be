import { KHOA_GIOI_HAN } from '@/modules/pricing/gioi-han-tra-gia';

/**
 * Những khoá trong `app_settings` mà màn Cấu hình hệ thống được sửa.
 *
 * DANH SÁCH CHO PHÉP, không phải danh sách cấm. `app_settings` còn giữ cả nội
 * dung điều khoản ký và những thứ khác do mã nguồn ghi; mở cả bảng cho một màn
 * nhập liệu là mời người ta sửa một khoá mà không màn nào đọc, hoặc tệ hơn, sửa
 * một khoá mà một luồng khác đang dựa vào.
 *
 * Thêm một tham số mới là thêm MỘT DÒNG ở đây — không phải một migration, cũng
 * không phải một màn hình mới.
 */
export interface ThamSo {
  key: string;
  label: string;
  moTa: string;
  /** Hiện tại chỉ có số nguyên. Thêm kiểu khác khi thật sự cần. */
  min: number;
  max: number;
  macDinh: number;
}

export const THAM_SO: readonly ThamSo[] = [
  {
    key: KHOA_GIOI_HAN,
    label: 'Số lần tra giá tối đa mỗi giờ',
    moTa:
      'Áp dụng cho người KHÔNG mở được cả bảng giá (Sale, Pricing). Với người mở ' +
      'được thì giới hạn này không bảo vệ gì nên không tính. Đặt thấp quá sẽ chặn ' +
      'việc báo giá bình thường.',
    min: 1,
    max: 10000,
    macDinh: 60,
  },
];

export const thamSoCua = (key: string): ThamSo | undefined =>
  THAM_SO.find((t) => t.key === key);
