import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotifyService } from '@/modules/notifications/customer-notify.service';
import { NotifyService } from '@/modules/notifications/notify.service';
import { OrdersService } from '../orders/orders.service';
import { QuoteRequestService } from './quote-request.service';

const TOKEN = 'fGx9_tokenFCMdaikhoang150kytu:APA91bH-xxxxxxxxxxxxxxxxxxxx';

interface Fixture {
  service?: { id: number; isActive: boolean } | null;
  createdRow?: { id: number };
  updateManyThrows?: boolean;
}

function mk(f: Fixture = {}) {
  // createdAt bắt buộc phải có: create()/toDto() gọi row.createdAt.toISOString()
  // vô điều kiện (code có từ trước Task 6), thiếu field này mock sẽ ném lỗi.
  const create = jest.fn().mockResolvedValue(
    f.createdRow ?? { id: 12, createdAt: new Date('2026-09-14T00:00:00Z') },
  );
  const quoteRequestReceived = jest.fn().mockResolvedValue(undefined);
  const quoteRequestRejected = jest.fn().mockResolvedValue(undefined);
  const updateMany = f.updateManyThrows
    ? jest.fn().mockRejectedValue(new Error('DB chập chờn'))
    : jest.fn().mockResolvedValue({ count: 1 });

  const prisma = {
    service: { findUnique: jest.fn().mockResolvedValue(f.service ?? null) },
    quoteRequest: {
      count: jest.fn().mockResolvedValue(0),
      create,
      updateMany,
      update: jest.fn().mockResolvedValue({
        id: 12, status: 'rejected', createdAt: new Date('2026-09-14T00:00:00Z'),
      }),
      findUnique: jest.fn().mockResolvedValue({ id: 12, status: 'pending' }),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) },
  } as unknown as PrismaService;

  const svc = new QuoteRequestService(
    prisma,
    { log: jest.fn() } as unknown as ActivityService,
    {} as OrdersService,
    { quoteRequestReceived, quoteRequestRejected } as unknown as CustomerNotifyService,
    {
      push: jest.fn().mockResolvedValue(undefined),
      admins: jest.fn().mockResolvedValue([]),
      adminsAndSales: jest.fn().mockResolvedValue([]),
    } as unknown as NotifyService,
  );
  return { svc, create, updateMany, quoteRequestReceived, quoteRequestRejected };
}

const DTO = { customerName: 'Cty ABC', phone: '0900000000' };

describe('QuoteRequestService.create — lưu FCM token của khách vãng lai', () => {
  it('ghi fcmToken vào quote_requests khi DTO có token', async () => {
    const { svc, create } = mk();
    await svc.create({ ...DTO, fcmToken: TOKEN }, null, null);
    expect(create.mock.calls[0][0].data.fcmToken).toBe(TOKEN);
  });

  it('không có token thì ghi null, không ghi undefined', async () => {
    const { svc, create } = mk();
    await svc.create(DTO, null, null);
    expect(create.mock.calls[0][0].data.fcmToken).toBeNull();
  });

  /**
   * Khách ĐÃ đăng nhập submit form: token của họ đã nằm ở customer_devices (có
   * chủ, có lastSeenAt, có đường huỷ). Lưu thêm một bản vào quote_requests là tạo
   * bản sao KHÔNG CHỦ — xoá tài khoản chỉ SET NULL customer_id, dòng đó thành
   * "vãng lai" và máy (có thể đã sang tay người khác) vẫn nhận push mã đơn + giá.
   */
  it('khách đã đăng nhập thì KHÔNG lưu token vào quote_requests', async () => {
    const { svc, create } = mk();
    await svc.create({ ...DTO, fcmToken: TOKEN }, null, 7);
    expect(create.mock.calls[0][0].data.fcmToken).toBeNull();
    expect(create.mock.calls[0][0].data.customerId).toBe(7);
  });

  it('bắn thông báo xác nhận đã nhận yêu cầu', async () => {
    const { svc, quoteRequestReceived } = mk();
    await svc.create(DTO, null, null);
    expect(quoteRequestReceived).toHaveBeenCalledWith(12);
  });
});

/**
 * Máy dùng chung (quầy lễ tân, máy công ty, điện thoại mượn): người A gửi yêu cầu
 * ẩn danh, sau đó người B cũng gửi ẩn danh trên đúng máy đó. Cả hai dòng
 * quote_requests cùng giữ một token, nên lúc chốt giá đơn của A, mã đơn và số tiền
 * của A bắn về máy đang ở tay B.
 *
 * customer_devices đã giải bài này bằng UNIQUE trên token + đổi chủ khi đăng ký lại
 * (migration 014). Phía vãng lai không có UNIQUE nên phải thu hồi tay.
 *
 * Số điện thoại là danh tính duy nhất khách vãng lai có. Nó do khách tự gõ nên
 * không chắc chắn, nhưng lệch về phía an toàn: gõ nhầm số thì MẤT một thông báo,
 * chứ không LỘ một thông báo.
 */
describe('QuoteRequestService.create — token đổi chủ giữa hai khách vãng lai', () => {
  it('số điện thoại khác thì thu hồi token khỏi yêu cầu của người trước', async () => {
    const { svc, updateMany } = mk();
    await svc.create({ ...DTO, fcmToken: TOKEN }, null, null);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = updateMany.mock.calls[0][0];
    expect(where.fcmToken).toBe(TOKEN);
    expect(where.phone).toEqual({ not: DTO.phone });
    expect(where.id).toEqual({ not: 12 });
    expect(data).toEqual({ fcmToken: null });
  });

  /** Một người gửi nhiều đơn từ cùng máy: phải nhận thông báo của CẢ HAI đơn. */
  it('cùng số điện thoại thì giữ nguyên, không thu hồi', async () => {
    const { svc, updateMany } = mk();
    await svc.create({ ...DTO, fcmToken: TOKEN }, null, null);
    expect(updateMany.mock.calls[0][0].where.phone).toEqual({ not: DTO.phone });
  });

  it('không gửi token thì không đụng tới yêu cầu nào khác', async () => {
    const { svc, updateMany } = mk();
    await svc.create(DTO, null, null);
    expect(updateMany).not.toHaveBeenCalled();
  });

  /** Khách đã đăng nhập không ghi token, nên cũng không có gì để thu hồi. */
  it('khách đã đăng nhập thì không thu hồi token của ai', async () => {
    const { svc, updateMany } = mk();
    await svc.create({ ...DTO, fcmToken: TOKEN }, null, 7);
    expect(updateMany).not.toHaveBeenCalled();
  });

  /**
   * Yêu cầu của khách ĐÃ được ghi trước bước này. Lỗi DB lúc thu hồi mà ném ra
   * ngoài thì khách nhận 500 cho một yêu cầu thực ra đã lưu thành công — đúng
   * cái bẫy đã vá ở notifyStaff.
   */
  it('lỗi DB lúc thu hồi không làm đổ create()', async () => {
    const { svc } = mk({ updateManyThrows: true });
    await expect(svc.create({ ...DTO, fcmToken: TOKEN }, null, null)).resolves.toBeDefined();
  });
});

describe('QuoteRequestService.reject', () => {
  it('bắn thông báo từ chối kèm lý do cho khách', async () => {
    const { svc, quoteRequestRejected } = mk();
    await svc.reject(12, 'Ngoài phạm vi phục vụ', { id: 1 } as never);
    expect(quoteRequestRejected).toHaveBeenCalledWith(12, 'Ngoài phạm vi phục vụ');
  });
});
