import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PartnerLogosService } from './partner-logos.service';

const S3 = 'https://cdn.beeops.test';

function dung(row: Record<string, unknown> | null = { id: 1 }) {
  const partnerLogo = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(row),
    aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 30 } }),
    create: jest.fn().mockImplementation(({ data }) => ({ id: 9, isActive: true, ...data })),
    update: jest.fn().mockImplementation(({ data }) => ({
      id: 1, groupKey: 'customer', name: 'A', imageUrl: '/img/logos/a.svg',
      ratio: 2, sortOrder: 10, isActive: true, ...data,
    })),
    delete: jest.fn().mockResolvedValue({}),
  };
  const $transaction = jest.fn().mockResolvedValue([]);
  const refresh = { lamMoi: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue(`${S3}/`) };
  const svc = new PartnerLogosService(
    { partnerLogo, $transaction } as never, refresh as never, config as never,
  );
  return { svc, partnerLogo, refresh, $transaction };
}

const moi = (imageUrl: string) => ({ group: 'customer' as const, name: 'ACME', imageUrl, ratio: 3.2 });

describe('PartnerLogosService', () => {
  it('nhan anh vua tai len S3 cua BeeOps', async () => {
    const { svc } = dung();
    await expect(svc.tao(moi(`${S3}/cms/acme.webp`))).resolves.toMatchObject({ name: 'ACME' });
  });

  it('nhan logo co san trong landing', async () => {
    const { svc } = dung();
    await expect(svc.tao(moi('/img/logos/customers/01-kone.svg'))).resolves.toBeTruthy();
  });

  /** Một URL tuỳ ý là một cách cài ảnh của người lạ — hay điểm theo dõi — lên trang chủ. */
  it('tu choi URL o noi khac', async () => {
    const { svc, partnerLogo } = dung();
    await expect(svc.tao(moi('https://evil.example/x.png'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.tao(moi('/img/logos/../../secret'))).rejects.toBeInstanceOf(BadRequestException);
    expect(partnerLogo.create).not.toHaveBeenCalled();
  });

  it('logo moi nam CUOI dai', async () => {
    const { svc, partnerLogo } = dung();
    await svc.tao(moi('/img/logos/x.svg'));
    expect(partnerLogo.create.mock.calls[0][0].data.sortOrder).toBe(40);
  });

  /** Không gọi thì người vừa bật/tắt phải đợi hết cửa sổ cache mới thấy. */
  it('moi lan them / sua / xoa deu bao landing lam moi', async () => {
    const { svc, refresh } = dung();
    await svc.tao(moi('/img/logos/x.svg'));
    await svc.sua(1, { isActive: false });
    await svc.xoa(1);
    expect(refresh.lamMoi).toHaveBeenCalledTimes(3);
    expect(refresh.lamMoi).toHaveBeenCalledWith('partner-logos');
  });

  it('landing chi nhan logo dang bat', async () => {
    const { svc, partnerLogo } = dung();
    await svc.congKhai();
    expect(partnerLogo.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });

  it('sap xep: dat sort_order theo dung thu tu mang, roi bao landing', async () => {
    const { svc, partnerLogo, refresh } = dung();
    partnerLogo.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
    await svc.sapXep({ group: 'customer', ids: [3, 1, 2] });
    expect(partnerLogo.update.mock.calls.map((c) => [c[0].where.id, c[0].data.sortOrder]))
      .toEqual([[3, 10], [1, 20], [2, 30]]);
    expect(refresh.lamMoi).toHaveBeenCalledWith('partner-logos');
  });

  /** Gửi thiếu là dòng còn lại giữ thứ tự cũ chen vào giữa thứ tự mới. */
  it('sap xep: tu choi danh sach thieu hoac la', async () => {
    const { svc, partnerLogo, $transaction } = dung();
    partnerLogo.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    await expect(svc.sapXep({ group: 'customer', ids: [1, 2] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.sapXep({ group: 'customer', ids: [1, 2, 99] })).rejects.toBeInstanceOf(BadRequestException);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('sua / xoa logo khong ton tai thi 404', async () => {
    const { svc } = dung(null);
    await expect(svc.sua(99, { isActive: true })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.xoa(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
