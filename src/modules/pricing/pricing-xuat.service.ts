import { Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '@/common/prisma/prisma.service';
import { COT } from './pricing-cot';
import { themODuocChon, themTrangDanhMuc } from './excel-danh-muc.helper';

/** Hai lối RA Excel: file mẫu để nhập, và file xuất của một phiên đã có dữ liệu. */
@Injectable()
export class PricingXuatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * File MẪU để nhập bảng giá.
   *
   * Khác file xuất: file xuất chỉ là mẫu khi phiên ĐÃ có dữ liệu — phiên mới
   * tạo thì họ nhận về đúng một hàng tiêu đề trống, và không có cách nào biết
   * phải gõ tên địa điểm thế nào cho khớp.
   *
   * Hai trang tính, và trang thứ hai mới là thứ giải quyết gốc vấn đề:
   *
   * * "Bảng giá" — năm cột, kèm vài dòng ví dụ dựng từ địa điểm và dịch vụ CÓ
   *   THẬT trong hệ thống. Ví dụ bịa ra thì người ta điền giá vào rồi nhập lên
   *   và nhận về một danh sách lỗi.
   * * "Danh mục" — liệt kê toàn bộ tên địa điểm và tên dịch vụ đang có. Import
   *   khớp theo TÊN, nên đưa họ danh sách để CHÉP còn hơn để họ gõ tay rồi
   *   sai một dấu.
   */
  async templateFile(): Promise<{ buffer: Buffer; fileName: string }> {
    const [diaDiem, donVi] = await Promise.all([
      this.prisma.location.findMany({
        where: { isActive: true },
        select: { name: true, province: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.priceUnit.findMany({
        where: { isActive: true },
        select: { label: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BeeOps';

    const ws = wb.addWorksheet('Bảng giá');
    ws.columns = [
      { header: COT.origin, key: 'origin', width: 28 },
      { header: COT.destination, key: 'destination', width: 28 },
      { header: COT.unit, key: 'unit', width: 30 },
      { header: COT.price, key: 'price', width: 18 },
      { header: COT.note, key: 'note', width: 40 },
    ];
    ws.getRow(1).font = { bold: true };

    // Hai dòng ví dụ, chỉ dựng khi có đủ hai địa điểm khác nhau và một đơn vị
    // tính. Thiếu thì để trống còn hơn bịa ra tên không nhập được.
    if (diaDiem.length >= 2 && donVi.length > 0) {
      ws.addRow({
        origin: diaDiem[0]!.name, destination: diaDiem[1]!.name,
        unit: donVi[0]?.label ?? '',
        price: 1500000, note: 'Dòng ví dụ — xoá đi trước khi nhập',
      });
      ws.addRow({
        origin: diaDiem[1]!.name, destination: diaDiem[0]!.name,
        unit: donVi[1]?.label ?? donVi[0]?.label ?? '',
        price: 1450000, note: 'Cùng tuyến khác đơn vị tính là một dòng riêng',
      });
    }
    ws.getColumn('price').numFmt = '#,##0';

    const dm = themTrangDanhMuc(wb, diaDiem, donVi.map((u) => ({ name: u.label })));
    themODuocChon(ws, dm.soDiaDiem, dm.soDonVi, ws.rowCount - 1);

    return {
      buffer: Buffer.from(await wb.xlsx.writeBuffer()),
      fileName: 'mau-nhap-bang-gia.xlsx',
    };
  }

  /**
   * Xuất bảng giá của một phiên ra Excel.
   *
   * File xuất ra CHÍNH LÀ mẫu để nhập vào: cùng tiêu đề cột, cùng thứ tự. Nhờ
   * thế quy trình sửa hàng loạt là xuất → sửa trong Excel → nhập lại, không
   * phải đi tìm một file mẫu riêng rồi tự khớp cột.
   */
  async exportPrices(sessionId: number): Promise<{ buffer: Buffer; fileName: string }> {
    const phien = await this.prisma.priceSession.findUnique({ where: { id: sessionId } });
    if (!phien) throw new NotFoundException('Không tìm thấy phiên giá');

    const rows = await this.prisma.routePrice.findMany({
      where: { sessionId },
      include: {
        origin: { select: { name: true } },
        destination: { select: { name: true } },
        unit: { select: { label: true } },
      },
      orderBy: [{ origin: { name: 'asc' } }, { destination: { name: 'asc' } }],
      take: 20000,
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BeeOps';
    const ws = wb.addWorksheet('Bảng giá');
    ws.columns = [
      { header: COT.origin, key: 'origin', width: 28 },
      { header: COT.destination, key: 'destination', width: 28 },
      { header: COT.unit, key: 'unit', width: 30 },
      { header: COT.price, key: 'price', width: 18 },
      { header: COT.note, key: 'note', width: 40 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const r of rows)
      ws.addRow({
        origin: r.origin.name,
        destination: r.destination.name,
        unit: r.unit.label,
        price: Number(r.price),
        note: r.note ?? '',
      });

    ws.getColumn('price').numFmt = '#,##0';
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

    /* File xuất ra cũng có trang Danh mục và ô chọn, không chỉ file mẫu: quy
       trình sửa hàng loạt là xuất → sửa trong Excel → nhập lại, nên đúng lúc
       người ta sửa nhiều nhất lại là lúc cần được đỡ nhất. */
    const [diaDiem, donVi] = await Promise.all([
      this.prisma.location.findMany({
        where: { isActive: true },
        select: { name: true, province: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.priceUnit.findMany({
        where: { isActive: true },
        select: { label: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    const dm = themTrangDanhMuc(wb, diaDiem, donVi.map((u) => ({ name: u.label })));
    themODuocChon(ws, dm.soDiaDiem, dm.soDonVi, rows.length);

    return {
      buffer: Buffer.from(await wb.xlsx.writeBuffer()),
      fileName: `bang-gia-${tenAscii(phien.name) || phien.id}.xlsx`,
    };
  }

}

/**
 * Tên file cho header Content-Disposition: CHỈ ASCII.
 *
 * Header HTTP không mang được ký tự ngoài ASCII — Node ném ERR_INVALID_CHAR và
 * cả request thành 500, tức là bấm "Xuất Excel" không ra gì mà cũng không báo
 * gì. Bỏ dấu tiếng Việt rồi lọc phần còn lại; tên file mất dấu vẫn mở được,
 * còn một cái 500 thì không.
 */
function tenAscii(s: string): string {
  return s
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
