/**
 * Cấu trúc file Excel của bảng giá Khu vực → Tuyến → Dịch vụ con → Giá.
 *
 * DẠNG RỘNG: mỗi dòng là MỘT tuyến × MỘT dịch vụ con, mỗi đơn vị tính một hoặc
 * hai cột giá. Đây là hình dạng của chính bảng giá giấy mà Bee đang dùng —
 * người nhập đọc ngang một dòng là thấy cả bậc giá của một tuyến, thay vì tám
 * dòng giống hệt nhau chỉ khác mỗi loại xe.
 *
 * ĐỌC THEO TÊN TIÊU ĐỀ, không theo vị trí cột. Bảng giá thật người ta gửi lên
 * không có cột "Tên dịch vụ con", và cột giá thì ghi gọn "1.4T" chứ không ghi
 * "Xe 1.4T (2 chiều)". Đọc theo vị trí thì cột giá đầu tiên bị hiểu thành tên
 * dịch vụ con và cả file trượt — mà câu báo lỗi lại nói về chuyện khác.
 *
 * Phần thuần, không chạm Prisma lẫn ExcelJS: toàn bộ luật "cột nào là cột nào"
 * và "dòng nào gộp với dòng nào" test được mà không cần file thật.
 */

/** Một cột nhận dạng và các tên tiêu đề được chấp nhận cho nó. */
export const COT_NHAN_DANG = {
  regionName: 'Khu vực',
  originProvince: 'Tỉnh đi',
  originName: 'Địa chỉ đi',
  destinationProvince: 'Tỉnh đến',
  destinationName: 'Địa chỉ đến',
  roundTripKm: 'Km 2 chiều',
  kind: 'Loại hàng',
} as const;

export type TruongNhanDang = keyof typeof COT_NHAN_DANG;

/** Tiêu đề in ra trong file do hệ thống sinh: có dấu * ở ô bắt buộc. */
const SAO: Partial<Record<TruongNhanDang, boolean>> = {
  originProvince: true, originName: true, destinationProvince: true, destinationName: true,
  kind: true,
};

/** Hậu tố phân biệt hai cột giá của cùng một đơn vị tính. */
export const HAU_TO_MOT_CHIEU = ' (1 chiều)';
export const HAU_TO_HAI_CHIEU = ' (2 chiều)';

/**
 * Giá HAI CHIỀU = giá một chiều × 1,5 — tức là cộng thêm 50%.
 *
 * Bảng giá của Bee ghi MỘT con số cho mỗi loại xe, và con số đó là cước một
 * chiều; chiều về tính thêm nửa giá. Nên một cột giá trong file được hiểu là
 * giá một chiều, còn giá hai chiều suy ra từ nó.
 *
 * Suy ra rồi LƯU LẠI chứ không tính lúc hiển thị: tuyến nào có giá hai chiều
 * thoả thuận riêng thì sửa đè lên được, và con số đang lưu chính là con số đã
 * báo cho khách. Tính lại mỗi lần hiện thì mọi tuyến đều mất quyền có ngoại lệ.
 */
export const HE_SO_HAI_CHIEU = 1.5;

/** Giá hai chiều suy ra từ giá một chiều. VND nên lam tròn về số nguyên. */
export const giaHaiChieu = (motChieu: number): number =>
  Math.round(motChieu * HE_SO_HAI_CHIEU);

/** Cước chành tính theo khối / tấn / pallet không có chiều về: không suy giá 2 chiều. */
export const coChieuVe = (unitCode: string): boolean => !/^(CBM|TON)$|^PALLET_/.test(unitCode);

export interface DonViCot {
  code: string;
  label: string;
}

/** Tiêu đề đầy đủ của file hệ thống sinh ra. */
export function tieuDe(donVi: readonly DonViCot[]): string[] {
  return [
    ...(Object.keys(COT_NHAN_DANG) as TruongNhanDang[])
      .map((k) => COT_NHAN_DANG[k] + (SAO[k] ? ' *' : '')),
    ...donVi.flatMap((u) => [u.label + HAU_TO_MOT_CHIEU, u.label + HAU_TO_HAI_CHIEU]),
  ];
}

/**
 * So khớp tên không phân biệt hoa thường, khoảng trắng thừa và dấu * cuối.
 *
 * KHÔNG bỏ dấu tiếng Việt: 'Xe 1.4T' và 'Xe 14T' mà gộp làm một thì hai bậc tải
 * khác nhau nhập vào cùng một chỗ. Chỉ nới đúng những thứ người ta hay lệch khi
 * sửa file bằng tay.
 */
export const khoaTen = (s: string): string =>
  s.trim().replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').toLowerCase();

/**
 * Khoá so khớp TÊN ĐƠN VỊ TÍNH, nới thêm một bậc nữa.
 *
 * Bảng giá thật ghi '1.4T' còn danh mục ghi 'Xe 1.4T'; '20DC' thì danh mục
 * không có dòng nào tương đương (danh mục chia theo bậc tải: "20'DC ≤ 17 tấn").
 * Bỏ tiền tố "Xe ", bỏ nháy và khoảng trắng để '1.4T' gặp được 'Xe 1.4T'; cái
 * nào vẫn không gặp thì là đơn vị tính MỚI, không phải lỗi gõ.
 */
export const khoaDonVi = (s: string): string =>
  khoaTen(s).replace(/^xe\s+/, '').replace(/['’\s]/g, '');

export interface CotGia {
  /** Chỉ số cột trong file, bắt đầu từ 1 như ExcelJS. */
  cot: number;
  /** null = tiêu đề không khớp đơn vị tính nào đang có. */
  unitCode: string | null;
  /** Tiêu đề đã bỏ hậu tố chiều — tên để tạo đơn vị tính mới nếu cần. */
  tenDonVi: string;
  chieu: 'mot' | 'hai';
}

export interface BanDoCot {
  /** Cột của từng trường nhận dạng; vắng mặt = file không có cột đó. */
  nhanDang: Partial<Record<TruongNhanDang, number>>;
  gia: CotGia[];
}

/**
 * Đọc hàng tiêu đề: cột nào là cột nhận dạng, cột nào là giá của đơn vị nào.
 *
 * Cột giá nhận cả NHÃN lẫn MÃ đơn vị tính, và cả dạng ghi gọn ('1.4T' cho 'Xe
 * 1.4T'). Cột KHÔNG có hậu tố chiều được hiểu là GIÁ MỘT CHIỀU — bảng giá của
 * Bee ghi một con số cho mỗi loại xe và đó là cước một chiều; giá hai chiều
 * suy ra bằng `giaHaiChieu()`.
 */
export function docTieuDe(
  header: readonly (string | null | undefined)[],
  donVi: readonly DonViCot[],
): BanDoCot {
  const theoTen = new Map<string, string>();
  for (const u of donVi) {
    theoTen.set(khoaDonVi(u.label), u.code);
    theoTen.set(khoaDonVi(u.code), u.code);
  }
  const nhanDangTheoTen = new Map<string, TruongNhanDang>(
    (Object.keys(COT_NHAN_DANG) as TruongNhanDang[])
      .map((k) => [khoaTen(COT_NHAN_DANG[k]), k]),
  );
  /* File cu dung cot "Ma dich vu con" / "Ten dich vu con" cho cung mot viec:
     noi dong nay la hang nguyen container hay hang le. Nhan ca ba ten de bang
     gia da gui di truoc day nhap lai duoc, khong bat ai sua lai tieu de. */
  for (const cu of ['Loại hàng (FCL/LCL)', 'Mã dịch vụ con', 'Tên dịch vụ con', 'FCL/LCL'])
    nhanDangTheoTen.set(khoaTen(cu), 'kind');

  const nhanDang: Partial<Record<TruongNhanDang, number>> = {};
  const gia: CotGia[] = [];
  header.forEach((raw, i) => {
    const text = (raw ?? '').toString().trim();
    if (text === '') return;
    const truong = nhanDangTheoTen.get(khoaTen(text));
    if (truong !== undefined) {
      // Trùng tên cột thì giữ cột ĐẦU: file sửa tay hay có một cột cũ còn sót.
      if (nhanDang[truong] === undefined) nhanDang[truong] = i + 1;
      return;
    }
    // Không có hậu tố = giá MỘT chiều; chỉ ' (2 chiều)' mới là hai chiều.
    const chieu: 'mot' | 'hai' = text.endsWith(HAU_TO_HAI_CHIEU) ? 'hai' : 'mot';
    const ten = text.endsWith(HAU_TO_MOT_CHIEU) || text.endsWith(HAU_TO_HAI_CHIEU)
      ? text.slice(0, text.length - HAU_TO_MOT_CHIEU.length)
      : text;
    gia.push({ cot: i + 1, unitCode: theoTen.get(khoaDonVi(ten)) ?? null, tenDonVi: ten, chieu });
  });
  return { nhanDang, gia };
}

export interface DongNhap {
  /** Số dòng trong file, để câu báo lỗi chỉ đúng chỗ. */
  dong: number;
  regionName: string;
  originProvince: string;
  originName: string;
  destinationProvince: string;
  destinationName: string;
  roundTripKm: number | null;
  /** Nguyên văn ô "Loại hàng" — đã đọc ra FCL/LCL thì để ở `kind`. */
  kindRaw: string;
  kind: 'FCL' | 'LCL' | null;
  gia: { unitCode: string; oneWayPrice: number | null; roundTripPrice: number | null }[];
}

export interface TuyenGom {
  originProvince: string;
  originName: string;
  destinationProvince: string;
  destinationName: string;
  regionName: string;
  roundTripKm: number | null;
  dichVu: Map<string, DongNhap>;
}

/** Khoá gộp của một tuyến: CẶP ĐỊA ĐIỂM, kèm tỉnh để phân biệt hai kho trùng tên. */
export const khoaTuyen = (d: DongNhap): string =>
  [d.originProvince, d.originName, d.destinationProvince, d.destinationName]
    .map(khoaTen).join('|');

/**
 * FCL hay LCL, đọc từ ô "Loại hàng".
 *
 * Nhận cả ba cách người ta hay ghi: đúng chữ 'FCL'/'LCL', mã TMS có đuôi
 * '_FCL'/'_LCL' (DOMESTIC_FCL), hoặc tên dịch vụ con mang '(FCL)'/'(LCL)'.
 * Bảng giá đã gửi đi trước đây dùng cột mã dịch vụ con, nên không nhận chúng
 * là bắt người ta sửa lại từng file cũ.
 *
 * null = không đọc ra được. KHÔNG đoán theo đơn vị tính: một dòng ghi nhầm mã
 * rồi được xếp bừa vào FCL là giá container nằm trong khối hàng lẻ.
 */
export function docKind(raw: string): 'FCL' | 'LCL' | null {
  const t = khoaTen(raw).toUpperCase();
  if (t === '') return null;
  if (/(^|[^A-Z])FCL([^A-Z]|$)/.test(t)) return 'FCL';
  if (/(^|[^A-Z])LCL([^A-Z]|$)/.test(t)) return 'LCL';
  return null;
}

/** Khoá của một khối giá trong tuyến: FCL hay LCL. */
export const khoaDichVu = (d: DongNhap): string => d.kind ?? khoaTen(d.kindRaw);

/**
 * Gộp các dòng đã đọc thành tuyến → dịch vụ con.
 *
 * Trùng (tuyến, dịch vụ con) thì dòng SAU đè dòng trước — cùng luật với nhập
 * bảng giá cũ, và trùng trong một file gần như luôn là người ta sửa lại ở dòng
 * dưới rồi quên xoá dòng trên. Trả thêm số dòng bị đè để báo ra, chứ không nuốt
 * im lặng.
 *
 * Km lấy theo dòng ĐẦU có khai: nó thuộc tuyến, nên mọi dòng của một tuyến phải
 * nói cùng một con số; dòng sau khai khác không đổi được tuyến đã ghi.
 */
export function gomTheoTuyen(dongs: readonly DongNhap[]): {
  tuyen: Map<string, TuyenGom>;
  deLen: number;
} {
  const tuyen = new Map<string, TuyenGom>();
  let deLen = 0;
  for (const d of dongs) {
    const kt = khoaTuyen(d);
    let t = tuyen.get(kt);
    if (t === undefined) {
      t = {
        originProvince: d.originProvince,
        originName: d.originName,
        destinationProvince: d.destinationProvince,
        destinationName: d.destinationName,
        regionName: d.regionName,
        roundTripKm: d.roundTripKm,
        dichVu: new Map(),
      };
      tuyen.set(kt, t);
    }
    if (t.roundTripKm === null && d.roundTripKm !== null) t.roundTripKm = d.roundTripKm;
    if (t.regionName === '' && d.regionName !== '') t.regionName = d.regionName;
    const kd = khoaDichVu(d);
    if (t.dichVu.has(kd)) deLen += 1;
    t.dichVu.set(kd, d);
  }
  return { tuyen, deLen };
}

/**
 * Mã cho một đơn vị tính mới sinh từ tiêu đề cột.
 *
 * BỎ DẤU trước rồi mới thay ký tự lạ: '5T Bạt' -> '5T_BAT'. Thay thẳng thì
 * mỗi chữ có dấu thành một gạch dưới — '5T_B_T' — vừa không đọc được, vừa
 * đụng nhau: '5T Bạt' và '5T Bất' ra cùng một mã, và cái thứ hai im lặng ghi
 * đè bảng giá của cái thứ nhất.
 *
 * Mã đi vào khoá ngoại nên chỉ còn chữ A-Z, số và gạch dưới.
 */
export const maDonViMoi = (tieuDeCot: string): string =>
  tieuDeCot
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
