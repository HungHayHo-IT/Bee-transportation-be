import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PriceSessionsService } from './price-sessions.service';

/**
 * Phiên giá CUỐI CÙNG không xoá được.
 *
 * Hết phiên là hết bảng giá: màn giá trống trơn, tra giá không ra gì, và lần
 * ghi tiếp theo lặng lẽ dựng một phiên mới rỗng — người xoá không hề biết
 * mình vừa làm điều đó, chỉ thấy bảng giá biến mất.
 */
const mkPrisma = (soPhien: number) => {
  const xoa = jest.fn(() => Promise.resolve());
  const prisma = {
    priceSession: {
      findUnique: jest.fn(() => Promise.resolve({ id: 1, status: 'draft', name: '1.0' })),
      count: jest.fn(() => Promise.resolve(soPhien)),
      delete: xoa,
    },
  } as unknown as PrismaService;
  return { prisma, xoa };
};

describe('xoa phien gia', () => {
  it('phien duy nhat thi tu choi', async () => {
    const g = mkPrisma(1);
    await expect(new PriceSessionsService(g.prisma).deleteSession(1))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(g.xoa).not.toHaveBeenCalled();
  });

  it('con phien khac thi xoa duoc', async () => {
    const g = mkPrisma(2);
    await new PriceSessionsService(g.prisma).deleteSession(1);
    expect(g.xoa).toHaveBeenCalledTimes(1);
  });
});
