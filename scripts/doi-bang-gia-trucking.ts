/**
 * Đổi bảng giá trucking của Bee sang đúng định dạng mà màn "Tuyến & giá" nhập
 * được.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/doi-bang-gia-trucking.ts \
 *     "COSTING TRUCKING - DAD.xlsx" ./ra
 *
 * VÌ SAO ĐỔI FILE CHỨ KHÔNG VIẾT BỘ NHẬP THỨ HAI. Hệ thống đã có một bộ nhập
 * bảng giá: nó khớp tên theo danh mục, bắt dòng trùng ngay trong file, báo lỗi
 * kèm số dòng, và gắn ô chọn để khỏi gõ sai. Viết bộ nhập thứ hai cho riêng
 * hình dạng file này là có hai đường ghi vào cùng một bảng, và sớm muộn một
 * đường kiểm chặt hơn đường kia.
 *
 * Đổi ra file còn có một chỗ hơn hẳn: KẾT QUẢ XEM ĐƯỢC TRƯỚC KHI GHI. Đây là
 * dữ liệu giá, sai một con số là báo khách sai.
 *
 * HÌNH DẠNG NGUỒN — ba lược đồ khác nhau trong một workbook:
 *
 *   Cont đường ngắn   8 cột giá   20'DC và 40'DC, mỗi loại 4 bậc tải
 *   LCL đường ngắn    6 cột giá   tải trọng xe 1.4T → 10T
 *   LCL đường dài     3 khối/sheet:
 *       "VẬN CHUYỂN ĐƯỜNG DÀI"  CBM, tấn, 4 loại pallet, xe 5T nguyên chuyến
 *       "TRUNG CHUYỂN ĐẦU ..."  bậc tải 1.4T → MAX
 *       "TRUNG CHUYỂN ĐÀ NẴNG"  bậc tải 1.4T → 7T
 *
 * "Chành" chỉ là TÊN GỌI của đầu mối gom hàng, nên nó là một địa điểm bình
 * thường như mọi địa điểm khác.
 *
 * Mỗi sheet còn có BẢNG PHỤ nằm bên dưới (kích thước xe, tải trọng, ghi chú),
 * nên phải dừng đúng chỗ chứ không quét tới hết sheet.
 *
 * Các khối tìm bằng CHỮ MỐC ở cột 1, không bằng số dòng viết cứng: Bee sửa
 * file rồi gửi lại là chuyện thường, và số dòng cứng thì lệch một hàng là đọc
 * nhầm toàn bộ mà không có gì báo.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import { normalizeProvince } from '../src/common/reference/provinces';
import { COT } from '../src/modules/pricing/pricing-cot';

/** Cột giá của một sheet: tiêu đề trong file -> mã đơn vị tính trong BeeOps. */
interface CotGia {
  cot: number;
  unitCode: string;
}

interface ToDoc {
  ten: string;
  /** Dòng đầu tiên có dữ liệu. */
  tuDong: number;
  cotGia: CotGia[];
}

/**
 * Một khối trong sheet đường dài, neo vào DÒNG TIÊU ĐỀ CỘT của chính nó.
 *
 * Neo vào tiêu đề KHỐI ("TRUNG CHUYỂN ĐẦU HCM") thì hỏng: bên dưới bảng còn
 * một dòng ghi chú "TRUNG CHUYỂN NGUYÊN CHUYẾN SẼ ÁP DỤNG GIÁ..." cũng bắt
 * đầu bằng đúng hai chữ đó, và mấy dòng ghi chú sau nó bị đọc thành tuyến —
 * "Ghi chú: Đơn giá trên chưa bao gồm VAT 08%" đã lọt vào danh mục địa điểm
 * đúng kiểu đó. Dòng tiêu đề cột thì chỉ xuất hiện đúng một lần mỗi khối.
 */
interface Khoi {
  /** Chữ ở cột 1 của dòng TIÊU ĐỀ CỘT — khớp theo tiền tố. */
  tieuDe: string;
  /** Số dòng từ dòng tiêu đề tới dòng dữ liệu đầu tiên. */
  cachTieuDe: number;
  cotGia: CotGia[];
}

const PALLET_VA_CBM: CotGia[] = [
  { cot: 3, unitCode: 'CBM' },
  { cot: 4, unitCode: 'TON' },
  { cot: 5, unitCode: 'PALLET_STACK_LT500' },
  { cot: 6, unitCode: 'PALLET_STACK_600_700' },
  { cot: 7, unitCode: 'PALLET_NOSTACK' },
  { cot: 8, unitCode: 'PALLET_H19' },
  { cot: 9, unitCode: 'PALLET_OVERSIZE' },
  { cot: 10, unitCode: 'FULL_5T_BAT' },
  { cot: 11, unitCode: 'FULL_5T_KIN' },
];

/* Khối trung chuyển dùng bậc tải KHÁC bảng đường ngắn: '2-3T' chứ không phải
   '2.4T', và 'MAX' chứ không phải '10T'. Đó là hai bậc khác nhau trong chính
   bảng giá của Bee (xem migration 058), gộp chung là bịa ra một con số. */
const BAC_TAI_TRUNG_CHUYEN: CotGia[] = [
  { cot: 4, unitCode: 'TRUCK_1T4' },
  { cot: 5, unitCode: 'TRUCK_2_3T' },
  { cot: 6, unitCode: 'TRUCK_3T5' },
  { cot: 7, unitCode: 'TRUCK_5T' },
  { cot: 8, unitCode: 'TRUCK_7T' },
  { cot: 9, unitCode: 'TRUCK_MAX' },
];

const KHOI_DUONG_DAI: Khoi[] = [
  // Khối vận chuyển đường dài: tiêu đề trải HAI hàng (hàng 2 và hàng 3).
  { tieuDe: 'NƠI LẤY HÀNG', cachTieuDe: 2, cotGia: PALLET_VA_CBM },
  // Hai khối trung chuyển dùng chung một bộ cột. Khối Đà Nẵng không có cột
  // MAX, nhưng ô đó rỗng nên tự bị bỏ — không cần khai riêng.
  { tieuDe: 'ĐIỂM ĐI', cachTieuDe: 1, cotGia: BAC_TAI_TRUNG_CHUYEN },
];

/** Hai sheet đường dài. Cả hai cùng hình dạng, chỉ khác số liệu. */
const TO_DUONG_DAI = ['Bảng giá LCL đường dài Tuyến Ph', 'Bảng giá LCL tuyến Phía Bắc'];

/* Khớp theo VỊ TRÍ CỘT, không theo tiêu đề: tiêu đề của file này nằm trên hai
   hàng gộp ô ("20'Dc" ở hàng 1, "≤ 17 Tấn" ở hàng 2), nên đọc theo tiêu đề là
   phải dựng lại cả cấu trúc gộp ô cho một việc chạy vài lần. */
const TO_DOC: ToDoc[] = [
  {
    ten: 'Bảng giá Cont đường ngắn',
    tuDong: 3,
    cotGia: [
      { cot: 7, unitCode: 'CONT20DC_LE17T' },
      { cot: 8, unitCode: 'CONT20DC_LE18T' },
      { cot: 9, unitCode: 'CONT20DC_LE22T' },
      { cot: 10, unitCode: 'CONT20DC_GT22T' },
      { cot: 11, unitCode: 'CONT40DC_LE16T' },
      { cot: 12, unitCode: 'CONT40DC_LE17T' },
      { cot: 13, unitCode: 'CONT40DC_LE22T' },
      { cot: 14, unitCode: 'CONT40DC_GT22T' },
    ],
  },
  {
    ten: 'Bảng giá LCL đường ngắn',
    tuDong: 3,
    cotGia: [
      { cot: 7, unitCode: 'TRUCK_1T4' },
      { cot: 8, unitCode: 'TRUCK_2T4' },
      { cot: 9, unitCode: 'TRUCK_3T5' },
      { cot: 10, unitCode: 'TRUCK_5T' },
      { cot: 11, unitCode: 'TRUCK_7T' },
      { cot: 12, unitCode: 'TRUCK_10T' },
    ],
  },
];

/** Tên trong file có xuống dòng và khoảng trắng kép — nén lại thành một dòng. */
const gonTen = (s: string): string => s.replace(/\s+/g, ' ').trim();

const chuoi = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '').trim();
  if (typeof v === 'object' && 'richText' in v)
    return v.richText.map((r) => r.text).join('').trim();
  return String(v).trim();
};

/** '10,000,000' và 10000000 đều ra 10000000. Chữ thì ra null. */
const soTien = (v: ExcelJS.CellValue): number | null => {
  const s = chuoi(v).replace(/[.,\s]/g, '');
  if (s === '' || !/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Khoá so sánh tên địa điểm — PHẢI khớp `loc_name_key()` của CSDL
 * (migration 055), nếu không file sinh ra ở đây vẫn lọt hai dòng mà DB coi là
 * một, và lần nhập nào cũng vỡ ở đúng chỗ đó.
 */
const khoaTen = (ten: string): string =>
  ten.replace(/\./g, ',').toUpperCase().replace(/\s+/g, ' ').replace(/^[\s,.\-]+|[\s,.\-]+$/g, '');

interface DiaDiem {
  ten: string;
  tinh: string | null;
}

function main(): void {
  const nguon = process.argv[2];
  const thuMucRa = process.argv[3] ?? '.';
  if (!nguon) {
    console.error('Thiếu đường dẫn file. Xem phần hướng dẫn ở đầu tệp này.');
    process.exit(1);
  }

  void chay(nguon, thuMucRa);
}

async function chay(nguon: string, thuMucRa: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(nguon);

  const diaDiem = new Map<string, DiaDiem>();
  const dong: { di: string; den: string; unit: string; gia: number; ghiChu: string }[] = [];
  const boQua: string[] = [];

  /** Ghi một địa điểm vào danh mục; nêu ra khi cùng tên mà hai tỉnh khác nhau. */
  const ghiDiaDiem = (ten: string, tinhRaw: string): void => {
    const k = khoaTen(ten);
    const cu = diaDiem.get(k);
    const tinh = normalizeProvince(tinhRaw) ?? null;
    if (cu === undefined) {
      diaDiem.set(k, { ten, tinh });
      return;
    }
    if (cu.tinh !== null && tinh !== null && cu.tinh !== tinh)
      boQua.push(`"${ten}" khai hai tỉnh: ${cu.tinh} và ${tinh} — đã giữ ${cu.tinh}`);
    if (cu.tinh === null && tinh !== null) cu.tinh = tinh;
  };

  /** Một ô giá -> một dòng. Bỏ im lặng ô chữ ("Cấm tải", "check case by case"). */
  const ghiGia = (di: string, den: string, unit: string, o: ExcelJS.CellValue, ghiChu: string): void => {
    const gia = soTien(o);
    if (gia === null) return;
    dong.push({ di, den, unit, gia, ghiChu });
  };

  for (const to of TO_DOC) {
    const ws = wb.getWorksheet(to.ten);
    if (!ws) {
      boQua.push(`Không có trang "${to.ten}"`);
      continue;
    }

    for (let r = to.tuDong; r <= ws.rowCount; r += 1) {
      const tenDi = gonTen(chuoi(ws.getCell(r, 2).value));
      const tenDen = gonTen(chuoi(ws.getCell(r, 4).value));
      // Dòng gộp ô — xem giải thích ở vòng đọc sheet đường dài.
      if (tenDi !== '' && khoaTen(tenDi) === khoaTen(tenDen)) break;
      /* DỪNG ở dòng đầu tiên thiếu một trong hai đầu tuyến. Mỗi sheet còn có
         bảng phụ nằm bên dưới (kích thước xe, tải trọng); quét tới hết sheet
         là nuốt luôn chúng thành "địa điểm". */
      if (tenDi === '' || tenDen === '') break;

      ghiDiaDiem(tenDi, chuoi(ws.getCell(r, 3).value));
      ghiDiaDiem(tenDen, chuoi(ws.getCell(r, 5).value));

      // KM hai chiều là thông tin của chính dòng giá đó và không có cột riêng
      // trong BeeOps. Để vào ghi chú còn hơn vứt đi.
      const km = chuoi(ws.getCell(r, 6).value);
      const ghiChu = km === '' ? '' : `KM 2 chiều: ${km}`;
      for (const c of to.cotGia) ghiGia(tenDi, tenDen, c.unitCode, ws.getCell(r, c.cot).value, ghiChu);
    }
  }

  /* ---------------------------------------------------------- đường dài
     Hai sheet cùng hình dạng, mỗi sheet vài khối. Tìm khối bằng CHỮ MỐC ở cột
     1 rồi đọc tới dòng đầu tiên thiếu một đầu tuyến — số dòng viết cứng thì
     lệch một hàng là đọc nhầm toàn bộ mà không có gì báo. */
  for (const tenTo of TO_DUONG_DAI) {
    const ws = wb.getWorksheet(tenTo);
    if (!ws) {
      boQua.push(`Không có trang "${tenTo}"`);
      continue;
    }
    for (let r = 1; r <= ws.rowCount; r += 1) {
      const o1 = chuoi(ws.getCell(r, 1).value).toUpperCase();
      const khoi = KHOI_DUONG_DAI.find((k) => o1.startsWith(k.tieuDe.toUpperCase()));
      if (!khoi) continue;

      for (let d = r + khoi.cachTieuDe; d <= ws.rowCount; d += 1) {
        const tenDi = gonTen(chuoi(ws.getCell(d, 1).value));
        const tenDen = gonTen(chuoi(ws.getCell(d, 2).value));
        if (tenDi === '' || tenDen === '') break;
        /* Hai đầu giống hệt nhau = DÒNG GỘP Ô, không phải tuyến.
           Những dòng ghi chú bên dưới bảng được gộp ngang nhiều cột, và
           ExcelJS trả giá trị của ô CHỦ cho mọi ô trong vùng gộp — nên cột 2
           cũng ra đúng câu ghi chú và không rỗng. Thiếu vế này thì
           "Ghi chú: Đơn giá trên chưa bao gồm VAT 08%" vào thẳng danh mục địa
           điểm. (openpyxl trả rỗng ở đây, ExcelJS thì không — đừng tin một
           phép dò bằng thư viện khác.) */
        if (khoaTen(tenDi) === khoaTen(tenDen)) break;
        /* Hai đầu tuyến ở đây KHÔNG có cột tỉnh riêng — tên đã tự mang nơi
           chốn ("CHÀNH HCM", "Đà Nẵng/ Quảng Nam/ Quảng Ngãi"). Để trống tỉnh
           còn hơn đoán: một tỉnh đoán sai làm địa điểm nằm nhầm nhóm ở màn
           chọn hai cấp, và không ai biết nó sai. */
        ghiDiaDiem(tenDi, '');
        ghiDiaDiem(tenDen, '');
        for (const c of khoi.cotGia)
          ghiGia(tenDi, tenDen, c.unitCode, ws.getCell(d, c.cot).value, '');
      }
    }
  }

  /* Khối "TRUNG CHUYỂN ĐÀ NẴNG" nằm trong CẢ HAI sheet với cùng số liệu, nên
     cùng một dòng giá được đọc hai lần. Gộp lại ở đây thay vì để bộ nhập gộp:
     nó sẽ báo "đã gộp N dòng trùng", mà đó là tiếng chuông dành cho file người
     ta gõ sai — không phải cho một chỗ trùng đã biết trước. */
  const theoKhoa = new Map<string, (typeof dong)[number]>();
  let soTrung = 0;
  for (const d of dong) {
    const k = `${khoaTen(d.di)}>${khoaTen(d.den)}@${d.unit}`;
    const cu = theoKhoa.get(k);
    if (cu !== undefined) {
      soTrung += 1;
      if (cu.gia !== d.gia)
        boQua.push(`"${d.di}" → "${d.den}" (${d.unit}): hai nơi ghi hai giá ${cu.gia} và ${d.gia}`);
    }
    theoKhoa.set(k, d);
  }
  dong.length = 0;
  dong.push(...theoKhoa.values());

  fs.mkdirSync(thuMucRa, { recursive: true });

  // ------------------------------------------------------------ địa điểm
  const wbDiaDiem = new ExcelJS.Workbook();
  const wsDiaDiem = wbDiaDiem.addWorksheet('Địa điểm');
  wsDiaDiem.columns = [
    { header: 'Tên', key: 'ten', width: 38 },
    { header: 'Tỉnh/thành', key: 'tinh', width: 20 },
  ];
  wsDiaDiem.getRow(1).font = { bold: true };
  for (const d of [...diaDiem.values()].sort((a, b) => a.ten.localeCompare(b.ten, 'vi')))
    wsDiaDiem.addRow({ ten: d.ten, tinh: d.tinh ?? '' });
  const fileDiaDiem = path.join(thuMucRa, 'dia-diem.xlsx');
  await wbDiaDiem.xlsx.writeFile(fileDiaDiem);

  // -------------------------------------------------------------- bảng giá
  const wbGia = new ExcelJS.Workbook();
  const wsGia = wbGia.addWorksheet('Bảng giá');
  wsGia.columns = [
    { header: COT.origin, key: 'origin', width: 30 },
    { header: COT.destination, key: 'destination', width: 30 },
    { header: COT.unit, key: 'unit', width: 24 },
    { header: COT.price, key: 'price', width: 16 },
    { header: COT.note, key: 'note', width: 24 },
  ];
  wsGia.getRow(1).font = { bold: true };
  for (const d of dong)
    wsGia.addRow({
      origin: d.di,
      destination: d.den,
      unit: d.unit,
      price: d.gia,
      note: d.ghiChu,
    });
  wsGia.getColumn('price').numFmt = '#,##0';
  const fileGia = path.join(thuMucRa, 'bang-gia.xlsx');
  await wbGia.xlsx.writeFile(fileGia);

  console.log(`Địa điểm : ${diaDiem.size}\t-> ${fileDiaDiem}`);
  console.log(`Dòng giá : ${dong.length}\t-> ${fileGia}`);
  if (soTrung) console.log(`Đã gộp   : ${soTrung} dòng trùng giữa hai sheet đường dài`);
  const thieuTinh = [...diaDiem.values()].filter((d) => d.tinh === null);
  if (thieuTinh.length)
    console.log(`\nKHÔNG nhận ra tỉnh (${thieuTinh.length}): ${thieuTinh.map((d) => d.ten).join(', ')}`);
  if (boQua.length) console.log(`\nCẦN XEM LẠI:\n  ${boQua.join('\n  ')}`);
  console.log('\nĐịa điểm của hai sheet đường dài KHÔNG có tỉnh: trong file chúng');
  console.log('không có cột tỉnh, và tên đã tự mang nơi chốn. Điền tỉnh ở màn Địa');
  console.log('điểm để chúng vào đúng nhóm khi chọn tuyến hai cấp.');
}

main();
