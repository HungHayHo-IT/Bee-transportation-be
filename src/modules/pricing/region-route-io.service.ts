import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '@/common/prisma/prisma.service';
import { normalizeProvince } from '@/common/reference/provinces';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { ImportResultDto } from './dto/pricing.dto';
import { LocationsService } from './locations.service';
import { PriceSessionsService } from './price-sessions.service';
import {
  COT_NHAN_DANG, docKind, type DongNhap, type DonViCot, docTieuDe, giaHaiChieu, gomTheoTuyen, coChieuVe,
  khoaTen, maDonViMoi, tieuDe, type TruongNhanDang,
} from './region-route-excel.helper';

const TEN_TRANG = 'BangGia';
const TRANG_DANH_MUC = 'DanhMuc';
const TRANG_HUONG_DAN = 'HuongDan';

/** Đơn vị tính không đưa vào file: nó là dấu vết của lần chuyển dữ liệu cũ. */
const BO_QUA_DON_VI = ['LEGACY'];

/**
 * Số dòng TRỐNG được gắn ô xổ xuống, tính thêm sau dòng cuối có dữ liệu.
 *
 * File MẪU cần nhiều chỗ: người ta điền cả bảng giá vào đó. File XUẤT thì chỉ
 * cần vài dòng để thêm tuyến mới — gắn dư 500 dòng làm Excel coi bảng dài 591
 * dòng, thanh cuộn tụt xuống một vùng trống mênh mông và nhìn như dữ liệu bị
 * mất.
 */
const DONG_O_CHON_MAU = 500;
const DONG_O_CHON_XUAT = 30;

/**
 * Excel của bảng giá Khu vực → Tuyến → Dịch vụ con → Giá.
 *
 * Một quy trình, ba lối: tải mẫu → điền → nhập; hoặc xuất → sửa → nhập lại. Cả
 * ba dùng CHUNG một hình dạng file, nên file xuất ra nhập lại được nguyên trạng
 * — đó là cách sửa hàng loạt duy nhất mà người làm giá thật sự dùng.
 *
 * Mọi trường trên form đều có mặt trong file: khu vực, hai đầu tuyến (tỉnh +
 * địa điểm), km 2 chiều, dịch vụ con, và giá 1 chiều / 2 chiều của từng đơn vị
 * tính. Sửa ở Excel rồi nhập lại là sửa được đúng những gì sửa được trên form.
 */
/**
 * Màu của file Excel — lấy thẳng từ cam thương hiệu Bee (#FF5A00) để bảng giá
 * in ra nhìn là biết của mình, thay vì xanh than mặc định.
 *
 * Ba sắc độ chứ không một: cột nhận dạng đậm nhất, rồi hai sắc cam nhạt dần
 * luân phiên cho từng CẶP cột "(1 chiều)/(2 chiều)" — ranh giới giữa các đơn
 * vị tính phải thấy được khi rê ngang bốn mươi cột.
 */
const MAU = {
  damNhat: 'FFB34100',
  cam: 'FFFF5A00',
  camNhat: 'FFFF8A42',
  /** Sọc dòng lẻ và viền: cam pha rất loãng, đủ bám mắt mà không chói. */
  soc: 'FFFFF4EC',
  vien: 'FFF0D7C7',
} as const;

@Injectable()
export class RegionRouteIoService {
  constructor(
    private readonly prisma: PrismaService,
    /* Tạo địa điểm đi qua ĐÚNG service của danh mục, không tự `prisma.create`:
       ở đó đã có chuẩn hoá tỉnh, bắt trùng tên bằng chính hàm khoá của CSDL, và
       luật kế thừa khu vực theo tỉnh. Viết lại ở đây là bản sao thứ hai, và
       sớm muộn hai bản nói khác nhau. */
    private readonly diaDiem: LocationsService,
    private readonly phien: PriceSessionsService,
  ) {}

  private donViCot(): Promise<DonViCot[]> {
    return this.prisma.priceUnit.findMany({
      where: { isActive: true, code: { notIn: BO_QUA_DON_VI } },
      select: { code: true, label: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  /* ------------------------------------------------------------------ ra */

  /** File mẫu: tiêu đề đủ cột, một dòng ví dụ dựng từ dữ liệu CÓ THẬT, và danh mục. */
  async templateFile(): Promise<{ buffer: Buffer; fileName: string }> {
    const donVi = await this.donViCot();
    const wb = await this.dungFile(donVi, []);
    return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), fileName: 'mau-bang-gia-khu-vuc.xlsx' };
  }

  /**
   * Xuất toàn bộ bảng giá.
   *
   * Chỉ in những đơn vị tính ĐANG CÓ giá, trừ khi bảng rỗng — 27 đơn vị × 2
   * cột là 54 cột giá, mà một bảng giá thật chỉ dùng 6–10 bậc. In hết là bắt
   * người ta cuộn ngang qua bốn chục cột trống để tìm cột cần sửa.
   */
  async exportFile(sessionId?: number): Promise<{ buffer: Buffer; fileName: string }> {
    const phienId = await this.phien.idPhienDeDoc(sessionId);
    const routes = phienId === null ? [] : await this.prisma.regionRoute.findMany({
      where: { sessionId: phienId },
      include: {
        origin: { include: { region: { select: { name: true } } } },
        destination: true,
        prices: { include: { unit: { select: { code: true, label: true, sortOrder: true } } } },
      },
      orderBy: [{ origin: { name: 'asc' } }, { destination: { name: 'asc' } }],
    });

    const dungMa = new Set(routes.flatMap((r) => r.prices.map((p) => p.unitCode)));
    const tatCa = await this.donViCot();
    const donVi = dungMa.size === 0 ? tatCa : tatCa.filter((u) => dungMa.has(u.code));

    const dong: (string | number | null)[][] = [];
    for (const r of routes) {
      /* Một dòng cho mỗi dịch vụ con của tuyến. Tuyến chưa có giá nào vẫn ra
         MỘT dòng: nó tồn tại thật, và bỏ nó khỏi file xuất thì lần nhập lại
         tiếp theo sẽ không ai nhớ ra là có nó. */
      const theoDichVu = new Map<string, typeof r.prices>();
      for (const p of r.prices) {
        const ds = theoDichVu.get(p.kind) ?? [];
        ds.push(p);
        theoDichVu.set(p.kind, ds);
      }
      const khoi = theoDichVu.size === 0 ? [null] : [...theoDichVu.values()];
      for (const ds of khoi) {
        const dau = ds?.[0];
        const hang: (string | number | null)[] = [
          r.origin.region?.name ?? '',
          r.origin.province ?? '',
          r.origin.name,
          r.destination.province ?? '',
          r.destination.name,
          r.roundTripKm,
          dau?.kind ?? '',
        ];
        for (const u of donVi) {
          const g = ds?.find((p) => p.unitCode === u.code);
          hang.push(g?.oneWayPrice === null || g === undefined ? null : Number(g.oneWayPrice));
          hang.push(g?.roundTripPrice === null || g === undefined ? null : Number(g.roundTripPrice));
        }
        dong.push(hang);
      }
    }

    const wb = await this.dungFile(donVi, dong);
    return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), fileName: 'bang-gia-khu-vuc.xlsx' };
  }

  /** Dựng workbook ba trang. `dong` rỗng = file mẫu (có dòng ví dụ). */
  private async dungFile(
    donVi: readonly DonViCot[],
    dong: readonly (string | number | null)[][],
  ): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'BeeOps';

    this.trangHuongDan(wb);

    const ws = wb.addWorksheet(TEN_TRANG);
    ws.addRow(tieuDe(donVi));
    for (const d of dong) ws.addRow(d);
    this.trangTri(ws, donVi.length, dong.length);

    const [diaDiem, khuVuc] = await Promise.all([
      this.prisma.location.findMany({
        where: { isActive: true },
        select: { name: true, province: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.priceRegion.findMany({ select: { name: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    this.trangDanhMuc(wb, khuVuc, diaDiem);
    this.oDuocChon(ws, khuVuc.length, diaDiem.length, dong.length);
    return wb;
  }

  /**
   * Trang trí sheet BangGia. KHÔNG đụng vào dữ liệu — chỉ định dạng.
   *
   * Bảng này rộng 40+ cột và dài hàng trăm dòng, nên ba thứ quyết định đọc
   * được hay không:
   *
   * * ĐÓNG BĂNG hàng tiêu đề và bảy cột nhận dạng — cuộn sang phải tới cột
   *   "40DC" mà vẫn thấy tuyến nào đang xem. Không có nó thì mỗi lần cuộn là
   *   một lần đếm cột bằng ngón tay.
   * * TÔ CẶP: hai cột "(1 chiều)"/"(2 chiều)" của cùng một đơn vị tính dùng
   *   chung một nền, cặp kế tiếp đổi nền. Bốn mươi cột cùng màu thì không ai
   *   biết con số đang đứng dưới loại xe nào.
   * * ĐỊNH DẠNG SỐ `#,##0` — "10000000" và "10.000.000" đọc khác nhau hẳn.
   *
   * KHÔNG thêm dòng tiêu đề phụ hay gộp ô: bộ nhập đọc hàng 1 là tiêu đề và
   * mỗi dòng phải tự mang đủ hai đầu tuyến. Đẹp mà nhập lại không được thì
   * hỏng cả vòng xuất → sửa → nhập.
   */
  private trangTri(ws: ExcelJS.Worksheet, soDonVi: number, soDong: number): void {
    const soNhanDang = Object.keys(COT_NHAN_DANG).length;
    const tongCot = soNhanDang + soDonVi * 2;
    const vien: Partial<ExcelJS.Borders> = {
      top: { style: 'hair', color: { argb: MAU.vien } },
      left: { style: 'hair', color: { argb: MAU.vien } },
      bottom: { style: 'hair', color: { argb: MAU.vien } },
      right: { style: 'hair', color: { argb: MAU.vien } },
    };

    const dau = ws.getRow(1);
    dau.height = 38;
    for (let c = 1; c <= tongCot; c += 1) {
      const o = dau.getCell(c);
      const laNhanDang = c <= soNhanDang;
      // Cặp cột giá đổi nền luân phiên: cột 8-9 một màu, 10-11 màu kia...
      const cap = Math.floor((c - soNhanDang - 1) / 2);
      o.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      o.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: laNhanDang ? MAU.damNhat : (cap % 2 === 0 ? MAU.cam : MAU.camNhat),
        },
      };
      o.alignment = { wrapText: true, vertical: 'middle', horizontal: laNhanDang ? 'left' : 'center' };
      o.border = vien;
    }

    for (let c = 1; c <= soNhanDang; c += 1) ws.getColumn(c).width = c === 6 ? 11 : 24;
    for (let c = soNhanDang + 1; c <= tongCot; c += 1) ws.getColumn(c).width = 15;

    for (let r = 2; r <= soDong + 1; r += 1) {
      const hang = ws.getRow(r);
      hang.height = 20;
      // Vạch kẻ ngang theo dòng chẵn: mắt bám được một dòng khi rê sang phải.
      const soc = r % 2 === 0 ? undefined : MAU.soc;
      for (let c = 1; c <= tongCot; c += 1) {
        const o = hang.getCell(c);
        o.border = vien;
        if (soc) o.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: soc } };
        if (c > soNhanDang || c === 6) {
          o.numFmt = '#,##0';
          o.alignment = { horizontal: 'right', vertical: 'middle' };
        } else {
          o.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
      }
      // Loại hàng là nhãn ngắn, căn giữa đọc nhanh hơn.
      hang.getCell(soNhanDang).alignment = { horizontal: 'center', vertical: 'middle' };
      hang.getCell(soNhanDang).font = { bold: true };
    }

    ws.views = [{ state: 'frozen', xSplit: soNhanDang, ySplit: 1 }];
    // Lọc ngay trên hàng tiêu đề: tìm một khu vực hay một tỉnh không phải cuộn.
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(soDong + 1, 2), column: tongCot },
    };
  }

  private trangHuongDan(wb: ExcelJS.Workbook): void {
    const ws = wb.addWorksheet(TRANG_HUONG_DAN);
    ws.getColumn(1).width = 110;
    const dong = [
      'MẪU NHẬP BẢNG GIÁ TUYẾN — Khu vực → Tuyến → Dịch vụ con → Giá',
      '',
      'Cách điền',
      `• Chỉ điền ở sheet ${TEN_TRANG}. Mỗi dòng là MỘT tuyến × MỘT dịch vụ con.`,
      '• Cột có dấu * là bắt buộc. Mỗi đơn vị tính có hai cột giá: (1 chiều) và (2 chiều).',
      '• Để trống cả hai cột giá của một đơn vị tính = tuyến này không có mức giá đó.',
      '',
      'Giá 1 chiều và giá 2 chiều',
      '• GIÁ 2 CHIỀU = GIÁ 1 CHIỀU + 50%. Điền giá 1 chiều, bỏ trống cột 2 chiều thì hệ',
      '  thống tự tính (ví dụ 2.000.000 → 3.000.000).',
      '• Tuyến nào có thoả thuận riêng thì điền thẳng vào cột (2 chiều), hệ thống giữ',
      '  nguyên con số đó, không tính lại.',
      '• File chỉ có MỘT cột cho mỗi loại xe (không ghi "(1 chiều)"/"(2 chiều)") thì cột',
      '  đó được hiểu là GIÁ 1 CHIỀU.',
      '• Giá và km là số nguyên, không gõ dấu chấm ngăn cách.',
      '• Tỉnh/thành, địa điểm, khu vực chọn theo sheet ' + TRANG_DANH_MUC + ' (có ô xổ xuống).',
      '',
      'Hệ thống gom dòng thế nào',
      '• Các dòng cùng (Tỉnh đi, Địa chỉ đi, Tỉnh đến, Địa chỉ đến) = MỘT tuyến.',
      '• Trong một tuyến, mỗi dòng là một dịch vụ con; trùng dịch vụ con thì dòng DƯỚI đè dòng trên.',
      '• Mã + Tên cùng nhận ra dịch vụ con: dịch vụ con chưa có mã thì để trống mã, chỉ ghi tên.',
      '',
      'Hai cột cần đọc kỹ',
      '• "Km 2 chiều" thuộc TUYẾN, không thuộc từng mức giá — mọi dòng của một tuyến ghi cùng một số.',
      '• "Khu vực" là khu vực của ĐỊA ĐIỂM ĐI. Sửa nó ở đây sẽ đổi khu vực của địa điểm đó,',
      '  nghĩa là MỌI tuyến đi từ địa điểm đó chuyển sang khu vực mới theo.',
      '',
      'Nhập lại',
      '• Nhập KHÔNG xoá tuyến cũ: tuyến có trong file thì được ghi đè, tuyến không có thì giữ nguyên.',
      '• Trong một tuyến, dịch vụ con có mặt trong file bị THAY CẢ bảng giá; dịch vụ con khác giữ nguyên.',
      '• Xuất Excel dùng đúng cấu trúc sheet này, nên xuất → sửa → nhập lại được.',
    ];
    for (const d of dong) ws.addRow([d]);
    ws.getRow(1).font = { bold: true, size: 14, color: { argb: MAU.damNhat } };
    ws.getRow(1).height = 24;
    for (const r of [3, 9, 17, 22, 27])
      ws.getRow(r).font = { bold: true, color: { argb: MAU.cam } };
    for (let r = 1; r <= ws.rowCount; r += 1) ws.getRow(r).alignment = { vertical: 'middle' };
  }

  private trangDanhMuc(
    wb: ExcelJS.Workbook,
    khuVuc: readonly { name: string }[],
    diaDiem: readonly { name: string; province: string | null }[],
  ): void {
    const ws = wb.addWorksheet(TRANG_DANH_MUC);
    ws.columns = [
      { header: 'Khu vực', width: 18 },
      { header: 'Địa điểm', width: 34 },
      { header: 'Thuộc tỉnh', width: 22 },
      { header: 'Loại hàng', width: 14 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).height = 22;
    ws.getRow(1).alignment = { vertical: 'middle' };
    for (let c = 1; c <= 4; c += 1)
      ws.getRow(1).getCell(c).fill = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: MAU.damNhat },
      };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    // Ba danh sách dài khác nhau nên đi song song theo chỉ số, không ghép cặp:
    // dòng thứ ba KHÔNG có nghĩa là "địa điểm 3 thuộc khu vực 3".
    const loai = ['FCL', 'LCL'];
    const n = Math.max(khuVuc.length, diaDiem.length, loai.length);
    for (let i = 0; i < n; i += 1)
      ws.addRow([
        khuVuc[i]?.name ?? '',
        diaDiem[i]?.name ?? '',
        diaDiem[i]?.province ?? '',
        loai[i] ?? '',
      ]);
  }

  /**
   * Ô xổ xuống cho khu vực và hai cột địa chỉ.
   *
   * Danh mục rỗng thì KHÔNG gắn gì: một ô chọn trỏ vào vùng rỗng làm Excel báo
   * file hỏng, tức là đổi một bất tiện lấy một file không mở được.
   */
  private oDuocChon(
    ws: ExcelJS.Worksheet, soKhuVuc: number, soDiaDiem: number, soDong: number,
  ): void {
    const den = soDong + (soDong === 0 ? DONG_O_CHON_MAU : DONG_O_CHON_XUAT) + 1;
    const gan = (cot: string, nguon: string, ten: string): void => {
      for (let r = 2; r <= den; r += 1)
        ws.getCell(`${cot}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [nguon],
          showErrorMessage: true,
          errorStyle: 'error',
          errorTitle: 'Tên không có trong danh mục',
          error: `Chọn ${ten} từ danh sách. Gõ tay một cái tên chưa có trong hệ thống `
            + 'thì lúc nhập lên dòng đó sẽ bị bỏ.',
        };
    };
    if (soKhuVuc > 0) gan('A', `${TRANG_DANH_MUC}!$A$2:$A$${soKhuVuc + 1}`, 'khu vực');
    if (soDiaDiem > 0) {
      gan('C', `${TRANG_DANH_MUC}!$B$2:$B$${soDiaDiem + 1}`, 'địa chỉ đi');
      gan('E', `${TRANG_DANH_MUC}!$B$2:$B$${soDiaDiem + 1}`, 'địa chỉ đến');
    }
  }

  /* ---------------------------------------------------------------- vào */

  /**
   * Nhập file.
   *
   * KHÔNG xoá sạch rồi ghi lại: file thường chỉ chứa một phần bảng giá (một
   * khu vực, một đợt điều chỉnh), và xoá những tuyến không có trong file là
   * cách mất cả bảng giá bằng một lần nhập nhầm. Tuyến có trong file thì ghi
   * đè, tuyến khác giữ nguyên.
   */
  async importFile(
    buffer: Buffer, user: AuthenticatedUser, sessionId?: number,
  ): Promise<ImportResultDto> {
    /* Phiên ĐANG ÁP DỤNG là giá đang báo cho khách: nhập đè cả file vào đó là
       đổi giá thật mà không qua bước công bố. Chặn TRƯỚC khi đọc file — đọc
       xong mới chặn thì đơn vị tính mới đã kịp được tạo. */
    const phienDoc = await this.phien.idPhienDeDoc(sessionId);
    if (phienDoc !== null) {
      const p = await this.prisma.priceSession.findUnique({
        where: { id: phienDoc }, select: { status: true, name: true },
      });
      if (p?.status === 'active')
        throw new BadRequestException(
          `Phiên "${p.name}" đang áp dụng nên không nhập Excel được. Tạo phiên mới `
          + '(chép từ phiên này nếu cần), nhập vào phiên mới rồi công bố.',
        );
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet(TEN_TRANG) ?? wb.worksheets[0];
    if (!ws) throw new BadRequestException(`File không có sheet nào — cần sheet "${TEN_TRANG}"`);

    const donVi = await this.donViCot();
    const header: (string | null)[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => {
      header[i - 1] = c.value === null || c.value === undefined ? null : String(c.value);
    });
    const { nhanDang, gia: cotGia } = docTieuDe(header, donVi);
    for (const can of ['originName', 'destinationName'] as TruongNhanDang[])
      if (nhanDang[can] === undefined)
        throw new BadRequestException(
          `Không tìm thấy cột "${COT_NHAN_DANG[can]}" trong hàng tiêu đề. `
          + 'Tải lại file mẫu để lấy đúng tên cột.',
        );
    if (cotGia.length === 0)
      throw new BadRequestException(
        'Không nhận ra cột giá nào. Mỗi loại xe / container một cột, tiêu đề là tên đơn '
        + 'vị tính — thêm " (1 chiều)" nếu muốn tách riêng hai chiều.',
      );

    const boQua: string[] = [];
    const ghiChu: string[] = [];
    /** Dòng không khai địa chỉ nào — dòng ví dụ, hoặc file chưa điền. */
    let thieuDiaChi = 0;
    const dongs: DongNhap[] = [];
    const chu = (c: ExcelJS.Cell): string => {
      const v = c.value;
      if (v === null || v === undefined) return '';
      if (typeof v === 'object' && 'richText' in v)
        return (v.richText as { text: string }[]).map((t) => t.text).join('').trim();
      if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text).trim();
      return String(v).trim();
    };
    const so = (c: ExcelJS.Cell): number | null => {
      const t = chu(c).replace(/[.,\s]/g, '');
      if (t === '') return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };

    /* Đơn vị tính CHƯA CÓ trong danh mục được tạo khi nhập: bảng giá thật của
       Bee có bậc '8T', '20DC', '40DC' mà danh mục chưa khai, và từ chối chúng
       nghĩa là phải đi tạo tay từng cái trước khi nhập được file đầu tiên.

       Chỉ tạo khi cột đó THẬT SỰ có số: một cột ghi chú lọt vào giữa bảng
       không được đẻ ra đơn vị tính rác. */
    const coSo = new Set<number>();
    ws.eachRow({ includeEmpty: false }, (row, i) => {
      if (i === 1) return;
      for (const c of cotGia) if (so(row.getCell(c.cot)) !== null) coSo.add(c.cot);
    });
    const maTheoCot = new Map<number, string>();
    for (const c of cotGia) {
      if (c.unitCode !== null) {
        maTheoCot.set(c.cot, c.unitCode);
      } else if (coSo.has(c.cot)) {
        const ma = await this.themDonVi(c.tenDonVi);
        maTheoCot.set(c.cot, ma);
        ghiChu.push(`Đã thêm đơn vị tính "${c.tenDonVi}" (mã ${ma}) vào danh mục.`);
      } else {
        ghiChu.push(`Bỏ qua cột "${c.tenDonVi}": không khớp đơn vị tính nào và không có giá nào.`);
      }
    }

    const o = (truong: TruongNhanDang, row: ExcelJS.Row): string => {
      const cot = nhanDang[truong];
      return cot === undefined ? '' : chu(row.getCell(cot));
    };

    ws.eachRow({ includeEmpty: false }, (row, i) => {
      if (i === 1) return;
      const cotKm = nhanDang.roundTripKm;
      const d: DongNhap = {
        dong: i,
        regionName: o('regionName', row),
        originProvince: o('originProvince', row),
        originName: o('originName', row),
        destinationProvince: o('destinationProvince', row),
        destinationName: o('destinationName', row),
        roundTripKm: cotKm === undefined ? null : so(row.getCell(cotKm)),
        kindRaw: o('kind', row),
        kind: docKind(o('kind', row)),
        gia: [],
      };
      /* Dòng trắng và dòng VÍ DỤ của file mẫu (có khu vực + mã dịch vụ nhưng
         chưa có địa chỉ) không phải lỗi của người nhập, nên không kêu từng
         dòng một. Nhưng ĐẾM lại: cả file toàn dòng như vậy thì câu trả lời
         đúng là "file chưa có dữ liệu", chứ không phải một chữ "xong" lặng lẽ
         rồi màn hình vẫn trống. */
      if (d.originName === '' && d.destinationName === '') {
        thieuDiaChi += 1;
        return;
      }
      if (d.originName === '' || d.destinationName === '') {
        boQua.push(`Dòng ${i}: thiếu địa chỉ đi hoặc địa chỉ đến`);
        return;
      }
      /* Gom theo CỘT chứ không theo đơn vị tính: một đơn vị có thể có hai cột
         (1 chiều / 2 chiều), còn cột không hậu tố tính là giá một chiều. */
      const theoMa = new Map<string, { oneWayPrice: number | null; roundTripPrice: number | null }>();
      for (const c of cotGia) {
        const ma = maTheoCot.get(c.cot);
        if (ma === undefined) continue;
        const v = so(row.getCell(c.cot));
        // Ô trống = tuyến này không có mức giá đó, KHÁC với giá 0.
        if (v === null) continue;
        const cu = theoMa.get(ma) ?? { oneWayPrice: null, roundTripPrice: null };
        if (c.chieu === 'mot') cu.oneWayPrice = v;
        else cu.roundTripPrice = v;
        theoMa.set(ma, cu);
      }
      /* Dòng CHỈ có hai đầu tuyến, không loại hàng và không giá: nhận, và ghi
         đúng một cái tuyến. Chính file XUẤT RA của hệ thống in ra dòng như
         vậy cho tuyến chưa khai giá — từ chối nó là từ chối lại file của
         chính mình, và vòng xuất → sửa → nhập lại mất một tuyến mà không ai
         để ý. */
      if (d.kindRaw === '' && theoMa.size === 0) {
        dongs.push(d);
        return;
      }
      if (d.kindRaw === '') {
        boQua.push(`Dòng ${i}: có giá nhưng thiếu cột "Loại hàng" — ghi FCL hoặc LCL`);
        return;
      }
      if (d.kind === null) {
        boQua.push(
          `Dòng ${i}: "${d.kindRaw}" không đọc ra FCL hay LCL. Ghi FCL / LCL, `
          + 'hoặc mã dịch vụ có đuôi _FCL / _LCL.',
        );
        return;
      }
      for (const [unitCode, g] of theoMa) {
        /* Có giá một chiều mà file KHÔNG khai giá hai chiều thì suy ra: cộng
           thêm 50%. File có cột "(2 chiều)" riêng thì tin con số trong file —
           tuyến có thoả thuận riêng mới cần cột đó. */
        const haiChieu = g.roundTripPrice === null && g.oneWayPrice !== null && coChieuVe(unitCode)
          ? giaHaiChieu(g.oneWayPrice)
          : g.roundTripPrice;
        d.gia.push({ unitCode, oneWayPrice: g.oneWayPrice, roundTripPrice: haiChieu });
      }
      dongs.push(d);
    });

    const soSuyRa = dongs.reduce(
      (n, d) => n + d.gia.filter((g) => g.oneWayPrice !== null && g.roundTripPrice !== null).length, 0,
    );
    const { tuyen, deLen } = gomTheoTuyen(dongs);
    /* Phiên để ghi vào: phiên được chọn trên màn hình, hoặc phiên đang áp
       dụng; chưa có phiên nào thì tạo phiên đầu tiên. Phiên đã lưu trữ bị từ
       chối ngay ở đây, trước khi đọc bất cứ dòng nào. */
    const { id: phienId, vuaTao } = await this.phien.idPhienDeGhi(sessionId, user);
    if (vuaTao !== null) ghiChu.push(`Chưa có phiên giá nào nên đã tạo phiên "${vuaTao}".`);
    const { imported, soTuyen } = await this.ghiTuyen(tuyen, phienId, boQua, ghiChu, user);

    /* Nhập xong mà màn hình vẫn trống là lúc người dùng cần một câu giải
       thích nhất — và cũng là lúc dễ nhất để im lặng: không dòng nào lỗi thì
       `skipped` rỗng, và "đã nhập 0 dòng" đọc như một thành công. Nói thẳng
       cái đang thiếu, theo đúng thứ tự phải sửa. */
    if (soTuyen === 0 && boQua.length === 0) {
      if (thieuDiaChi > 0)
        boQua.push(
          `File có ${thieuDiaChi} dòng nhưng chưa dòng nào điền "Địa chỉ đi" và `
          + '"Địa chỉ đến" — đó là các dòng ví dụ. Điền địa chỉ vào rồi nhập lại.',
        );
      else boQua.push('File không có dòng dữ liệu nào.');
    } else if (soTuyen > 0) {
      ghiChu.push(
        imported === 0
          ? `Đã ghi ${soTuyen} tuyến, chưa tuyến nào có giá.`
          : `Đã ghi ${soTuyen} tuyến với ${imported} mức giá.`,
      );
      if (imported > 0 && soSuyRa > 0)
        ghiChu.push(
          'Giá trong file được ghi vào ô "1 chiều"; ô "2 chiều" tính bằng giá 1 chiều '
          + '+ 50%. Sửa lại từng tuyến được nếu có thoả thuận riêng.',
        );
    }
    return { imported, merged: deLen, skipped: boQua, notes: ghiChu, routes: soTuyen };
  }

  /**
   * Thêm một đơn vị tính mới từ tiêu đề cột, trả về mã.
   *
   * `kind` suy ra từ tên: có 'DC'/'CONT'/'HC' là container nên FCL, còn lại là
   * LCL — đúng luật Bee ở migration 055. Đoán sai thì admin sửa một dòng danh
   * mục; chặn lại thì cả file không nhập được.
   */
  private async themDonVi(ten: string): Promise<string> {
    const goc = maDonViMoi(ten);
    /* Mã sinh từ tên đã BỎ DẤU, nên "5T Bạt" và "5T Bất" ra cùng một mã. Gặp
       mã đã có nhưng NHÃN khác thì không dùng lại: làm thế là hai bậc giá khác
       nhau âm thầm nhập làm một, và bảng giá của cái sau đè lên cái trước. Lấy
       mã trống kế tiếp. */
    let ma = goc;
    for (let i = 2; i < 50; i += 1) {
      const dungMa = await this.prisma.priceUnit.findUnique({ where: { code: ma } });
      if (!dungMa) break;
      if (dungMa.label.trim() === ten.trim()) return dungMa.code;
      ma = `${goc}_${i}`.slice(0, 40);
    }
    const daCo = await this.prisma.priceUnit.findUnique({ where: { code: ma } });
    if (daCo) return daCo.code;
    const cuoi = await this.prisma.priceUnit.aggregate({ _max: { sortOrder: true } });
    const u = await this.prisma.priceUnit.create({
      data: {
        code: ma,
        label: ten.trim(),
        kind: /dc|cont|hc/i.test(ten) ? 'FCL' : 'LCL',
        sortOrder: (cuoi._max.sortOrder ?? 0) + 1,
      },
    });
    return u.code;
  }

  /** Ghi từng tuyến đã gom. Một tuyến hỏng không chặn các tuyến còn lại. */
  private async ghiTuyen(
    tuyen: Map<string, import('./region-route-excel.helper').TuyenGom>,
    phienId: number,
    boQua: string[],
    ghiChu: string[],
    user: AuthenticatedUser,
  ): Promise<{ imported: number; soTuyen: number }> {
    const khuVuc = await this.prisma.priceRegion.findMany({ select: { id: true, name: true } });

    /**
     * Tìm địa điểm theo TÊN + TỈNH, chưa có thì TẠO.
     *
     * Hỏi bằng CHÍNH hàm khoá của CSDL (`loc_name_key`) chứ không so bằng một
     * bản chuẩn hoá viết lại trong TypeScript. Hàm đó đổi '.' thành ',' rồi
     * cắt mọi dấu thừa ở hai đầu, nên "VĨNH LINH, GIO LINH" và "VĨNH LINH. GIO
     * LINH" là MỘT. Bản JS không biết luật đó: nó bảo "chưa có", rồi lệnh ghi
     * đâm vào chỉ số unique và ném 409 — đúng lỗi vừa xảy ra khi nhập file.
     *
     * Tên không thôi là chưa đủ khi file có cột tỉnh: "Kho trung chuyển" có ở
     * cả ba miền, và khớp nhầm thì giá của tuyến này rơi vào tuyến khác mà
     * không ai thấy gì bất thường.
     *
     * Tạo mới cần CÓ TỈNH: một địa điểm không tỉnh thì không thuộc khu vực
     * nào, nên mọi tuyến đi từ nó tàng hình ở màn khu vực.
     */
    const daTim = new Map<string, { id: number; regionId: number | null }>();
    const timHoacTao = async (
      ten: string, tinh: string, khuVucId: number | null,
    ): Promise<{ id: number; regionId: number | null } | string> => {
      const tinhChuan = tinh === '' ? null : normalizeProvince(tinh);
      if (tinh !== '' && tinhChuan === null)
        return `tỉnh "${tinh}" không có trong danh mục 34 tỉnh/thành`;

      const khoa = `${khoaTen(ten)}|${tinhChuan ?? ''}`;
      const daCo = daTim.get(khoa);
      if (daCo !== undefined) return daCo;

      /* Khớp KHÔNG lọc is_active: chỉ số unique của CSDL không lọc, nên một
         địa điểm đã tắt vẫn chặn việc tạo trùng. Bỏ qua nó rồi tạo mới là cầm
         chắc 409. */
      const hop = await this.prisma.$queryRaw<{ id: number; region_id: number | null }[]>`
        SELECT id, region_id FROM locations
         WHERE loc_name_key(name) = loc_name_key(${ten})
           AND (${tinhChuan}::text IS NULL OR province = ${tinhChuan})
         LIMIT 3`;
      if (hop.length > 1)
        return `có ${hop.length} địa điểm tên "${ten}" — ghi thêm cột tỉnh để phân biệt`;
      if (hop.length === 1) {
        const ra = { id: hop[0]!.id, regionId: hop[0]!.region_id };
        daTim.set(khoa, ra);
        return ra;
      }
      if (tinhChuan === null)
        return `chưa có địa điểm "${ten}", và dòng này không ghi tỉnh nên không tạo được`;

      const moi = await this.diaDiem.createLocation(
        { name: ten, province: tinhChuan, ...(khuVucId === null ? {} : { regionId: khuVucId }) },
        user,
      );
      ghiChu.push(`Đã thêm địa điểm "${moi.name}" (${tinhChuan}) vào danh mục.`);
      const ra = { id: moi.id, regionId: moi.regionId };
      daTim.set(khoa, ra);
      return ra;
    };

    let imported = 0;
    let soTuyen = 0;
    for (const t of tuyen.values()) {
      try {
      /* Khu vực đọc TRƯỚC hai đầu tuyến: địa điểm đi tạo mới cần biết nó thuộc
         khu vực nào ngay lúc tạo, chứ không phải sửa lại ở câu lệnh sau. */
      let khuVucId: number | null = null;
      if (t.regionName !== '') {
        const kv = khuVuc.find((r) => khoaTen(r.name) === khoaTen(t.regionName));
        if (kv === undefined) {
          boQua.push(`Tuyến ${t.originName} → ${t.destinationName}: không có khu vực "${t.regionName}"`);
          continue;
        }
        khuVucId = kv.id;
      }

      const di = await timHoacTao(t.originName, t.originProvince, khuVucId);
      if (typeof di === 'string') { boQua.push(`Tuyến ${t.originName} → ${t.destinationName}: ${di}`); continue; }
      const den = await timHoacTao(t.destinationName, t.destinationProvince, null);
      if (typeof den === 'string') { boQua.push(`Tuyến ${t.originName} → ${t.destinationName}: ${den}`); continue; }
      if (di.id === den.id) {
        boQua.push(`Tuyến ${t.originName} → ${t.destinationName}: hai đầu là cùng một địa điểm`);
        continue;
      }

      /* Khu vực trong file đổi khu vực của ĐỊA ĐIỂM ĐI — đó là nơi duy nhất
         khu vực được lưu, nên đây cũng là cách duy nhất sửa nó từ Excel. */
      if (khuVucId !== null && khuVucId !== di.regionId)
        await this.prisma.location.update({ where: { id: di.id }, data: { regionId: khuVucId } });

      const route = await this.prisma.regionRoute.upsert({
        where: {
          sessionId_originId_destinationId: {
            sessionId: phienId, originId: di.id, destinationId: den.id,
          },
        },
        create: {
          sessionId: phienId,
          originId: di.id,
          destinationId: den.id,
          roundTripKm: t.roundTripKm,
          createdBy: user.id,
        },
        update: { roundTripKm: t.roundTripKm, updatedAt: new Date() },
      });

      for (const d of t.dichVu.values()) {
        if (d.kind === null) continue;
        if (d.gia.length === 0 && t.dichVu.size === 1) break;
        /* THAY CẢ bảng giá của khối FCL (hoặc LCL) đó trên tuyến này — giống
           hệt luật của form. Khối còn lại không bị đụng tới: file thường chỉ
           chứa một phần bảng giá. */
        await this.prisma.$transaction([
          this.prisma.regionRoutePrice.deleteMany({
            where: { routeId: route.id, kind: d.kind },
          }),
          this.prisma.regionRoutePrice.createMany({
            data: d.gia.map((g) => ({
              routeId: route.id,
              kind: d.kind as string,
              unitCode: g.unitCode,
              oneWayPrice: g.oneWayPrice,
              roundTripPrice: g.roundTripPrice,
            })),
          }),
        ]);
        imported += d.gia.length;
      }
      soTuyen += 1;
      } catch (e) {
        /* Một tuyến hỏng KHÔNG được giết cả lần nhập. Trước đây một lỗi 409
           duy nhất ném thẳng ra ngoài: cả file trượt, và người dùng chỉ nhận
           được một câu về một cái tên, không biết 40 dòng còn lại ra sao. */
        boQua.push(`Tuyến ${t.originName} → ${t.destinationName}: ${(e as Error).message}`);
      }
    }
    return { imported, soTuyen };
  }
}
