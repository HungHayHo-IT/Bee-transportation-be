import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotifyService } from '@/modules/notifications/customer-notify.service';
import { NotifyService } from '@/modules/notifications/notify.service';
import { OrdersService } from '../orders/orders.service';
import { QuoteRequestService } from './quote-request.service';

/**
 * Ca này từng rơi vào im lặng hoàn toàn: form gửi lên một mã dịch vụ không
 * khớp gì, hệ thống bỏ qua không một tiếng động và báo cho nhân viên đúng câu
 * dành cho ca khách KHÔNG chọn dịch vụ. Hai nguyên nhân khác hẳn nhau, một
 * thông báo giống hệt nhau.
 */
function mk(service: { id: number; isActive: boolean } | null) {
  const push = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    service: { findUnique: jest.fn().mockResolvedValue(service) },
    quoteRequest: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({
        id: 12, createdAt: new Date('2026-09-17T00:00:00Z'),
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as PrismaService;

  const svc = new QuoteRequestService(
    prisma,
    { log: jest.fn() } as unknown as ActivityService,
    {} as OrdersService,
    { quoteRequestReceived: jest.fn().mockResolvedValue(undefined) } as unknown as CustomerNotifyService,
    {
      push,
      admins: jest.fn().mockResolvedValue([1]),
      adminsAndSales: jest.fn().mockResolvedValue([1]),
    } as unknown as NotifyService,
  );
  return { svc, push };
}

const DTO = { customerName: 'Nguyễn Linh', phone: '0977856665' };
const titleOf = (push: jest.Mock) => push.mock.calls[0][0][0].title as string;
const bodyOf = (push: jest.Mock) => push.mock.calls[0][0][0].body as string;

describe('create — mã dịch vụ gửi lên không dùng được thì phải kêu lên', () => {
  it('mã không khớp dịch vụ nào: báo đúng mã đó, không nói "chưa có dịch vụ"', async () => {
    const { svc, push } = mk(null);
    await svc.create({ ...DTO, serviceCode: 'xyz' }, null, null);
    expect(titleOf(push)).toContain('không dùng được');
    expect(bodyOf(push)).toContain('XYZ');
  });

  it('dịch vụ đã tắt: nội dung khác hẳn ca mã sai', async () => {
    const { svc, push } = mk({ id: 9, isActive: false });
    await svc.create({ ...DTO, serviceCode: 'BRK' }, null, null);
    expect(bodyOf(push)).toContain('ngừng nhận');
  });

  /** Khách thật sự không chọn dịch vụ — vẫn phải là bản tin cũ, không đổi. */
  it('không gửi mã nào thì giữ nguyên bản tin "chưa có dịch vụ"', async () => {
    const { svc, push } = mk(null);
    await svc.create(DTO, null, null);
    expect(titleOf(push)).toContain('chưa có dịch vụ');
  });

  /** Yêu cầu của khách vẫn phải được lưu — không ném lỗi ngược về phía khách. */
  it('mã sai vẫn trả về id và trạng thái pending, không ném lỗi', async () => {
    const { svc } = mk(null);
    const res = await svc.create({ ...DTO, serviceCode: 'xyz' }, null, null);
    expect(res.id).toBe(12);
    expect(res.status).toBe('pending');
  });

  it('mã hợp lệ thì không bắn bản tin lỗi nào', async () => {
    const { svc, push } = mk({ id: 3, isActive: true });
    await svc.create({ ...DTO, serviceCode: 'DOM' }, null, null);
    // Có serviceId nên đi nhánh auto-convert; OrdersService rỗng sẽ ném và rơi
    // vào bản tin "không tạo được đơn" — điều cần khẳng định là KHÔNG phải bản
    // tin mã-không-dùng-được.
    if (push.mock.calls.length) expect(titleOf(push)).not.toContain('không dùng được');
  });
});
