import { NotFoundException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotifyService } from '@/modules/notifications/customer-notify.service';
import { NotifyService } from '@/modules/notifications/notify.service';
import { OrdersService } from '../orders/orders.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { QuoteRequestController } from './quote-request.controller';
import { QuoteRequestService } from './quote-request.service';

/** @Throttle gắn metadata theo tên throttler; 'default' là cái duy nhất repo cấu hình. */
const THROTTLER_LIMIT = 'THROTTLER:LIMITdefault';

/**
 * Mã yêu cầu phát cho khách vãng lai lúc submit trước đây chỉ dùng được bằng
 * cách đọc qua điện thoại cho nhân viên: không có đường nào tra lại vì
 * customer_id = NULL nên không endpoint nào của khách nhận ra nó.
 *
 * Hai thứ phải giữ cho bằng được ở đây: id đoán được (số tăng dần) nên một
 * mình nó không mở được gì, và mọi ca hỏng phải trả về y hệt nhau — lệch một
 * chữ trong thông báo là đủ để biến endpoint thành máy dò "id nào có thật".
 */

/** Row giả đúng hình dạng QUOTE_REQUEST_INCLUDE trả về. */
const GUEST_ROW = {
  id: 12,
  customerName: 'Nguyễn Linh',
  phone: '0977 856 665',
  email: 'linh@example.com',
  serviceId: 3,
  service: { id: 3, name: 'Chuyển phát nội địa' },
  originProvince: 'Hà Nội',
  destinationProvince: 'Đà Nẵng',
  note: null,
  status: 'rejected',
  customerId: null,
  createdBy: 7,
  creator: { id: 7, fullName: 'Trần Văn Nhân Viên' },
  createdAt: new Date('2026-09-17T00:00:00Z'),
  reviewedBy: 9,
  reviewer: { id: 9, fullName: 'Lê Thị Quản Lý' },
  reviewedAt: new Date('2026-09-17T02:00:00Z'),
  convertedToOrderId: null,
  rejectReason: 'Ngoài vùng phục vụ',
};

/** Yêu cầu đã gắn tài khoản — đã có /quote-requests/my/:id lo. */
const OWNED_ROW = { ...GUEST_ROW, id: 13, phone: '0912345678', customerId: 5 };

const ROWS = [GUEST_ROW, OWNED_ROW];

function mk() {
  const findFirst = jest.fn(({ where }: { where: { id: number; customerId: null } }) =>
    Promise.resolve(
      ROWS.find((r) => r.id === where.id && r.customerId === where.customerId) ?? null,
    ));
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

/** Bắt lỗi ném ra để so sánh THÔNG BÁO giữa các ca hỏng khác nhau. */
async function failureOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (e) {
    return e as NotFoundException;
  }
  throw new Error('Phải ném lỗi mà lại trả về dữ liệu');
}

describe('publicLookup — khách vãng lai tra lại yêu cầu bằng id + số điện thoại', () => {
  it('khớp cả id lẫn phone thì trả đúng yêu cầu đó', async () => {
    const { svc } = mk();
    const res = await svc.publicLookup('12', '0977856665');
    expect(res.id).toBe(12);
    expect(res.serviceName).toBe('Chuyển phát nội địa');
    expect(res.status).toBe('rejected');
  });

  it('id đúng nhưng phone sai thì 404', async () => {
    const { svc } = mk();
    await expect(svc.publicLookup('12', '0900000000')).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * Ca cốt lõi: nếu id-không-tồn-tại và phone-sai trả lời khác nhau thì quét
   * id từ 1 đến n với một số điện thoại bịa là dựng được danh sách id có thật.
   */
  it('id không tồn tại trả về ĐÚNG thông báo của ca sai phone', async () => {
    const { svc } = mk();
    const noSuchId = await failureOf(() => svc.publicLookup('99999', '0977856665'));
    const wrongPhone = await failureOf(() => svc.publicLookup('12', '0900000000'));
    expect(noSuchId.getStatus()).toBe(wrongPhone.getStatus());
    expect(noSuchId.message).toBe(wrongPhone.message);
  });

  /** id rác cũng không được lộ ra là "đầu vào hỏng" thay vì "không tìm thấy". */
  it('id không phải số cũng trả cùng thông báo đó', async () => {
    const { svc } = mk();
    const junk = await failureOf(() => svc.publicLookup('abc', '0977856665'));
    const wrongPhone = await failureOf(() => svc.publicLookup('12', '0900000000'));
    expect(junk.message).toBe(wrongPhone.message);
  });

  /**
   * Khách gõ lại số theo thói quen của mình chứ không theo cách form đã lưu.
   * Bắt gõ trùng từng ký tự là biến tính năng thành trò may rủi.
   */
  it.each([
    ['khoảng trắng như lúc khai', '0977 856 665'],
    ['gạch nối', '0977-856-665'],
    ['dấu chấm', '0977.856.665'],
    ['đầu số quốc tế +84', '+84977856665'],
    ['đầu số quốc tế 84 không dấu cộng', '84977856665'],
  ])('phone dạng %s vẫn khớp', async (_name, phone) => {
    const { svc } = mk();
    await expect(svc.publicLookup('12', phone)).resolves.toMatchObject({ id: 12 });
  });

  /** Khác đầu số thật thì không được coi là một — 0977 vs 0978 là hai người. */
  it('số gần giống nhưng khác chữ số thì vẫn 404', async () => {
    const { svc } = mk();
    await expect(svc.publicLookup('12', '0977856666')).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * Yêu cầu đã gắn tài khoản KHÔNG tra được qua đường công khai: nó đã có
   * /quote-requests/my/:id sau đăng nhập. Mở thêm đường này nghĩa là chỉ cần
   * biết số điện thoại của chủ tài khoản là đọc được dữ liệu của họ mà không
   * cần đăng nhập — hạ mức bảo vệ của tài khoản xuống bằng một cái id đoán được.
   */
  it('yêu cầu của khách đã đăng nhập không tra được, cùng thông báo 404', async () => {
    const { svc } = mk();
    const owned = await failureOf(() => svc.publicLookup('13', '0912345678'));
    const wrongPhone = await failureOf(() => svc.publicLookup('12', '0900000000'));
    expect(owned.message).toBe(wrongPhone.message);
  });

  it('truy vấn luôn kèm ràng buộc customerId = null, không lọc sau ở tầng JS', async () => {
    const { svc, findFirst } = mk();
    await svc.publicLookup('12', '0977856665');
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: 12, customerId: null });
  });

  /** Tên nhân viên nội bộ không phải việc của người lạ gọi endpoint công khai. */
  it('không trả tên/id nhân viên nội bộ ra ngoài', async () => {
    const { svc } = mk();
    const res = await svc.publicLookup('12', '0977856665') as unknown as Record<string, unknown>;
    expect(Object.keys(res)).not.toContain('createdByName');
    expect(Object.keys(res)).not.toContain('reviewedByName');
    expect(Object.keys(res)).not.toContain('createdById');
    expect(Object.keys(res)).not.toContain('reviewedById');
    expect(JSON.stringify(res)).not.toContain('Trần Văn Nhân Viên');
    expect(JSON.stringify(res)).not.toContain('Lê Thị Quản Lý');
  });

  /** Lý do từ chối thì ngược lại: khách đã được báo qua thông báo, giấu là vô ích. */
  it('vẫn trả lý do từ chối — khách cần biết yêu cầu của mình hỏng ở đâu', async () => {
    const { svc } = mk();
    const res = await svc.publicLookup('12', '0977856665');
    expect(res.rejectReason).toBe('Ngoài vùng phục vụ');
  });
});

/**
 * Nest gắn route theo thứ tự method được khai báo trong class, nên `lookup`
 * đứng sau `@Get(':id')` là 'lookup' bị nuốt vào route đó và chết ở ParseIntPipe
 * — một lỗi chỉ lộ ra khi gọi thật, không có test nào bắt được nếu chỉ test service.
 */
describe('route /quote-requests/lookup', () => {
  const order = Object.getOwnPropertyNames(QuoteRequestController.prototype);

  it('khai báo trước route :id', () => {
    expect(order.indexOf('lookup')).toBeGreaterThan(-1);
    expect(order.indexOf('lookup')).toBeLessThan(order.indexOf('detail'));
  });

  it('là @Public() và có giới hạn theo IP', () => {
    const fn = QuoteRequestController.prototype.lookup;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, fn)).toBe(true);
    expect(Reflect.getMetadata('__guards__', fn)).toContain(ThrottlerGuard);
    expect(Reflect.getMetadata(THROTTLER_LIMIT, fn)).toBe(10);
  });

  it('chuyển thẳng tham số thô xuống service, không chặn trước bằng 400', async () => {
    const publicLookup = jest.fn().mockResolvedValue({ id: 12 });
    const ctl = new QuoteRequestController(
      { publicLookup } as unknown as QuoteRequestService,
      {} as never, {} as never,
    );
    await ctl.lookup(undefined, undefined);
    expect(publicLookup).toHaveBeenCalledWith('', '');
  });
});
