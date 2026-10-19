import { PrismaService } from '@/common/prisma/prisma.service';
import { PriceSessionsService } from './price-sessions.service';

/**
 * Số "dòng giá" của một phiên phải đếm cả bảng giá KHU VỰC.
 *
 * `_count.prices` của Prisma chỉ với tới `route_prices` — bảng giá cũ. Giá của
 * bảng khu vực treo dưới `region_routes`, cách phiên hai bậc, và `_count`
 * không đi xuyên quan hệ. Hệ quả thật trên production: phiên có 90 tuyến và
 * 355 dòng giá vẫn hiện số 0, nút "Công bố phiên này" nằm im vì màn hình
 * tưởng phiên rỗng — trong khi API `activate` sẵn sàng nhận.
 */
const mkPrisma = (soGiaKhuVuc: number) => {
  const prisma = {
    priceSession: {
      findMany: jest.fn(() => Promise.resolve([{
        id: 8,
        name: 'Bảng giá 9/10/2026',
        effectiveFrom: new Date('2026-10-09'),
        status: 'draft',
        note: null,
        activatedAt: null,
        creator: null,
        _count: { prices: 0, regionRoutes: 90 },
      }])),
    },
    $queryRaw: jest.fn(() => Promise.resolve(
      soGiaKhuVuc === 0 ? [] : [{ session_id: 8, n: BigInt(soGiaKhuVuc) }],
    )),
  } as unknown as PrismaService;
  return prisma;
};

describe('phien gia — dem dong gia', () => {
  it('cong ca gia cua bang khu vuc vao priceCount', async () => {
    const prisma = mkPrisma(355);
    const { items } = await new PriceSessionsService(prisma).listSessions();
    expect(items[0]!.priceCount).toBe(355);
    expect(items[0]!.routeCount).toBe(90);
  });

  /** Phiên rỗng thật thì vẫn phải là 0 — nút Công bố đóng là đúng. */
  it('phien rong van la 0', async () => {
    const prisma = mkPrisma(0);
    const { items } = await new PriceSessionsService(prisma).listSessions();
    expect(items[0]!.priceCount).toBe(0);
  });

  /** Đếm qua region_route_prices, không phải đoán từ số tuyến. */
  it('hoi dung bang region_route_prices', async () => {
    const prisma = mkPrisma(355);
    await new PriceSessionsService(prisma).listSessions();
    const sql = (prisma.$queryRaw as unknown as jest.Mock).mock.calls[0]![0] as string[];
    expect(sql.join(' ')).toContain('region_route_prices');
  });
});
