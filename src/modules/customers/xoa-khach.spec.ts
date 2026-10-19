import { ConflictException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';

function dung(opts: { coKhach?: boolean; soDon?: number }) {
  const customer = {
    count: jest.fn().mockResolvedValue(opts.coKhach === false ? 0 : 1),
    delete: jest.fn().mockResolvedValue({}),
  };
  const order = { count: jest.fn().mockResolvedValue(opts.soDon ?? 0) };
  const svc = new CustomersService(
    { customer, order } as never, {} as never,
  );
  return { svc, customer, order };
}

describe('CustomersService.xoa', () => {
  it('khách không có đơn nào thì xoá được', async () => {
    const { svc, customer } = dung({});
    await expect(svc.xoa(7)).resolves.toBeUndefined();
    expect(customer.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  /* Don tro vao khach bang khoa ngoai, xoa khach la don mat goc. Dem TRUOC khi
     xoa chu khong de khoa ngoai nem loi: loi khoa ngoai cua Postgres mang ten
     rang buoc, nguoi dung doc khong ra. */
  it('khách đang có đơn thì KHÔNG xoá, và câu từ chối nói rõ bao nhiêu đơn', async () => {
    const { svc, customer } = dung({ soDon: 3 });
    await expect(svc.xoa(7)).rejects.toThrow(ConflictException);
    await expect(svc.xoa(7)).rejects.toThrow(/3 đơn/);
    expect(customer.delete).not.toHaveBeenCalled();
  });

  it('không tìm thấy khách thì 404, và KHÔNG đi đếm đơn', async () => {
    const { svc, order } = dung({ coKhach: false });
    await expect(svc.xoa(7)).rejects.toThrow(NotFoundException);
    expect(order.count).not.toHaveBeenCalled();
  });
});
