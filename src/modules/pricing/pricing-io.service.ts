import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ImportResultDto } from './dto/pricing.dto';
import { DongGia, docGiaTuChuoi, gopDongTrung } from './price-session.helper';
import { loiNhapBangGia } from './import-loi.helper';
import { COT } from './pricing-cot';

@Injectable()
export class PricingIoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nhập bảng giá từ Excel vào một phiên.
   *
   * Khớp địa điểm và dịch vụ theo TÊN, không theo id: người sửa file trong
   * Excel gõ "Kho Đà Nẵng", họ không biết id là số mấy, và bắt họ điền id là
   * biến một việc mười phút thành một việc cả buổi.
   *
   * Tên không khớp thì BỎ DÒNG và nói rõ dòng thứ mấy sai gì. Không tự tạo
   * địa điểm mới: một lỗi gõ ("Kho ĐNẵng") sẽ lặng lẽ sinh ra một địa điểm
   * thứ hai, và từ đó bảng giá có hai đầu tuyến trông như một.
   */
  async importPrices(sessionId: number, buffer: Buffer): Promise<ImportResultDto> {
    const phien = await this.prisma.priceSession.findUnique({ where: { id: sessionId } });
    if (!phien) throw new NotFoundException('Không tìm thấy phiên giá');
    if (phien.status === 'archived')
      throw new BadRequestException('Phiên đã lưu trữ không nhập được — hãy chép ra một phiên mới');
    if (!buffer?.length) throw new BadRequestException('Chưa chọn file');

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Không đọc được file — cần file Excel (.xlsx)');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('File không có trang tính nào');

    // Tra tên -> id một lần, không hỏi DB theo từng dòng.
    /* Khớp tên địa điểm bằng CHÍNH `loc_name_key()` của CSDL — cùng hàm mà
       chỉ số unique của bảng `locations` dùng.

       Trước đây chỗ này khớp bằng `chuanHoa()`, vốn chỉ bỏ dấu cách thừa và
       hoa thường. Nhưng `loc_name_key()` còn gộp dấu CHẤM vào dấu PHẨY, vì
       bảng giá thật viết cùng một nơi theo hai kiểu. Hậu quả đo được: nhập
       bảng giá miền Trung bỏ 48 dòng với lý do 'không có địa điểm "VĨNH LINH.
       GIO LINH"' — trong khi địa điểm ĐÃ CÓ, chỉ là lưu dưới dạng "VĨNH LINH,
       GIO LINH". Hai định nghĩa cho cùng một câu hỏi thì sớm muộn lệch nhau.

       Tính khoá cho tên trong FILE cũng bằng hàm đó, trong một câu lệnh cho cả
       danh sách — không viết lại luật bằng TypeScript, vì làm thế là dựng lại
       đúng bản sao vừa gỡ bỏ. */
    const [diaDiem, donVi] = await Promise.all([
      this.prisma.$queryRaw<{ id: number; k: string }[]>`
        SELECT id, loc_name_key(name) AS k FROM locations`,
      this.prisma.priceUnit.findMany({ select: { code: true, label: true } }),
    ]);
    const theoKhoa = new Map(diaDiem.map((l) => [l.k, l.id]));
    /* Nhận CẢ MÃ lẫn NHÃN: file xuất ra ghi nhãn ("20'DC ≤ 17 tấn") cho người
       đọc, còn người quen việc thì gõ thẳng mã. Bắt đúng một dạng là nửa số
       file gửi lên bị trả về vì một lý do không ai đoán ra. */
    const theoDonVi = new Map<string, string>();
    for (const u of donVi) {
      theoDonVi.set(chuanHoa(u.code), u.code);
      theoDonVi.set(chuanHoa(u.label), u.code);
    }

    const viTri = doViTriCot(ws);

    const dong: DongGia[] = [];
    const boQua: string[] = [];

    const oCua = (row: ExcelJS.Row, k: keyof typeof viTri): unknown => {
      const c = viTri[k];
      return c === null ? undefined : row.getCell(c).value;
    };

    /* Lượt một: gom mọi tên có trong file, rồi hỏi CSDL khoá của chúng bằng
       một câu lệnh. `ws.eachRow` chạy đồng bộ nên không chờ được theo từng
       dòng, và hỏi từng dòng cũng là 630 lần đi về vô ích. */
    const tenTrongFile = new Set<string>();
    ws.eachRow((row, i) => {
      if (i === 1) return;
      for (const k of ['origin', 'destination'] as const) {
        const ten = chuoi(oCua(row, k)).trim();
        if (ten) tenTrongFile.add(ten);
      }
    });
    const khoaCuaTen = new Map<string, string>(
      tenTrongFile.size === 0
        ? []
        : (
            await this.prisma.$queryRaw<{ ten: string; k: string }[]>`
              SELECT t AS ten, loc_name_key(t) AS k
                FROM unnest(${[...tenTrongFile]}::text[]) AS t`
          ).map((r) => [r.ten, r.k]),
    );
    const timDiaDiem = (ten: string): number | undefined => {
      const k = khoaCuaTen.get(ten.trim());
      return k === undefined ? undefined : theoKhoa.get(k);
    };

    ws.eachRow((row, i) => {
      if (i === 1) return; // hàng tiêu đề
      const doc = (k: keyof typeof viTri): unknown => oCua(row, k);

      const tenDi = chuoi(doc('origin')).trim();
      const tenDen = chuoi(doc('destination')).trim();
      // Hàng trống hoàn toàn: bỏ im lặng. Excel hay để lại vài hàng rỗng ở
      // cuối, báo lỗi cho chúng chỉ làm danh sách lỗi dài ra vô ích.
      if (!tenDi && !tenDen) return;

      const originId = timDiaDiem(tenDi);
      const destinationId = timDiaDiem(tenDen);
      const unitCode = theoDonVi.get(chuanHoa(chuoi(doc('unit'))));
      const price = docGiaTuChuoi(oGiaTri(doc('price')));

      if (originId === undefined) return void boQua.push(`Dòng ${i}: không có địa điểm "${chuoi(doc('origin'))}"`);
      if (destinationId === undefined) return void boQua.push(`Dòng ${i}: không có địa điểm "${chuoi(doc('destination'))}"`);
      if (unitCode === undefined) return void boQua.push(`Dòng ${i}: không có đơn vị tính "${chuoi(doc('unit'))}"`);
      if (originId === destinationId) return void boQua.push(`Dòng ${i}: điểm đi và điểm đến trùng nhau`);
      if (price === null) return void boQua.push(`Dòng ${i}: giá không đọc được`);

      dong.push({ originId, destinationId, unitCode, price, note: chuoi(doc('note')) || null });
    });

    const { ra, soTrung } = gopDongTrung(dong);
    if (ra.length === 0)
      throw new BadRequestException(
        loiNhapBangGia({ boQua, soDiaDiem: diaDiem.length, soDonVi: donVi.length }),
      );

    // GHI ĐÈ theo tuyến, không xoá sạch phiên rồi nạp lại: file nhập vào
    // thường chỉ là một phần bảng giá, xoá sạch trước là mất những tuyến
    // không có trong file mà không ai yêu cầu.
    await this.prisma.$transaction(
      ra.map((d) =>
        this.prisma.routePrice.upsert({
          where: {
            sessionId_originId_destinationId_unitCode: {
              sessionId,
              originId: d.originId,
              destinationId: d.destinationId,
              unitCode: d.unitCode,
            },
          },
          create: { sessionId, ...d },
          update: { price: d.price, note: d.note ?? null, updatedAt: new Date() },
        }),
      ),
    );

    return { imported: ra.length, merged: soTrung, skipped: boQua.slice(0, 50) };
  }
}

/** Bỏ dấu cách thừa và phân biệt hoa thường — tên gõ tay không bao giờ khớp y hệt. */
function chuanHoa(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function chuoi(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text ?? '');
  if (typeof v === 'object' && 'result' in (v as object)) return String((v as { result: unknown }).result ?? '');
  return String(v);
}

/** Ô giá có thể là số, chuỗi, hoặc một công thức đã tính sẵn. */
function oGiaTri(v: unknown): unknown {
  if (v !== null && typeof v === 'object' && 'result' in (v as object))
    return (v as { result: unknown }).result;
  return v;
}

/**
 * Dò cột theo TIÊU ĐỀ, không theo thứ tự cố định.
 *
 * Người ta chèn thêm một cột vào giữa là chuyện thường, và đọc theo vị trí
 * cứng thì toàn bộ file lệch một cột — giá rơi vào ô ghi chú, im lặng.
 */
function doViTriCot(ws: ExcelJS.Worksheet): Record<keyof typeof COT, number | null> {
  const hang = ws.getRow(1);
  const map: Record<string, number> = {};
  hang.eachCell((cell, col) => {
    map[chuanHoa(chuoi(cell.value))] = col;
  });
  const tim = (nhan: string): number | null => map[chuanHoa(nhan)] ?? null;

  const ra = {
    origin: tim(COT.origin),
    destination: tim(COT.destination),
    unit: tim(COT.unit),
    price: tim(COT.price),
    note: tim(COT.note),
  };
  /* 'unit' BẮT BUỘC. Cho thiếu rồi gán một đơn vị mặc định thì cả file vào hết
     dưới một loại xe, trông như nhập thành công — mà bảng giá thì sai toàn bộ
     và không có gì báo. */
  const thieu = (['origin', 'destination', 'unit', 'price'] as const)
    .filter((k) => ra[k] === null);
  if (thieu.length)
    throw new BadRequestException(
      `File thiếu cột: ${thieu.map((k) => COT[k]).join(', ')}. Hãy xuất file mẫu rồi sửa trên đó.`,
    );
  return ra;
}
