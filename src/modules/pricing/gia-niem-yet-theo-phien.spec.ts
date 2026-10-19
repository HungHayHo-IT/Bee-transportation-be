import { PrismaService } from '@/common/prisma/prisma.service';
import { PricingService } from './pricing.service';

/**
 * Giá niêm yết của một đơn đọc theo BẢNG GIÁ HỒI ĐÓ.
 *
 * Trước đây luôn đọc phiên đang áp dụng. Công bố phiên mới là phiên cũ chuyển
 * sang lưu trữ, và mọi đơn đã tạo trước đó mất sạch gợi ý báo giá trên màn
 * hình — người xử lý đơn không còn gì để đối chiếu, mà cũng không có câu nào
 * nói vì sao nó biến mất.
 */
const PHIEN_CU = { id: 1, name: 'Bảng giá tháng 9', activatedAt: new Date('2026-09-01') };
const PHIEN_MOI = { id: 2, name: 'Bảng giá tháng 10', activatedAt: new Date('2026-10-01') };

const GIA = (gia: number) => ([{
  unitCode: '20DC',
  oneWayPrice: gia,
  roundTripPrice: null,
  unit: { label: "20'DC", kind: 'FCL', sortOrder: 1 },
}]);

/** @param coTuyen phiên nào có tuyến đang hỏi. */
const mkPrisma = (coTuyen: number[]) => {
  const hoi: number[] = [];
  const prisma = {
    serviceChild: {
      findUnique: jest.fn(() => Promise.resolve({
        id: 5, name: 'Nội địa FCL', tmsMode: 'TRUCKING_FCL', unit: null,
      })),
    },
    priceSession: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        // Hỏi "phiên đang áp dụng" -> phiên mới; hỏi theo mốc -> phiên cũ.
        if (where.status === 'active') return Promise.resolve(PHIEN_MOI);
        return Promise.resolve(PHIEN_CU);
      }),
    },
    regionRoutePrice: {
      findMany: jest.fn(({ where }: { where: { route: { sessionId: number } } }) => {
        const id = where.route.sessionId;
        hoi.push(id);
        return Promise.resolve(coTuyen.includes(id) ? GIA(id === 1 ? 1000 : 2000) : []);
      }),
    },
  } as unknown as PrismaService;
  return { prisma, hoi };
};

const LUC_TAO_DON = new Date('2026-09-15');

describe('gia niem yet theo phien cua don', () => {
  it('don cu doc bang gia hoi do, khong phai phien moi', async () => {
    const g = mkPrisma([1, 2]);
    const ra = await new PricingService(g.prisma).giaNiemYet(10, 20, 5, LUC_TAO_DON);
    expect(ra?.sessionName).toBe('Bảng giá tháng 9');
    expect(ra?.units[0]!.price).toBe(1000);
  });

  /** Tuyến mới mở sau ngày tạo đơn vẫn giúp được người báo giá. */
  it('phien hoi do khong co tuyen thi lay phien dang ap dung', async () => {
    const g = mkPrisma([2]);
    const ra = await new PricingService(g.prisma).giaNiemYet(10, 20, 5, LUC_TAO_DON);
    expect(ra?.sessionName).toBe('Bảng giá tháng 10');
    expect(g.hoi).toEqual([1, 2]);
  });

  /** Không khai mốc (màn tra giá tự do) thì vẫn là phiên đang áp dụng. */
  it('khong khai moc thi dung phien dang ap dung', async () => {
    const g = mkPrisma([2]);
    const ra = await new PricingService(g.prisma).giaNiemYet(10, 20, 5);
    expect(ra?.sessionName).toBe('Bảng giá tháng 10');
    expect(g.hoi).toEqual([2]);
  });

  /** Không phiên nào có tuyến thì vẫn là null — khác hẳn giá 0. */
  it('khong phien nao co tuyen thi tra null', async () => {
    const g = mkPrisma([]);
    expect(await new PricingService(g.prisma).giaNiemYet(10, 20, 5, LUC_TAO_DON)).toBeNull();
  });
});
