import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { normalizeProvince } from '@/common/reference/provinces';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { ImportResultDto } from './dto/pricing.dto';

/** Tiêu đề cột của file nhập địa điểm. Chỉ hai cột đầu là bắt buộc. */
export const COT_DIA_DIEM = {
  name: 'Tên',
  province: 'Tỉnh/thành',
  address: 'Địa chỉ',
  office: 'Văn phòng',
} as const;

const chuoi = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '').trim();
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('').trim();
  return String(v).trim();
};

/** Nén xuống dòng và khoảng trắng kép — tên trong file Excel hay có cả hai. */
const gonTen = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Nhập danh mục địa điểm từ Excel.
 *
 * VÌ SAO CẦN. Bảng giá miền Trung của Bee có 72 địa điểm. Trước đây màn Địa
 * điểm chỉ thêm được từng dòng một, nên nạp dữ liệu ban đầu là bảy mươi hai
 * lần mở hộp thoại — và bảy mươi hai cơ hội gõ sai một dấu, mà sai tên thì
 * dòng giá tương ứng bị bỏ lúc nhập bảng giá.
 *
 * ĐÃ CÓ THÌ BỎ QUA, KHÔNG GHI ĐÈ. File nhập thường là cả danh mục chứ không
 * phải phần thêm; ghi đè thì một lần nhập lại xoá mất địa chỉ và mã OF1 mà
 * người ta đã bổ sung bằng tay sau lần nhập đầu. Dòng đã có được kể vào
 * `merged` để màn hình nói rõ "có bao nhiêu cái vốn đã có".
 *
 * Trùng tên bắt bằng CHÍNH hàm `loc_name_key()` của CSDL, giống đường thêm
 * từng dòng — xem LocationsService.tenDaCo.
 */
@Injectable()
export class LocationsIoService {
  constructor(private readonly prisma: PrismaService) {}

  async importLocations(buffer: Buffer, user: AuthenticatedUser): Promise<ImportResultDto> {
    if (!buffer?.length) throw new BadRequestException('Chưa chọn file');

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Không đọc được file — cần file Excel (.xlsx)');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('File không có trang tính nào');

    const viTri = doViTriCot(ws);
    const boQua: string[] = [];
    const dong: { ten: string; tinh: string | null; diaChi: string; vanPhong: string }[] = [];

    ws.eachRow((row, i) => {
      if (i === 1) return;
      const o = (k: keyof typeof COT_DIA_DIEM): string => {
        const c = viTri[k];
        return c === null ? '' : chuoi(row.getCell(c).value);
      };
      const ten = gonTen(o('name'));
      if (ten === '') return; // hàng trống ở cuối file: bỏ im lặng

      const tinhRaw = o('province');
      const tinh = normalizeProvince(tinhRaw);
      /* Tỉnh sai KHÔNG làm hỏng cả dòng: tên và địa chỉ vẫn dùng được, và màn
         Địa điểm sửa tỉnh trong vài giây. Bỏ cả dòng vì một ô là bắt người ta
         sửa file rồi nhập lại từ đầu. */
      if (tinh === null && tinhRaw.trim() !== '')
        boQua.push(`Dòng ${i}: không nhận ra tỉnh "${tinhRaw}" — đã để trống`);

      dong.push({ ten, tinh: tinh ?? null, diaChi: o('address'), vanPhong: o('office') });
    });

    if (dong.length === 0)
      throw new BadRequestException(
        `File không có dòng nào. Cần ít nhất cột "${COT_DIA_DIEM.name}".`,
      );

    let imported = 0;
    let merged = 0;
    for (const d of dong) {
      const daCo = await this.prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM locations
         WHERE loc_name_key(name) = loc_name_key(${d.ten})
           AND coalesce(province, '') = coalesce(${d.tinh}::text, '')
         LIMIT 1`;
      if (daCo.length > 0) {
        merged += 1;
        continue;
      }
      await this.prisma.location.create({
        data: {
          name: d.ten,
          province: d.tinh,
          address: d.diaChi || null,
          officeCode: d.vanPhong || null,
          createdBy: user.id,
        },
      });
      imported += 1;
    }

    return { imported, merged, skipped: boQua.slice(0, 50) };
  }
}

function doViTriCot(ws: ExcelJS.Worksheet): Record<keyof typeof COT_DIA_DIEM, number | null> {
  const hang = ws.getRow(1);
  const map = new Map<string, number>();
  hang.eachCell((cell, col) => {
    map.set(gonTen(chuoi(cell.value)).toLowerCase(), col);
  });
  const tim = (nhan: string): number | null => map.get(nhan.toLowerCase()) ?? null;

  const ra = {
    name: tim(COT_DIA_DIEM.name),
    province: tim(COT_DIA_DIEM.province),
    address: tim(COT_DIA_DIEM.address),
    office: tim(COT_DIA_DIEM.office),
  };
  // Chỉ `Tên` là bắt buộc: ba cột kia bổ sung được ở màn Địa điểm bất cứ lúc nào.
  if (ra.name === null)
    throw new BadRequestException(
      `File thiếu cột "${COT_DIA_DIEM.name}". Các cột nhận được: ` +
      `${Object.values(COT_DIA_DIEM).join(', ')}.`,
    );
  return ra;
}
