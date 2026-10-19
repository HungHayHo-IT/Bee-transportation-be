import { Province } from '@/common/reference/provinces';

/**
 * Khu vực của một tỉnh — ba miền, 34 đơn vị hành chính sau sáp nhập 2025.
 *
 * TỈNH quyết định khu vực, không phải "địa điểm nào tạo trước thì địa điểm
 * sau theo". Luật kế thừa theo hàng xóm nghe thì mềm dẻo, nhưng nó có hai
 * cách hỏng mà cả hai đều đã xảy ra trên dữ liệu thật:
 *
 * * Tỉnh chưa có địa điểm nào mang khu vực thì địa điểm mới nằm NGOÀI mọi
 *   khu vực — 346 trên 486 địa điểm rơi vào đây, và tuyến đi từ chúng không
 *   hiện ở bảng tuyến của bất kỳ khu vực nào.
 * * Kế thừa trúng một ông hàng xóm sai thì sai lan ra: sáu địa điểm TP.HCM
 *   nằm trong Miền Trung vì chép lại một dòng khai nhầm từ trước.
 *
 * Đây là ĐIỂM KHỞI ĐẦU chứ không phải xiềng: admin sửa khu vực của từng địa
 * điểm được, và `updateLocation` không đụng tới bảng này.
 *
 * Giữ đồng bộ với migration 061 (nơi chia lần đầu) và 068 (nơi sửa lại).
 */
const THEO_MIEN: Record<'Miền Bắc' | 'Miền Trung' | 'Miền Nam', readonly Province[]> = {
  'Miền Bắc': [
    'Hà Nội', 'Hải Phòng', 'Quảng Ninh', 'Bắc Ninh', 'Hưng Yên', 'Ninh Bình',
    'Phú Thọ', 'Thái Nguyên', 'Lạng Sơn', 'Cao Bằng', 'Tuyên Quang', 'Lào Cai',
    'Lai Châu', 'Điện Biên', 'Sơn La',
  ],
  'Miền Trung': [
    'Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Trị', 'Huế', 'Đà Nẵng',
    'Quảng Ngãi', 'Gia Lai', 'Đắk Lắk', 'Khánh Hòa', 'Lâm Đồng',
  ],
  'Miền Nam': [
    'TP. Hồ Chí Minh', 'Đồng Nai', 'Tây Ninh', 'Cần Thơ', 'An Giang',
    'Đồng Tháp', 'Vĩnh Long', 'Cà Mau',
  ],
};

const BANG = new Map<string, string>();
for (const [mien, ds] of Object.entries(THEO_MIEN)) for (const t of ds) BANG.set(t, mien);

/** Tên khu vực của một tỉnh đã chuẩn hoá, hoặc null nếu không khai tỉnh. */
export function khuVucCuaTinh(tinh: string | null | undefined): string | null {
  return tinh === null || tinh === undefined ? null : BANG.get(tinh) ?? null;
}
