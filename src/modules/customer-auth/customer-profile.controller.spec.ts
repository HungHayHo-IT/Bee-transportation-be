import { CustomerNotificationsService } from './customer-notifications.service';
import { CustomerProfileController } from './customer-profile.controller';
import { CustomerProfileService } from './customer-profile.service';
import { CustomerAvatarService } from './customer-avatar.service';

const CUSTOMER = { id: 7 } as never;

function mk() {
  const inbox = jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
  const notifications = { inbox } as unknown as CustomerNotificationsService;
  const controller = new CustomerProfileController(
    {} as CustomerProfileService, notifications, {} as CustomerAvatarService,
  );
  return { controller, inbox };
}

/**
 * Query string luôn là chuỗi, kể cả rỗng/rác — page và limit phải luôn ra số
 * nguyên dương hợp lệ trước khi chạm Prisma, nếu không skip/take là NaN hoặc âm
 * và Prisma ném lỗi validate thành 500 thay vì áp mặc định như tài liệu mô tả.
 */
describe('CustomerProfileController.inbox — làm sạch page/limit từ query string', () => {
  it('không truyền gì thì dùng mặc định page=1, limit=20', async () => {
    const { controller, inbox } = mk();
    await controller.inbox(CUSTOMER, undefined, undefined, undefined);
    expect(inbox.mock.calls[0][2]).toBe(1);
    expect(inbox.mock.calls[0][3]).toBe(20);
  });

  it('page và limit rỗng ("") thì dùng mặc định', async () => {
    const { controller, inbox } = mk();
    await controller.inbox(CUSTOMER, undefined, '', '');
    expect(inbox.mock.calls[0][2]).toBe(1);
    expect(inbox.mock.calls[0][3]).toBe(20);
  });

  it('page không phải số ("abc") thì dùng mặc định', async () => {
    const { controller, inbox } = mk();
    await controller.inbox(CUSTOMER, undefined, 'abc', undefined);
    expect(inbox.mock.calls[0][2]).toBe(1);
  });

  it('page = 0 thì dùng mặc định, không cho skip âm', async () => {
    const { controller, inbox } = mk();
    await controller.inbox(CUSTOMER, undefined, '0', undefined);
    expect(inbox.mock.calls[0][2]).toBe(1);
  });

  it('page âm thì dùng mặc định', async () => {
    const { controller, inbox } = mk();
    await controller.inbox(CUSTOMER, undefined, '-5', undefined);
    expect(inbox.mock.calls[0][2]).toBe(1);
  });

  /**
   * page khổng lồ vẫn là số nguyên dương nên lọt qua các chặn trên, nhưng
   * skip = (page - 1) * limit thì tràn kiểu Int của Prisma và nổ 500 — đúng loại
   * lỗi mà clamp() sinh ra để dập. Phải có trần.
   */
  it('page khổng lồ bị chặn ở trần, không để skip tràn Int', async () => {
    const { controller, inbox } = mk();
    await controller.inbox(CUSTOMER, undefined, String(Number.MAX_SAFE_INTEGER), undefined);
    expect(inbox.mock.calls[0][2]).toBe(1_000_000);
  });

  it('limit vượt trần 100 thì bị chặn về 100', async () => {
    const { controller, inbox } = mk();
    await controller.inbox(CUSTOMER, undefined, undefined, '9999');
    expect(inbox.mock.calls[0][3]).toBe(100);
  });
});
