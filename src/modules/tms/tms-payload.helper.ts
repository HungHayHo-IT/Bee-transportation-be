import { chuanDonViTinh, DON_VI_MAC_DINH } from '@/common/reference/quantity-units';
import { TMS_MODES_OF1 } from '@/common/reference/tms-modes';
import { khoa } from './khop-kho-cang.helper';

/**
 * Phần của đơn mà OF1-TMS cần. Khai riêng thay vì dùng thẳng kiểu Prisma:
 * hàm này là logic thuần, test nó không nên phải dựng cả một Order giả.
 */
export interface DonDeDay {
  code: string;
  desiredDate: Date | null;
  originAddress: string | null;
  destinationAddress: string | null;
  originProvince: string | null;
  destinationProvince: string | null;
  packageCount: number | null;
  quantityUnit: string | null;
  /** Prisma trả Decimal — nhận cả chuỗi lẫn số để không phải ép kiểu ở chỗ gọi. */
  weightKg: unknown;
  volumeCbm: unknown;
  note: string | null;
  serviceChild: { tmsMode: string | null } | null;
  customer: {
    code: string | null;
    companyName: string | null;
    contactName?: string | null;
    phone?: string | null;
  } | null;
  /** Mã địa chỉ khách khớp với địa chỉ trên đơn (070) — `null` nếu chưa có. */
  maDiaChiLay?: string | null;
  maDiaChiGiao?: string | null;
  /**
   * Giá trị các ô RIÊNG theo dịch vụ. Số House Bill và mã booking nằm ở đây
   * (071) chứ không phải cột riêng của bảng `orders`: chúng chỉ có nghĩa với
   * bốn dịch vụ đẩy sang OF1, còn tư vấn hay cho thuê thiết bị thì không.
   */
  serviceData?: unknown;
  originLocation: { name?: string; address: string | null; of1Id: number | null } | null;
  destinationLocation: { name?: string; address: string | null; of1Id: number | null } | null;
}

/**
 * Payload TMSBILL theo contract OF1-TMS **v1.3** (2026-10-08), mục 5.
 *
 * Đổi so với bản v1.0 mà code này chạy theo trước đây:
 *
 * - BỎ `action`. v1.0 bắt gửi 'CREATE'; v1.3 khoá tạo/cập nhật hoàn toàn theo
 *   `orderCode`, cùng mã gửi lại là cập nhật. Gửi thừa không gây lỗi nhưng nó
 *   nói sai về cách hệ thống hoạt động, và người đọc sau sẽ tin theo.
 * - BỎ `sender_location_id` kiểu gạch dưới. v1.0 viết lẫn hai lối nên ta gửi
 *   cả hai cho chắc; v1.3 chỉ còn kiểu lạc đà.
 * - THÊM `customerCode` — BẮT BUỘC. Khách phải được đồng bộ trước qua
 *   `of1/CUSTOMER`; gửi mã chưa đồng bộ thì OF1 trả 400. Trước đây ta nhét mã
 *   khách vào ô `customer` (vốn là TÊN để đối chiếu) — một ô mang hai nghĩa.
 * - THÊM `quantityUnit` — bắt buộc KHI có `quantity`. Thiếu nó là 400, nên
 *   trước đây mọi đơn có số kiện đều hỏng.
 * - Hai mã kho/cảng thành BẮT BUỘC THEO CHIỀU HÀNG (mục 5.2), không còn tuỳ
 *   chọn như Bee chốt miệng hồi 06/10.
 *
 * - THÊM `pickupAddressCode`/`deliveryAddressCode` (070). Đầu KHÁCH ưu tiên mã
 *   hơn chuỗi chữ: có mã thì OF1 tự điền địa chỉ đầy đủ, toạ độ và người liên
 *   hệ như đơn nhập tay. Khách chưa có mã nào thì vẫn gửi chữ — contract mục
 *   5.2 cho phép, chỉ thiếu định vị.
 * - ĐIỀN `hblNo`/`bookingCode` (071). Hai khoá này khai trong kiểu từ đầu
 *   nhưng chưa bao giờ được điền, vì BeeOps không có chỗ nào lưu — đọc mã
 *   nguồn sẽ tưởng là có. Giờ chúng là ô riêng của bốn dịch vụ đẩy sang OF1.
 */
export interface PayloadTmsBill {
  orderCode: string;
  fileNo: string;
  customerCode: string;
  customer: string;
  mode: string;
  /** Địa chỉ khách dạng chữ — dùng khi đầu đó CHƯA có mã trong danh mục. */
  pickupAddress?: string;
  deliveryAddress?: string;
  /** Mã địa chỉ đã đồng bộ qua `of1/CUSTOMER` — OF1 tự điền toạ độ, liên hệ. */
  pickupAddressCode?: string;
  deliveryAddressCode?: string;
  senderLocationId?: number;
  receiverLocationId?: number;
  deliveryPlan?: string;
  hblNo?: string;
  bookingCode?: string;
  pickupContact?: string;
  deliveryContact?: string;
  quantity?: number;
  /** Bắt buộc khi có `quantity` — mục 5.3. */
  quantityUnit?: string;
  weight?: number;
  volume?: number;
  note?: string;
}



/** Đầu kho/cảng nằm ở phía nào — mục 5.2 contract. */
export function dauKhoCang(mode: string): 'di' | 'den' | null {
  if (mode.startsWith('IMPORT_')) return 'di';
  if (mode.startsWith('EXPORT_')) return 'den';
  return null;
}

/** Một ô còn thiếu, kèm chỗ sửa để câu thông báo không bắt người dùng tự đoán. */
export interface OThieu {
  truong: string;
  nhan: string;
  suaODau: string;
}

/** Đọc theo giờ UTC: cột desiredDate là DATE, Prisma trả nửa đêm UTC. Đọc theo
 *  giờ máy chủ thì máy ở múi giờ âm lùi mất một ngày. */
function dinhDangGio(d: Date): string {
  const hai = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${hai(d.getUTCMonth() + 1)}-${hai(d.getUTCDate())} `
    + `${hai(d.getUTCHours())}:${hai(d.getUTCMinutes())}:${hai(d.getUTCSeconds())}`;
}

/** Số không âm, dạng JSON number. Giữ số 0 vì 0 khác hẳn "không khai". */
function soKhongAm(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function chuoi(...ungVien: (string | null | undefined)[]): string | undefined {
  for (const v of ungVien) {
    const s = v?.trim();
    if (s) return s;
  }
  return undefined;
}

function maHopLe(mode: string | null | undefined): string | undefined {
  return mode && (TMS_MODES_OF1 as readonly string[]).includes(mode) ? mode : undefined;
}

/**
 * Ghep tinh vao duoi dia chi.
 *
 * Dia chi gui sang OF1 phai DOC DUOC MOT MINH: tai xe ben kia khong mo duoc
 * man don cua ta. "12 Le Duan" khong noi tinh nao — ca nuoc co hang chuc
 * duong Le Duan. Nguoc lai, rot ve moi ten tinh thi don ghi "lay hang tai Da
 * Nang", ca thanh pho.
 *
 * Bo qua khi chuoi da co san ten tinh, de khong ra "... Da Nang, Da Nang".
 */
function ghepTinh(dc: string | undefined, tinh: string | null): string | undefined {
  const t = chuoi(tinh);
  if (dc === undefined) return t;
  /* Chi xet DOAN CUOI, khong xet ca chuoi.
     "Cang Da Nang" CO chua "Da Nang" nhung do la TEN RIENG cua cai cang, khong
     phai o tinh — van phai ghep, ra "Cang Da Nang, Da Nang". Chi bo qua khi
     doan cuoi dung la ten tinh: "12 Le Duan, TP. Da Nang" thi thoi, khong ra
     "..., TP. Da Nang, Da Nang". */
  const cuoi = khoa(dc.split(',').pop()).replace(/^(tp|thanhpho|tinh)/, '');
  if (t === undefined || cuoi === khoa(t)) return dc;
  return `${dc}, ${t}`;
}

/**
 * Dia diem doc thanh mot dong dia chi.
 *
 * Lay ca TEN khi cot `address` rong — 790/791 dong trong danh muc dia diem
 * KHONG co `address`, vi danh muc duoc dung tu bang gia noi dia, noi mot dia
 * diem duoc nhan dang bang ten ("KCN My Phuoc 2") chu khong bang so nha.
 * Chi doc `address` thi nhanh nay khong bao gio chay, va don rot thang ve
 * ten tinh.
 *
 * Giong het luat `address ?? name` ma `locations.service.dto()` dung: cai
 * man hinh hien ra chinh la cai gui di.
 */
function noi(l: { name?: string; address: string | null } | null): string | undefined {
  return chuoi(l?.address, l?.name);
}

function diaChiLay(don: DonDeDay): string | undefined {
  return ghepTinh(chuoi(don.originAddress, noi(don.originLocation)), don.originProvince);
}

function diaChiGiao(don: DonDeDay): string | undefined {
  return ghepTinh(
    chuoi(don.destinationAddress, noi(don.destinationLocation)),
    don.destinationProvince,
  );
}

/**
 * Những ô BẮT BUỘC mà đơn còn thiếu — rỗng nghĩa là đẩy được.
 *
 * Chấm TRƯỚC khi gọi OF1 chứ không để OF1 trả 400: OF1 luôn trả HTTP 200 và
 * KHÔNG chặn trùng, nên mỗi lần gửi hỏng vẫn là một lần phải đối soát. Hỏi đủ
 * ở nhà rẻ hơn nhiều.
 */
export function thieuGiDeDay(don: DonDeDay): OThieu[] {
  const thieu: OThieu[] = [];
  const them = (truong: string, nhan: string, suaODau: string): number =>
    thieu.push({ truong, nhan, suaODau });

  const mode = maHopLe(don.serviceChild?.tmsMode);
  if (!mode)
    them('mode', 'Dịch vụ con (mã phương thức vận chuyển)', 'Sửa đơn → Dịch vụ con');
  /* Mã khách là KHOÁ, tên khách chỉ để đối chiếu — hai ô khác nhau, hỏi riêng.
     Đơn thiếu mã khách mà vẫn đẩy đi thì OF1 trả 400 "customerCode not found",
     một câu người nhập đơn không làm gì được. */
  if (!chuoi(don.customer?.code))
    them('customerCode', 'Mã khách hàng (để đồng bộ sang OF1)', 'Khách hàng → Mã khách');
  if (!chuoi(don.customer?.companyName, don.customer?.code))
    them('customer', 'Tên khách hàng', 'Sửa đơn → Khách hàng');

  /* MOI DAU TUYEN phai noi duoc hang di dau — bang MA kho/cang hoac bang DIA
     CHI chu, mot trong hai la du.

     Truoc day dau kho/cang BAT BUOC co ma OF1 (muc 5.2) va thieu ma la chan
     don tai cho. Luat ay chan ca nhung dia diem KHONG THE co ma: danh muc
     dung tu bang gia, nen mot so dong la O GOM GIA ("CAT LAI, PHU HUU
     TRANSIMEX, NHA BE") — ba cang chung mot muc cuoc. Ma OF1 tro toi MOT
     cang, nen ba cang thi khong ma nao gan duoc, va don ket vinh vien.

     Gio chi chan khi dau do KHONG CO GI CA. Co ten chu thi cu gui: OF1 nhan
     duoc dong chu va nguoi ben do tu doc, con hon don nam lai ben nay. */
  const khoCang = mode ? dauKhoCang(mode) : null;
  const coMaLay = khoCang === 'di' && don.originLocation?.of1Id != null;
  const coMaGiao = khoCang === 'den' && don.destinationLocation?.of1Id != null;
  if (!coMaLay && !diaChiLay(don))
    them('pickupAddress', 'Địa chỉ điểm nhận', 'Sửa đơn → Điểm nhận');
  if (!coMaGiao && !diaChiGiao(don))
    them('deliveryAddress', 'Địa chỉ điểm giao', 'Sửa đơn → Điểm giao');

  return thieu;
}

/**
 * Dựng payload TMSBILL từ một đơn BeeOps. Gọi SAU `thieuGiDeDay` — hàm này
 * tin rằng mọi ô bắt buộc đã có, và sẽ ném lỗi nếu không.
 *
 * Trường KHÔNG bắt buộc mà BeeOps không có thì BỎ HẲN, không gửi null: OF1 coi
 * null là "đặt lại thành rỗng" còn không gửi là "không nói gì" — đơn thiếu
 * thông tin thì phải im lặng chứ đừng xoá dữ liệu bên kia.
 */
export function dungPayloadTmsBill(don: DonDeDay): PayloadTmsBill {
  const thieu = thieuGiDeDay(don);
  if (thieu.length > 0)
    throw new Error(`Đơn còn thiếu: ${thieu.map((t) => t.nhan).join(', ')}`);

  const mode = maHopLe(don.serviceChild?.tmsMode) as string;
  const p: PayloadTmsBill = {
    // orderCode VÀ fileNo đều là mã đơn BeeOps: đó là mã duy nhất ta có, và
    // OF1 dùng orderCode để quyết định tạo mới hay cập nhật.
    orderCode: don.code,
    fileNo: don.code,
    customerCode: chuoi(don.customer?.code) as string,
    customer: chuoi(don.customer?.companyName, don.customer?.code) as string,
    mode,
  };

  /* Đầu kho/cảng chỉ gửi `locationId`, KHÔNG gửi kèm địa chỉ text của đầu đó:
     OF1 tự điền từ danh mục, còn ta gửi thêm một chuỗi tự gõ thì hai bên có
     hai địa chỉ cho cùng một cảng (mục 5.2). */
  const khoCang = dauKhoCang(mode);
  /* Đầu KHÁCH: ưu tiên MÃ địa chỉ hơn chuỗi chữ. Có mã thì OF1 tự điền địa
     chỉ đầy đủ, toạ độ và người liên hệ như đơn nhập tay (mục 5.2); gửi chữ
     thì đơn vẫn được nhận nhưng thiếu định vị. Không gửi cả hai: hai nguồn
     cho một đầu tuyến thì bên kia phải chọn, mà ta không biết nó chọn gì. */
  /* Dau kho/cang CHUA co ma OF1 thi tut xuong dia chi chu, khong chan don.
     OF1 co the tra 400 ("receiverLocationId is required for mode EXPORT_*"),
     va the thi don vao 'tu_choi' kem nguyen van cau cua ho — van ro hon mot
     cai nut xam khong bao gio bam duoc. */
  if (khoCang === 'di' && don.originLocation?.of1Id != null)
    p.senderLocationId = don.originLocation.of1Id;
  else if (don.maDiaChiLay) p.pickupAddressCode = don.maDiaChiLay;
  else p.pickupAddress = diaChiLay(don) as string;

  if (khoCang === 'den' && don.destinationLocation?.of1Id != null)
    p.receiverLocationId = don.destinationLocation.of1Id;
  else if (don.maDiaChiGiao) p.deliveryAddressCode = don.maDiaChiGiao;
  else p.deliveryAddress = diaChiGiao(don) as string;

  /* Đầu KHÁCH thì KHÔNG gửi mã kho/cảng, dù địa điểm đó tình cờ có mã.
     Master data của OF1 có cả `State`/`District`, nên một địa điểm của ta
     trùng tên một huyện sẽ mang mã của HUYỆN đó. Gửi nó vào
     `senderLocationId` là nói với OF1 "lấy hàng tại huyện X" thay vì tại địa
     chỉ khách — contract mục 5.2 nói rõ đầu khách đi bằng địa chỉ. */

  /* Nguoi lien he, dung o dau KHACH (dau kho/cang thi OF1 tu biet ai truc).
     Dinh dang `Ten_SDT` theo muc 5.3. Co mot trong hai la gui — tai xe co so
     dien thoai thoi van goi duoc, con co moi ten thi it ra biet hoi ai. */
  const lienHe = [don.customer?.contactName, don.customer?.phone]
    .map((x) => chuoi(x)).filter((x) => x !== undefined).join('_');
  if (lienHe !== '') {
    if (khoCang !== 'di') p.pickupContact = lienHe;
    if (khoCang !== 'den') p.deliveryContact = lienHe;
  }

  if (don.desiredDate) p.deliveryPlan = dinhDangGio(don.desiredDate);

  /* Ô riêng theo dịch vụ: đọc mềm. Đơn cũ không có khoá này, dịch vụ khác
     không có ô này, và cả hai đều KHÔNG phải lỗi — chỉ là không gửi gì. */
  const rieng = (don.serviceData ?? {}) as Record<string, unknown>;
  const hbl = chuoi(typeof rieng.hbl_no === 'string' ? rieng.hbl_no : undefined);
  if (hbl !== undefined) p.hblNo = hbl;
  const booking = chuoi(typeof rieng.booking_code === 'string' ? rieng.booking_code : undefined);
  if (booking !== undefined) p.bookingCode = booking;

  /* `quantity` đi KÈM `quantityUnit` hoặc không đi: thiếu đơn vị là OF1 trả
     400 cho cả request, mất luôn cả những ô khác đã khai đúng. */
  const soKien = soKhongAm(don.packageCount);
  if (soKien !== undefined) {
    p.quantity = soKien;
    /* Đơn chưa khai thì rơi về PK (Package) — ô của BeeOps tên là "Số kiện /
       container" nên nó vốn đã đếm kiện. Mã lạ cũng rơi về PK thay vì gửi
       nguyên: OF1 từ chối NGUYÊN request nếu đơn vị không có trong danh mục,
       mất luôn cả những ô đã khai đúng. */
    p.quantityUnit = chuanDonViTinh(don.quantityUnit) ?? DON_VI_MAC_DINH;
  }

  const tuyChon: [keyof PayloadTmsBill, string | number | undefined][] = [
    ['weight', soKhongAm(don.weightKg)],
    ['volume', soKhongAm(don.volumeCbm)],
    ['note', chuoi(don.note)],
  ];
  for (const [khoa, v] of tuyChon) {
    if (v !== undefined) Object.assign(p, { [khoa]: v });
  }
  return p;
}
