import { missingInfoForPublicOrder } from './order-completeness.helper';
import { resolveCustomerId } from './order-customer.helper';
import type { Tx } from '@/common/prisma/prisma.service';
import type { CustomersService } from '../customers/customers.service';

/**
 * Form báo giá trên website chỉ hỏi TÊN NGƯỜI, không hỏi tên công ty — hỏi thêm
 * một ô nữa là mất khách. Tên đó phải vào `contactName`, còn `companyName` để
 * trống cho admin điền sau khi đã liên hệ.
 *
 * Hai thứ dưới đây là chỗ dễ vỡ nhất khi đổi:
 *
 * 1. Chấm đủ/thiếu đọc tên khách từ đâu. Đọc mỗi `companyName` thì MỌI đơn từ
 *    web sẽ kẹt vĩnh viễn ở awaiting_info đòi "Tên khách hàng", trong khi màn
 *    hình lại đang hiện tên rõ ràng — không ai hiểu nổi vì sao.
 *
 * 2. Nhận ra khách cũ bằng gì. Khách chưa có tên công ty thì không còn khoá tên
 *    để tra; phải tra theo số điện thoại, không thì mỗi lần khách gửi form lại
 *    đẻ thêm một hồ sơ trùng.
 */

const NO_REQUIRED_FIELDS = (): Promise<never[]> => Promise.resolve([]);

describe('tên khách từ form web nằm ở contactName', () => {
  it('chấm đủ/thiếu chấp nhận contactName thay cho companyName', async () => {
    const missing = await missingInfoForPublicOrder(
      {
        newCustomer: { contactName: 'Lê Thị Minh Châu', phone: '0978445566' },
        serviceId: 3,
        originProvince: 'Hải Phòng',
        destinationProvince: 'TP. Hồ Chí Minh',
      },
      {},
      { fromPublicForm: true },
      NO_REQUIRED_FIELDS,
    );

    expect(missing).not.toContain('Tên khách hàng');
  });

  it('không có tên nào cả thì vẫn phải đòi', async () => {
    const missing = await missingInfoForPublicOrder(
      {
        newCustomer: { phone: '0978445566' },
        serviceId: 3,
        originProvince: 'Hải Phòng',
        destinationProvince: 'TP. Hồ Chí Minh',
      },
      {},
      { fromPublicForm: true },
      NO_REQUIRED_FIELDS,
    );

    expect(missing).toContain('Tên khách hàng');
  });
});

describe('nhận ra khách cũ khi chưa có tên công ty', () => {
  function mkTx(existing: { id: number; phone: string | null } | null) {
    const create = jest.fn().mockResolvedValue({ id: 99 });
    const update = jest.fn().mockResolvedValue({});
    const findFirst = jest.fn().mockResolvedValue(existing);
    const tx = { customer: { create, update, findFirst } } as unknown as Tx;
    return { tx, create, update, findFirst };
  }

  const customers = {
    findByName: jest.fn().mockResolvedValue(null),
  } as unknown as Pick<CustomersService, 'findByName'>;

  it('cùng số điện thoại thì dùng lại hồ sơ cũ, không đẻ hồ sơ thứ hai', async () => {
    const { tx, create } = mkTx({ id: 42, phone: '0978445566' });

    const id = await resolveCustomerId(tx, customers, {
      newCustomer: { contactName: 'Lê Thị Minh Châu', phone: '0978445566' },
    });

    expect(id).toBe(42);
    expect(create).not.toHaveBeenCalled();
  });

  it('số điện thoại chưa từng thấy thì tạo hồ sơ mới, company_name để trống', async () => {
    const { tx, create } = mkTx(null);

    await resolveCustomerId(tx, customers, {
      newCustomer: { contactName: 'Người Mới', phone: '0900000123' },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.contactName).toBe('Người Mới');
    expect(data.companyName ?? null).toBeNull();
    // Vào thẳng danh bạ: màn Khách hàng chỉ hiện 'approved' (077, 14/10/2026).
    expect(data.status).toBe('approved');
  });

  it('có tên công ty thì vẫn tra theo tên như cũ, không đụng tới số điện thoại', async () => {
    const { tx, findFirst } = mkTx(null);
    const byName = {
      findByName: jest.fn().mockResolvedValue({ id: 7, phone: '0912000111' }),
    } as unknown as Pick<CustomersService, 'findByName'>;

    const id = await resolveCustomerId(tx, byName, {
      newCustomer: { companyName: 'Công ty CP Nam Phát', phone: '0999999999' },
    });

    expect(id).toBe(7);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
