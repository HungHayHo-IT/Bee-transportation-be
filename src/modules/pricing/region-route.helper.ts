import { Prisma } from '@prisma/client';
import { RegionRouteDto } from './dto/pricing.dto';

/** Tuyến kèm đủ thứ để dựng câu trả lời — hai đầu, khu vực, giá từng dịch vụ. */
export const KEM = {
  origin: { include: { region: { select: { id: true, name: true } } } },
  destination: true,
  prices: {
    include: { unit: { select: { label: true, sortOrder: true } } },
    // FCL truoc LCL: bang gia giay cua Bee cung xep nhu vay.
    orderBy: [{ kind: 'asc' }, { unit: { sortOrder: 'asc' } }],
  },
} satisfies Prisma.RegionRouteInclude;

export type TuyenDayDu = Prisma.RegionRouteGetPayload<{ include: typeof KEM }>;

/**
 * Một tuyến ở hình dạng giao diện cần: hai đầu kèm tỉnh, khu vực suy ra từ đầu
 * NHẬN, và các mức giá đã gom theo dịch vụ con.
 *
 * Gom ở đây chứ không ở DB: bảng giá lưu phẳng (tuyến, dịch vụ, bậc tải) nên
 * thêm một mức giá là thêm MỘT dòng, còn giao diện lại đọc theo khối dịch vụ.
 * Gom một lần lúc trả về là chỗ rẻ nhất để hai hình dạng đó gặp nhau.
 */
export function raTuyen(r: TuyenDayDu): RegionRouteDto {
  const theoDichVu = new Map<string, RegionRouteDto['services'][number]>();
  for (const p of r.prices) {
    const khoi = theoDichVu.get(p.kind) ?? {
      kind: p.kind as 'FCL' | 'LCL',
      prices: [],
    };
    khoi.prices.push({
      unitCode: p.unitCode,
      unitLabel: p.unit.label,
      oneWayPrice: p.oneWayPrice === null ? null : Number(p.oneWayPrice),
      roundTripPrice: p.roundTripPrice === null ? null : Number(p.roundTripPrice),
    });
    theoDichVu.set(p.kind, khoi);
  }
  return {
    id: r.id,
    sessionId: r.sessionId,
    roundTripKm: r.roundTripKm,
    regionId: r.origin.region?.id ?? null,
    regionName: r.origin.region?.name ?? null,
    origin: { province: r.origin.province, locationId: r.origin.id, locationName: r.origin.name },
    destination: {
      province: r.destination.province,
      locationId: r.destination.id,
      locationName: r.destination.name,
    },
    services: [...theoDichVu.values()],
  };
}

