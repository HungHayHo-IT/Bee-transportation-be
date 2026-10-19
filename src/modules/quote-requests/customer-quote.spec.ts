import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotifyService } from '@/modules/notifications/customer-notify.service';
import { NotifyService } from '@/modules/notifications/notify.service';
import { CustomerJwtGuard } from '@/common/guards/customer-jwt.guard';
import { OrdersService } from '../orders/orders.service';
import { QuoteRequestController } from './quote-request.controller';
import { QuoteRequestService } from './quote-request.service';

/**
 * B-02: khách gửi yêu cầu xong chỉ thấy mãi "Đã tiếp nhận" vì không endpoint nào
 * của khách chạm được tới giá. Endpoint này mở đúng MỘT con số: giá của phòng
 * THẮNG, và chỉ sau khi sale đã chọn.
 *
 * Vì sao không cho thấy báo giá của các phòng khác (kể cả đã thua): các phòng
 * cạnh tranh giá với nhau là chuyện nội bộ. Lộ ra là khách đọc được cơ cấu giá,
 * biết công ty tự đấu với chính mình, và sale mất sạch biên đàm phán.
 */

/** Dựng row đúng hình dạng select của helper trả về. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: 12,
    convertedToOrderId: 500,
    order: {
      code: 'DH-2609-001',
      departments: [
        {
          state: 'won',
          amount: new Prisma.Decimal(4_500_000),
          lastQuotedAt: new Date('2026-09-17T03:00:00Z'),
        },
      ],
    },
    ...over,
  };
}

const ROWS: Record<string, ReturnType<typeof row>> = {
  // Khách 5: đã convert, phòng thắng đã có giá.
  '5:12': row(),
  // Khách 5: vừa gửi form, chưa ai chuyển thành đơn.
  '5:13': row({ id: 13, convertedToOrderId: null, order: null }),
  // Khách 5: đã thành đơn nhưng các phòng còn đang đấu, chưa ai 'won'.
  '5:14': row({ id: 14, convertedToOrderId: 501, order: { code: 'DH-2609-002', departments: [] } }),
  // Khách 9: yêu cầu của NGƯỜI KHÁC.
  '9:99': row({ id: 99 }),
  // Khách 5: đơn ĐÃ HUỶ sau khi đã có phòng thắng. cancel() không dọn
  // order_departments.state nên dòng 'won' vẫn còn nguyên kèm giá.
  '5:15': row({
    id: 15, convertedToOrderId: 502,
    order: {
      code: 'DH-2609-003', status: 'cancelled',
      departments: [{
        state: 'won', amount: new Prisma.Decimal(7_000_000),
        lastQuotedAt: new Date('2026-09-17T03:00:00Z'),
      }],
    },
  }),
  // Khách 5: đơn khách TỪ CHỐI sau khi đã có phòng thắng. Từ migration 023
  // đường đó kết thúc ở 'cancelled' chứ không còn trạng thái 'rejected' riêng.
  '5:16': row({
    id: 16, convertedToOrderId: 503,
    order: {
      code: 'DH-2609-004', status: 'cancelled',
      departments: [{
        state: 'won', amount: new Prisma.Decimal(8_000_000),
        lastQuotedAt: new Date('2026-09-17T03:00:00Z'),
      }],
    },
  }),
};

function mk() {
  const findFirst = jest.fn((args: { where: { id: number; customerId: number } }) =>
    Promise.resolve(ROWS[`${args.where.customerId}:${args.where.id}`] ?? null));
  const prisma = { quoteRequest: { findFirst } } as unknown as PrismaService;
  const svc = new QuoteRequestService(
    prisma,
    { log: jest.fn() } as unknown as ActivityService,
    {} as OrdersService,
    {} as CustomerNotifyService,
    {} as NotifyService,
  );
  return { svc, findFirst };
}

/** Bắt lỗi ném ra để so THÔNG BÁO giữa các ca hỏng khác nhau. */
async function failureOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (e) {
    return e as NotFoundException;
  }
  throw new Error('Phải ném lỗi mà lại trả về dữ liệu');
}

describe('myQuote — khách xem giá đã chốt', () => {
  it('có phòng thắng thì trả đúng số tiền và mã đơn', async () => {
    const { svc } = mk();
    const res = await svc.myQuote(5, 12);
    expect(res.state).toBe('quoted');
    expect(res.amount).toBe(4_500_000);
    expect(res.orderCode).toBe('DH-2609-001');
    expect(res.quotedAt).toBe('2026-09-17T03:00:00.000Z');
  });

  /**
   * Yêu cầu của người khác phải ra 404 y như yêu cầu không tồn tại: trả 403 là
   * đã xác nhận "mã này có thật", biến id tăng dần thành máy dò đơn hàng.
   */
  it('yêu cầu của khách khác trả 404, không phân biệt với không tồn tại', async () => {
    const { svc } = mk();
    await expect(svc.myQuote(5, 99)).rejects.toBeInstanceOf(NotFoundException);
    const other = await failureOf(() => svc.myQuote(5, 99));
    const missing = await failureOf(() => svc.myQuote(5, 123_456));
    expect(other.message).toBe(missing.message);
  });

  it('ràng buộc customerId nằm trong where, không lọc sau ở tầng JS', async () => {
    const { svc, findFirst } = mk();
    await svc.myQuote(5, 12);
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: 12, customerId: 5 });
  });

  /**
   * Khách vừa bấm gửi xong là rơi vào ca này. Ném lỗi ở đây thì màn hình "Yêu
   * cầu của tôi" đỏ lòm ngay lúc mọi thứ đang hoàn toàn bình thường.
   */
  it('chưa chuyển thành đơn thì là "chưa có giá", không phải lỗi', async () => {
    const { svc } = mk();
    const res = await svc.myQuote(5, 13);
    expect(res.state).toBe('pending');
    expect(res.amount).toBeNull();
    expect(res.orderCode).toBeNull();
  });

  it('đã thành đơn nhưng chưa phòng nào thắng thì cũng là "chưa có giá"', async () => {
    const { svc } = mk();
    const res = await svc.myQuote(5, 14);
    expect(res.state).toBe('pending');
    expect(res.amount).toBeNull();
  });

  /** Chỉ dòng 'won' mới được lấy — ràng buộc phải nằm trong truy vấn. */
  it('truy vấn chỉ kéo dòng phòng ban có state = won', async () => {
    const { svc, findFirst } = mk();
    await svc.myQuote(5, 12);
    const sel = findFirst.mock.calls[0][0] as unknown as {
      select: { order: { select: { departments: { where: { state: string } } } } };
    };
    expect(sel.select.order.select.departments.where).toMatchObject({ state: 'won' });
  });

  /**
   * Phòng nào thắng, bao nhiêu phòng tham gia, ai báo giá — đều là chuyện nội
   * bộ. Repo vừa có bài học `GET /services` trả nguyên DTO đầy đủ nên công khai
   * luôn sơ đồ phòng ban; mapper ở đây phải viết tường minh từng trường.
   */
  it('không lộ tên phòng, tên nhân viên hay giá của phòng thua', async () => {
    // Row có đủ "rác nội bộ" để bắt lỗi trả thẳng entity.
    const dirty = row({
      order: {
        code: 'DH-2609-001',
        departmentId: 3,
        department: { id: 3, name: 'Phòng Vận Tải Bắc' },
        departments: [
          {
            amount: new Prisma.Decimal(4_500_000),
            lastQuotedAt: new Date('2026-09-17T03:00:00Z'),
            state: 'won',
            departmentId: 3,
            department: { name: 'Phòng Vận Tải Bắc' },
            assignee: { fullName: 'Trần Văn Nhân Viên' },
          },
          { amount: new Prisma.Decimal(9_900_000), state: 'lost', department: { name: 'Phòng Hàng Không' } },
        ],
      },
    });
    const prisma = {
      quoteRequest: { findFirst: jest.fn(() => Promise.resolve(dirty)) },
    } as unknown as PrismaService;
    const s = new QuoteRequestService(
      prisma, { log: jest.fn() } as unknown as ActivityService,
      {} as OrdersService, {} as CustomerNotifyService, {} as NotifyService,
    );
    const res = await s.myQuote(5, 12);
    const json = JSON.stringify(res);
    expect(json).not.toContain('Phòng Vận Tải Bắc');
    expect(json).not.toContain('Phòng Hàng Không');
    expect(json).not.toContain('Trần Văn Nhân Viên');
    expect(json).not.toContain('9900000');
    expect(Object.keys(res).sort()).toEqual(
      ['amount', 'orderCode', 'quoteRequestId', 'quotedAt', 'state'],
    );
    // Vẫn lấy đúng dòng won trong đám nhiều phòng.
    expect(res.amount).toBe(4_500_000);
  });
});

/**
 * Nest khớp route theo thứ tự method được khai báo trong class. `my/:id` đứng
 * trước thì 'my/12/quote' không bao giờ tới được `myQuote` — lỗi chỉ lộ ra khi
 * gọi thật, không test service nào bắt được.
 */
describe('route /quote-requests/my/:id/quote', () => {
  const order = Object.getOwnPropertyNames(QuoteRequestController.prototype);

  it('khai báo trước route my/:id', () => {
    expect(order.indexOf('myQuote')).toBeGreaterThan(-1);
    expect(order.indexOf('myQuote')).toBeLessThan(order.indexOf('myDetail'));
  });

  /** Giá chỉ đi qua cửa đăng nhập, không qua đường tra cứu công khai. */
  it('đứng sau CustomerJwtGuard', () => {
    const fn = QuoteRequestController.prototype.myQuote;
    expect(Reflect.getMetadata('__guards__', fn)).toContain(CustomerJwtGuard);
  });

  /**
   * cancel() và reject() trong OrdersService KHÔNG đụng order_departments.state
   * — đã đọc mã nguồn để chắc. Dòng 'won' vì thế sống sót qua việc huỷ đơn, và
   * nếu chỉ hỏi "có dòng won không" thì khách của một đơn đã chết vẫn thấy giá
   * hiện lên như thể còn hiệu lực, rồi gọi cho sale hỏi vì sao không giao hàng.
   */
  it('đơn đã huỷ thì không trả giá nữa', async () => {
    const { svc } = mk();
    const res = await svc.myQuote(5, 15);
    expect(res.state).toBe('cancelled');
    expect(res.amount).toBeNull();
  });

  it('đơn khách từ chối cũng vậy — nay cũng là cancelled', async () => {
    const { svc } = mk();
    const res = await svc.myQuote(5, 16);
    expect(res.state).toBe('cancelled');
    expect(res.amount).toBeNull();
  });

  /** Vẫn giữ mã đơn để khách còn cái mà đối chiếu khi gọi hỏi sale. */
  it('đơn đã huỷ vẫn trả mã đơn', async () => {
    const { svc } = mk();
    expect((await svc.myQuote(5, 15)).orderCode).toBe('DH-2609-003');
  });
});
