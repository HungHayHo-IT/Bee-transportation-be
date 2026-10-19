import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * Danh mục địa chỉ lấy/giao của khách — nguồn cho `addresses[]` của OF1.
 *
 * KHÔNG có màn nhập riêng, và đó là chủ ý: bắt ai đó ngồi điền địa chỉ cho
 * 697 khách là đẻ ra một màn hình không ai có thời gian dùng, rồi danh mục
 * rỗng mãi. Thay vào đó, mỗi lần tạo hoặc sửa đơn thì địa chỉ vừa gõ được ghi
 * nhớ lại. Danh mục lớn dần theo việc thật.
 *
 * Tra trùng bằng CHÍNH cột sinh `addr_key` của CSDL, qua SQL thô — không viết
 * lại luật chuẩn hoá bằng TypeScript. Chỉ số unique dựa trên cột ấy; một bản
 * sao ở tầng ứng dụng sớm muộn lệch với nó, và lúc đó ta nói "chưa có" rồi
 * Postgres ném lỗi unique kèm tên index, thứ người dùng không đọc được.
 *
 * (Cột sinh cũng là lý do `addrKey` KHÔNG có trong model Prisma: Prisma sẽ đòi
 * ghi nó, mà Postgres từ chối mọi lệnh ghi vào cột GENERATED ALWAYS.)
 */
@Injectable()
export class DiaChiKhachService {
  constructor(private readonly prisma: PrismaService) {}

  private static gon(diaChi: string | null | undefined): string {
    return (diaChi ?? '').replace(/\s+/g, ' ').trim();
  }

  private static async timMa(
    tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
    customerId: number,
    diaChi: string,
    chiConBat = false,
  ): Promise<string | null> {
    const rows = await tx.$queryRaw<{ code: string }[]>`
      SELECT code FROM customer_addresses
       WHERE customer_id = ${customerId}
         AND addr_key = btrim(lower(regexp_replace(${diaChi}, '[[:space:]]+', ' ', 'g')))
         ${chiConBat ? Prisma.sql`AND is_active` : Prisma.empty}
       LIMIT 1`;
    return rows[0]?.code ?? null;
  }

  /**
   * Ghi nhớ một địa chỉ của khách, trả về mã.
   *
   * Đã có thì trả mã cũ, KHÔNG tạo bản sao: cùng một kho gõ lại lần thứ hai
   * vẫn là một chỗ, mà mã địa chỉ là thứ đã nằm trong đơn cũ bên OF1.
   *
   * Lỗi thì trả `null` chứ không ném: đây là việc PHỤ của luồng tạo đơn.
   */
  async ghiNho(
    tx: Prisma.TransactionClient,
    customerId: number,
    diaChi: string | null | undefined,
  ): Promise<string | null> {
    const sach = DiaChiKhachService.gon(diaChi);
    if (sach === '') return null;
    const daCo = await DiaChiKhachService.timMa(tx, customerId, sach);
    if (daCo !== null) return daCo;

    /* Mã chạy theo từng KHÁCH, không phải toàn hệ thống: contract nói
       `addressCode` chỉ cần duy nhất trong phạm vi khách đó, và mã ngắn thì
       người đối soát đọc được. */
    const n = await tx.customerAddress.count({ where: { customerId } });
    try {
      const moi = await tx.customerAddress.create({
        data: { customerId, code: `A${String(n + 1).padStart(2, '0')}`, address: sach },
        select: { code: true },
      });
      return moi.code;
    } catch {
      /* Hai đơn cùng gõ một địa chỉ mới cùng lúc thì một bên đâm vào chỉ số
         unique. Đọc lại là xong — bên kia vừa tạo đúng thứ ta cần. */
      return DiaChiKhachService.timMa(tx, customerId, sach);
    }
  }

  /** Mã địa chỉ khớp với một chuỗi — `null` nếu chưa có trong danh mục. */
  async maTheoDiaChi(customerId: number, diaChi: string | null | undefined): Promise<string | null> {
    const sach = DiaChiKhachService.gon(diaChi);
    if (sach === '') return null;
    return DiaChiKhachService.timMa(this.prisma, customerId, sach, true);
  }
}
