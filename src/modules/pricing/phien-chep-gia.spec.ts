import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { PriceSessionsService } from './price-sessions.service';

/**
 * "Chép giá từ phiên" phải chép CẢ bảng giá khu vực.
 *
 * Trước đây chỉ chép `route_prices` — bảng giá cũ. Trên production bảng cũ
 * rỗng và mọi thứ nằm ở `region_routes`, nên chép từ một phiên 90 tuyến / 355
 * dòng giá ra một phiên 0 tuyến, không kèm lỗi nào. Người dùng chỉ thấy màn
 * hình trống và không có cách nào biết mình làm sai ở đâu.
 */
const NGUOI: AuthenticatedUser = {
  id: 7, email: 'a@bee.vn', fullName: 'A', roles: ['admin'],
  departmentId: null, canViewCompanyReport: false, mustChangePassword: false,
};

const TUYEN = [
  {
    originId: 1,
    destinationId: 2,
    roundTripKm: 120,
    prices: [{ kind: 'FCL', unitCode: '20DC', oneWayPrice: 1000, roundTripPrice: 1500 }],
  },
  {
    originId: 3,
    destinationId: 4,
    roundTripKm: null,
    prices: [{ kind: 'LCL', unitCode: '5T', oneWayPrice: 500, roundTripPrice: 750 }],
  },
];

const mkPrisma = () => {
  const goi: Record<string, unknown[]> = { route: [], gia: [] };
  const tx = {
    priceSession: {
      create: jest.fn(() => Promise.resolve({ id: 99 })),
      findUniqueOrThrow: jest.fn(() => Promise.resolve({
        id: 99, name: '1.0', effectiveFrom: new Date('2026-10-09'), status: 'draft',
        note: null, activatedAt: null, creator: null,
        _count: { prices: 0, regionRoutes: 2 },
      })),
    },
    routePrice: {
      findMany: jest.fn(() => Promise.resolve([])),
      createMany: jest.fn(),
    },
    regionRoute: {
      findMany: jest.fn(({ where }: { where: { sessionId: number } }) => Promise.resolve(
        where.sessionId === 99
          // Doc lai sau createMany: tuyen moi da co id.
          ? TUYEN.map((t, i) => ({ id: 500 + i, originId: t.originId, destinationId: t.destinationId }))
          : TUYEN,
      )),
      createMany: jest.fn((a: { data: unknown[] }) => { goi.route.push(...a.data); return Promise.resolve(); }),
    },
    regionRoutePrice: {
      createMany: jest.fn((a: { data: unknown[] }) => { goi.gia.push(...a.data); return Promise.resolve(); }),
    },
  };
  const prisma = {
    $transaction: jest.fn((f: (t: typeof tx) => unknown) => f(tx)),
  } as unknown as PrismaService;
  return { prisma, tx, goi };
};

describe('tao phien — chep gia', () => {
  it('chep ca tuyen cua bang gia khu vuc', async () => {
    const g = mkPrisma();
    await new PriceSessionsService(g.prisma).createSession(
      { name: '1.0', effectiveFrom: '2026-10-09', copyFromSessionId: 8 }, NGUOI,
    );
    expect(g.goi.route).toHaveLength(2);
    expect(g.goi.route[0]).toMatchObject({ sessionId: 99, originId: 1, destinationId: 2, roundTripKm: 120 });
  });

  /** Giá phải treo đúng tuyến MỚI, không phải id của tuyến nguồn. */
  it('gia treo dung tuyen vua tao', async () => {
    const g = mkPrisma();
    await new PriceSessionsService(g.prisma).createSession(
      { name: '1.0', effectiveFrom: '2026-10-09', copyFromSessionId: 8 }, NGUOI,
    );
    expect(g.goi.gia).toEqual([
      { routeId: 500, kind: 'FCL', unitCode: '20DC', oneWayPrice: 1000, roundTripPrice: 1500 },
      { routeId: 501, kind: 'LCL', unitCode: '5T', oneWayPrice: 500, roundTripPrice: 750 },
    ]);
  });

  /** Không chọn phiên nguồn thì không đụng gì tới bảng tuyến. */
  it('khong chep thi khong tao tuyen nao', async () => {
    const g = mkPrisma();
    await new PriceSessionsService(g.prisma).createSession(
      { name: '1.0', effectiveFrom: '2026-10-09' }, NGUOI,
    );
    expect(g.tx.regionRoute.createMany).not.toHaveBeenCalled();
  });

  /** Vài trăm tuyến thì vẫn chỉ ba câu lệnh, không phải một câu mỗi tuyến. */
  it('ghi hang loat chu khong lap tung tuyen', async () => {
    const g = mkPrisma();
    await new PriceSessionsService(g.prisma).createSession(
      { name: '1.0', effectiveFrom: '2026-10-09', copyFromSessionId: 8 }, NGUOI,
    );
    expect(g.tx.regionRoute.createMany).toHaveBeenCalledTimes(1);
    expect(g.tx.regionRoutePrice.createMany).toHaveBeenCalledTimes(1);
  });
});
