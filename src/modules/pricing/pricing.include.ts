import { Prisma } from '@prisma/client';

/**
 * Hai hình dạng truy vấn dùng chung cho các lớp của bảng giá.
 *
 * Để riêng vì ba lớp dưới đây cùng đọc một bộ bảng: tách bản sao cho mỗi lớp
 * thì sớm muộn một chỗ thêm trường mà chỗ kia không, và DTO trả ra lệch nhau
 * tuỳ theo đi qua cửa nào.
 */
export const PHIEN_INCLUDE = {
  creator: { select: { fullName: true } },
  // `prices` la bang gia CU (route_prices), `regionRoutes` la bang gia khu vuc
  // (063). Mot phien co the chi co mot trong hai - dem ca hai de man hinh noi
  // dung "phien nay rong" hay khong.
  _count: { select: { prices: true, regionRoutes: true } },
} satisfies Prisma.PriceSessionInclude;

export const GIA_INCLUDE = {
  origin: { select: { name: true } },
  destination: { select: { name: true } },
  // Nhan va FCL/LCL cua don vi tinh: man gia hien "20'DC <= 17 tan" chu khong
  // phai ma 'CONT20DC_LE17T', va loc duoc theo FCL/LCL.
  unit: { select: { label: true, kind: true, sortOrder: true } },
} satisfies Prisma.RoutePriceInclude;

export type PhienRow = Prisma.PriceSessionGetPayload<{ include: typeof PHIEN_INCLUDE }>;
export type GiaRow = Prisma.RoutePriceGetPayload<{ include: typeof GIA_INCLUDE }>;
