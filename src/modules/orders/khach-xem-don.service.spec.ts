import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedCustomer } from '@/common/types/authenticated-customer.type';
import { KhachXemDonService } from './khach-xem-don.service';

const khach = (email: string): AuthenticatedCustomer =>
  ({ id: 1, email, fullName: 'Người thử', phone: null, hasPin: true });

const DON = {
  id: 7,
  code: 'DOM-20261005-001',
  status: 'closed',
  service: { name: 'Vận chuyển nội địa' },
  serviceChild: { name: 'Nội địa hàng lẻ (LCL)' },
  customer: { companyName: 'Bee Logistics', contactName: 'An' },
  originProvince: 'Hà Nội',
  destinationProvince: 'Hải Phòng',
  desiredDate: null,
  finalAmount: 1_500_000,
  milestones: [{ name: 'Đã giao' }],
  createdAt: new Date('2026-10-05'),
  closedAt: null,
  completedAt: null,
};

function dungPrisma(rows: unknown[] = [DON]) {
  // Khai KIỂU của mock thay vì đặt tham số giả: jest.fn() không tham số cho ra
  // tuple rỗng và TypeScript chặn mọi phép tra `mock.calls[0][0]`, còn tham số
  // giả thì eslint bắt vì không ai dùng tới nó.
  type Goi = (args: Record<string, unknown>) => Promise<unknown>;
  const findMany = jest.fn<Promise<unknown>, Parameters<Goi>>(() => Promise.resolve(rows));
  const count = jest.fn<Promise<number>, Parameters<Goi>>(() => Promise.resolve(rows.length));
  return {
    prisma: { order: { findMany, count } } as unknown as PrismaService,
    findMany,
    count,
  };
}

describe('KhachXemDonService.danhSach', () => {
  it('tài khoản ngoài tên miền bị CHẶN, và không hề chạm tới cơ sở dữ liệu', async () => {
    const { prisma, findMany } = dungPrisma();
    const s = new KhachXemDonService(prisma);
    await expect(s.danhSach(khach('ai.do@gmail.com'), 1, 20))
      .rejects.toBeInstanceOf(ForbiddenException);
    // Chặn TRƯỚC truy vấn: lọt xuống rồi mới lọc là một lần nữa tin vào bộ lọc.
    expect(findMany).not.toHaveBeenCalled();
  });

  it('tên miền chỉ kết thúc giống cũng bị chặn', async () => {
    const { prisma } = dungPrisma();
    const s = new KhachXemDonService(prisma);
    await expect(s.danhSach(khach('gia@notbeelogistics.com'), 1, 20))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lọc đơn theo CẢ hai đuôi tên miền, không phân biệt hoa thường', async () => {
    const { prisma, findMany } = dungPrisma();
    const s = new KhachXemDonService(prisma);
    await s.danhSach(khach('an@beelogistics.com'), 1, 20);

    const goi = findMany.mock.calls[0][0] as unknown as {
      where: { customer: { OR: { email: { endsWith: string; mode: string } }[] } };
    };
    const dieuKien = goi.where.customer.OR;
    const duoi = dieuKien.map((o) => o.email.endsWith);
    expect(duoi).toEqual(['@beelogistics.com', '.beelogistics.com']);
    expect(dieuKien.every((o) => o.email.mode === 'insensitive')).toBe(true);
  });

  it('người đăng nhập bằng tên miền con vẫn vào được', async () => {
    const { prisma } = dungPrisma();
    const s = new KhachXemDonService(prisma);
    const kq = await s.danhSach(khach('an@vn.beelogistics.com'), 1, 20);
    expect(kq.total).toBe(1);
  });

  it('KHÔNG trả báo giá phòng ban, ghi chú nội bộ hay tên sale', async () => {
    const { prisma } = dungPrisma();
    const s = new KhachXemDonService(prisma);
    const [don] = (await s.danhSach(khach('an@beelogistics.com'), 1, 20)).items;
    for (const cam of ['departments', 'note', 'saleName', 'closeNote', 'quotes']) {
      expect(Object.keys(don)).not.toContain(cam);
    }
    expect(don.code).toBe('DOM-20261005-001');
    expect(don.statusLabel).toBe('Đã chốt');
  });

  it('đơn chưa chốt thì giá là null chứ không phải 0', async () => {
    const { prisma } = dungPrisma([{ ...DON, finalAmount: null }]);
    const s = new KhachXemDonService(prisma);
    const [don] = (await s.danhSach(khach('an@beelogistics.com'), 1, 20)).items;
    expect(don.finalAmount).toBeNull();
  });

  it('chưa tick mốc nào thì để trống, không bịa trạng thái', async () => {
    const { prisma } = dungPrisma([{ ...DON, milestones: [] }]);
    const s = new KhachXemDonService(prisma);
    const [don] = (await s.danhSach(khach('an@beelogistics.com'), 1, 20)).items;
    expect(don.latestMilestone).toBeNull();
  });

  it('phân trang tính đúng skip', async () => {
    const { prisma, findMany } = dungPrisma();
    const s = new KhachXemDonService(prisma);
    await s.danhSach(khach('an@beelogistics.com'), 3, 20);
    expect((findMany.mock.calls[0][0] as unknown as { skip: number }).skip).toBe(40);
  });
});
