/**
 * QA-02: origin_province / destination_province đang là text tự do, nên 'HN' và
 * 'Hà Nội' cùng tồn tại và lát cắt doanh thu theo tuyến bị tách đôi. Đây là danh
 * mục CHUẨN — 34 đơn vị hành chính cấp tỉnh sau sáp nhập 2025.
 *
 * Cố ý để trong mã nguồn chứ không tạo bảng: danh sách đổi vài năm một lần, và có
 * bảng thì vẫn phải có chỗ nạp dữ liệu ban đầu.
 */
export const PROVINCES = [
  'An Giang', 'Bắc Ninh', 'Cà Mau', 'Cao Bằng', 'Cần Thơ', 'Đà Nẵng', 'Đắk Lắk',
  'Điện Biên', 'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Nội', 'Hà Tĩnh', 'Hải Phòng',
  'Huế', 'Hưng Yên', 'Khánh Hòa', 'Lai Châu', 'Lâm Đồng', 'Lạng Sơn', 'Lào Cai',
  'Nghệ An', 'Ninh Bình', 'Phú Thọ', 'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị',
  'Sơn La', 'Tây Ninh', 'Thái Nguyên', 'Thanh Hóa', 'TP. Hồ Chí Minh', 'Tuyên Quang',
  'Vĩnh Long',
] as const;

export type Province = (typeof PROVINCES)[number];

/**
 * Các cách viết đã lọt vào dữ liệu hoặc người dùng hay gõ. Khóa đã bỏ dấu + thường
 * hóa, nên 'ha noi', 'Hà Nội', 'HÀ NỘI' đều rơi vào một chỗ.
 */
const ALIASES: Record<string, Province> = {
  hn: 'Hà Nội',
  hanoi: 'Hà Nội',
  thanhphohanoi: 'Hà Nội',
  hp: 'Hải Phòng',
  haiphong: 'Hải Phòng',
  hcm: 'TP. Hồ Chí Minh',
  tphcm: 'TP. Hồ Chí Minh',
  saigon: 'TP. Hồ Chí Minh',
  hochiminh: 'TP. Hồ Chí Minh',
  thanhphohochiminh: 'TP. Hồ Chí Minh',
  tphochiminh: 'TP. Hồ Chí Minh',
  dn: 'Đà Nẵng',
  danang: 'Đà Nẵng',
  ct: 'Cần Thơ',
  cantho: 'Cần Thơ',
  thuathienhue: 'Huế',

  /* Tên tỉnh TRƯỚC sáp nhập 2025 (Nghị quyết 60-NQ/TW, 202/2025/QH15): 63 -> 34. Mọi tên CŨ không còn trong danh mục đều phải có lối về: thiếu
     một dòng ở đây thì tỉnh đó rơi xuống null và cả dòng bảng giá bị từ chối,
     trong khi file khách gửi còn dùng tên cũ rất lâu nữa.

     Hệ quả cần biết: Quảng Nam nhập vào Đà Nẵng, nên tuyến "Đà Nẵng → Tam Kỳ"
     trở thành tuyến NỘI TỈNH. Tra giá theo cặp tỉnh vì thế vô dụng với miền
     Trung — phải tra theo cặp ĐỊA ĐIỂM. */
  backan: 'Thái Nguyên',
  tinhbackan: 'Thái Nguyên',
  hagiang: 'Tuyên Quang',
  tinhhagiang: 'Tuyên Quang',
  yenbai: 'Lào Cai',
  tinhyenbai: 'Lào Cai',
  bacgiang: 'Bắc Ninh',
  tinhbacgiang: 'Bắc Ninh',
  haiduong: 'Hải Phòng',
  tinhhaiduong: 'Hải Phòng',
  thaibinh: 'Hưng Yên',
  tinhthaibinh: 'Hưng Yên',
  hanam: 'Ninh Bình',
  tinhhanam: 'Ninh Bình',
  namdinh: 'Ninh Bình',
  tinhnamdinh: 'Ninh Bình',
  vinhphuc: 'Phú Thọ',
  tinhvinhphuc: 'Phú Thọ',
  hoabinh: 'Phú Thọ',
  tinhhoabinh: 'Phú Thọ',
  quangnam: 'Đà Nẵng',
  tinhquangnam: 'Đà Nẵng',
  quangbinh: 'Quảng Trị',
  tinhquangbinh: 'Quảng Trị',
  binhdinh: 'Gia Lai',
  tinhbinhdinh: 'Gia Lai',
  quynhon: 'Gia Lai',
  kontum: 'Quảng Ngãi',
  tinhkontum: 'Quảng Ngãi',
  phuyen: 'Đắk Lắk',
  tinhphuyen: 'Đắk Lắk',
  ninhthuan: 'Khánh Hòa',
  tinhninhthuan: 'Khánh Hòa',
  binhthuan: 'Lâm Đồng',
  tinhbinhthuan: 'Lâm Đồng',
  daknong: 'Lâm Đồng',
  tinhdaknong: 'Lâm Đồng',
  binhphuoc: 'Đồng Nai',
  tinhbinhphuoc: 'Đồng Nai',
  binhduong: 'TP. Hồ Chí Minh',
  tinhbinhduong: 'TP. Hồ Chí Minh',
  bariavungtau: 'TP. Hồ Chí Minh',
  tinhbariavungtau: 'TP. Hồ Chí Minh',
  vungtau: 'TP. Hồ Chí Minh',
  tinhvungtau: 'TP. Hồ Chí Minh',
  longan: 'Tây Ninh',
  tinhlongan: 'Tây Ninh',
  tiengiang: 'Đồng Tháp',
  tinhtiengiang: 'Đồng Tháp',
  bentre: 'Vĩnh Long',
  tinhbentre: 'Vĩnh Long',
  travinh: 'Vĩnh Long',
  tinhtravinh: 'Vĩnh Long',
  soctrang: 'Cần Thơ',
  tinhsoctrang: 'Cần Thơ',
  haugiang: 'Cần Thơ',
  tinhhaugiang: 'Cần Thơ',
  baclieu: 'Cà Mau',
  tinhbaclieu: 'Cà Mau',
  kiengiang: 'An Giang',
  tinhkiengiang: 'An Giang',
  phuquoc: 'An Giang',
  tinhphuquoc: 'An Giang',
  hue: 'Huế',
};

/** Bỏ dấu, bỏ mọi thứ không phải chữ/số, thường hóa. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const CANONICAL = new Map<string, Province>();
for (const p of PROVINCES) CANONICAL.set(fold(p), p);
for (const [k, v] of Object.entries(ALIASES)) CANONICAL.set(k, v);

/**
 * Trả tên chuẩn, hoặc null nếu không nhận ra. Chuỗi rỗng / khoảng trắng coi như
 * "không điền" và trả về undefined để bên gọi giữ nguyên cột null.
 */
export function normalizeProvince(input: string | undefined | null): Province | null | undefined {
  if (input === undefined || input === null) return undefined;
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const k = fold(trimmed);
  /* Thu lai sau khi bo TIEN TO hanh chinh. OF1 goi tinh la "Thanh pho Da
     Nang", "Tinh Thua Thien Hue"; danh muc nay chi co "danang",
     "thuathienhue". Thieu buoc nay thi 20/42 dia diem da co ma OF1 bi cham
     la LECH TINH, va luat tie-break theo tinh cua bo khop kho/cang khong bao
     gio chay. Khong tinh nao bat dau bang ba tu ay nen cat la an toan. */
  return CANONICAL.get(k)
    ?? CANONICAL.get(k.replace(/^(thanhpho|tinh|tp)/, ''))
    ?? null;
}
