import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { LocationsService } from './locations.service';
import { PriceSessionsService } from './price-sessions.service';
import { RegionRouteIoService } from './region-route-io.service';

/** Phiên đang áp dụng không nhận file Excel — phải tạo phiên mới. */
describe('importFile — phiên đang áp dụng', () => {
  const mk = (status: string) => {
    const findUnique = jest.fn().mockResolvedValue({ status, name: 'Bảng giá Q4' });
    const svc = new RegionRouteIoService(
      { priceSession: { findUnique } } as unknown as PrismaService,
      {} as LocationsService,
      { idPhienDeDoc: jest.fn().mockResolvedValue(5) } as unknown as PriceSessionsService,
    );
    return svc.importFile(Buffer.from('khong phai xlsx'), { id: 1 } as AuthenticatedUser, 5);
  };

  it('đang áp dụng thì chặn trước khi đọc file', async () => {
    await expect(mk('active')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('đang soạn thì đi tiếp tới bước đọc file', async () => {
    await expect(mk('draft')).rejects.not.toBeInstanceOf(BadRequestException);
  });
});
