import {
  ConflictException, ServiceUnavailableException, UnprocessableEntityException,
} from '@nestjs/common';
import { TmsService } from './tms.service';
import type { KetQuaDayTms } from './of1.client';

type Dich = { updateMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };

function dung(opts: {
  tmsStatus?: string | null;
  chiemDuoc?: number;
  ketQua?: KetQuaDayTms;
  coCauHinh?: boolean;
  /** Đè lên đơn mẫu để thử trường hợp thiếu thông tin. */
  don?: Record<string, unknown>;
  /** Kết quả gửi lại hồ sơ khách. */
  ketQuaKhach?: KetQuaDayTms;
  /** Đè lên hồ sơ khách mẫu. */
  khach?: Record<string, unknown>;
}) {
  const order: Dich = {
    findUnique: jest.fn().mockResolvedValue({
      id: 7, code: 'D_FCL_20261006_001', tmsStatus: opts.tmsStatus ?? null, customerId: 3,
      desiredDate: null, originAddress: 'Kho A', destinationAddress: 'Kho B',
      originProvince: null, destinationProvince: null, packageCount: null,
      weightKg: null, volumeCbm: null, note: null,
      serviceChild: { tmsMode: 'DOMESTIC_FCL' },
      customer: { code: 'CL0001', companyName: 'Khách thử' },
      originLocation: { address: 'Kho A', of1Id: 11 },
      destinationLocation: { address: 'Kho B', of1Id: 22 },
      ...opts.don,
    }),
    updateMany: jest.fn().mockResolvedValue({ count: opts.chiemDuoc ?? 1 }),
    update: jest.fn().mockResolvedValue({}),
  };
  const customer = {
    findUnique: jest.fn().mockResolvedValue({
      code: 'CL0001', companyName: 'Khách thử', contactName: null, email: null,
      taxCode: null, note: null, status: 'approved', addresses: [],
      ...opts.khach,
    }),
  };
  const day = jest.fn().mockResolvedValue(opts.ketQua ?? { ketQua: 'nhan', loi: null, canhBao: [] });
  const dayKhach = jest.fn().mockResolvedValue(
    opts.ketQuaKhach ?? { ketQua: 'nhan', loi: null, canhBao: [] });
  const client = {
    docCauHinh: () => (opts.coCauHinh === false
      ? null
      : { url: 'https://of1.test/webhook/beetran/of1/TMSBILL', token: 'x' }),
    day,
    dayKhach,
  };
  const svc = new TmsService(
    { order, customer } as never,
    client as never,
    // DiaChiKhachService — tra ma dia chi; chua co ma thi don van gui dia chi chu.
    { maTheoDiaChi: jest.fn().mockResolvedValue(null) } as never,
  );
  return { svc, order, day, dayKhach };
}

describe('TmsService.day', () => {
  /**
   * Contract muc 3: don gui `customerCode` chua dong bo bi tu choi 400. Truoc
   * day ho so khach chi sang OF1 khi chay script tay, nen khach moi tao khong
   * bao gio sang toi ben kia.
   */
  it('gui lai ho so khach TRUOC khi day don', async () => {
    const { svc, day, dayKhach } = dung({});
    await svc.day(7);
    expect(dayKhach).toHaveBeenCalledTimes(1);
    expect(dayKhach.mock.calls[0][0]).toMatchObject({ customerCode: 'CL0001', name: 'Khách thử' });
    expect(dayKhach.mock.invocationCallOrder[0]).toBeLessThan(day.mock.invocationCallOrder[0]);
  });

  it('canh bao cua ho so khach va cua don deu tra ve', async () => {
    const { svc } = dung({
      ketQuaKhach: { ketQua: 'nhan', loi: null, canhBao: ["address 'A01' could not be resolved"] },
      ketQua: { ketQua: 'nhan', loi: null, canhBao: ['bill warning'] },
    });
    await expect(svc.day(7)).resolves.toMatchObject({
      canhBao: ["Hồ sơ khách: address 'A01' could not be resolved", 'bill warning'],
    });
  });

  /** Lam moi thoi: khach da sang OF1 tu truoc thi don van vao duoc. */
  it('gui khach HONG thi KHONG chan don, chi canh bao', async () => {
    const { svc, day } = dung({ ketQuaKhach: { ketQua: 'tu_choi', loi: 'Validation failed', canhBao: [] } });
    const kq = await svc.day(7);
    expect(day).toHaveBeenCalledTimes(1);
    expect(kq.ketQua).toBe('nhan');
    expect(kq.canhBao[0]).toContain('Validation failed');
  });

  it('khach chua duyet thi khong gui lai, noi ro ly do', async () => {
    const { svc, dayKhach } = dung({ khach: { status: 'pending' } });
    const kq = await svc.day(7);
    expect(dayKhach).not.toHaveBeenCalled();
    expect(kq.canhBao[0]).toContain('chưa duyệt');
  });

  it('đẩy được đơn chưa từng đẩy, rồi ghi lại kết quả', async () => {
    const { svc, order, day } = dung({});
    await expect(svc.day(7)).resolves.toEqual({ ketQua: 'nhan', loi: null, canhBao: [] });
    expect(day).toHaveBeenCalledTimes(1);
    expect(day.mock.calls[0][0]).toMatchObject({
      orderCode: 'D_FCL_20261006_001', fileNo: 'D_FCL_20261006_001', mode: 'DOMESTIC_FCL',
    });
    // v1.3 khoa tao/cap nhat hoan toan theo `orderCode` — khong con `action`.
    expect(day.mock.calls[0][0]).not.toHaveProperty('action');
    expect(order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tmsStatus: 'nhan', tmsError: null } }),
    );
  });

  it('CHIẾM CHỖ trước khi gọi OF1, không phải sau', async () => {
    // Doi thu tu la mo cua cho hai luot cung day mot don: OF1 khong chan trung
    // fileNo nen khach se co hai don.
    const { svc, order, day } = dung({});
    await svc.day(7);
    expect(order.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(day.mock.invocationCallOrder[0]);
  });

  it('chi chiem duoc don chua day, don bi TU CHOI hoac don KHONG RO', async () => {
    const { svc, order } = dung({});
    await svc.day(7);
    expect(order.updateMany.mock.calls[0][0].where).toEqual({
      id: 7,
      OR: [{ tmsStatus: null }, { tmsStatus: 'tu_choi' }, { tmsStatus: 'khong_ro' }],
    });
  });

  it.each(['nhan', 'dang_gui'])(
    'KHONG day lai don dang o trang thai %s', async (tt) => {
      const { svc, day } = dung({ tmsStatus: tt });
      await expect(svc.day(7)).rejects.toBeInstanceOf(ConflictException);
      expect(day).not.toHaveBeenCalled();
    },
  );

  it('cho day lai don bi TU CHOI — sua du lieu xong gui lai la dung', async () => {
    // OF1 tu choi nghia la ben do KHONG sinh bill nao. Gui lai khong tao trung.
    const { svc, day } = dung({ tmsStatus: 'tu_choi' });
    await expect(svc.day(7)).resolves.toMatchObject({ ketQua: 'nhan' });
    expect(day).toHaveBeenCalledTimes(1);
  });

  /**
   * Contract v1.0 cam tuyet doi: moi CREATE nhan duoc la mot bill MOI, nen gui
   * lai khi khong chac la sinh don trung ben doi tac. v1.3 muc 5.1 doi han —
   * khoa la `orderCode`, va tai lieu viet thang "Mat response? Cu gui lai cung
   * orderCode — khong tao don trung".
   *
   * Giu luat cu sau khi nen da doi la bat nguoi ta doi soat tay cho mot thao
   * tac nay da an toan.
   */
  it('cho day lai don KHONG RO — v1.3 upsert theo orderCode nen gui lai an toan', async () => {
    const { svc, day } = dung({ tmsStatus: 'khong_ro' });
    await expect(svc.day(7)).resolves.toMatchObject({ ketQua: 'nhan' });
    expect(day).toHaveBeenCalledTimes(1);
  });

  it('chiếm hụt (luồng khác nhanh tay hơn) thì dừng, không gọi OF1', async () => {
    const { svc, day } = dung({ chiemDuoc: 0 });
    await expect(svc.day(7)).rejects.toBeInstanceOf(ConflictException);
    expect(day).not.toHaveBeenCalled();
  });

  it('ghi lại khong_ro kèm lý do để người ta còn đối soát', async () => {
    const { svc, order } = dung({
      ketQua: { ketQua: 'khong_ro', loi: 'TimeoutError', canhBao: [] },
    });
    await svc.day(7);
    expect(order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tmsStatus: 'khong_ro', tmsError: 'TimeoutError' } }),
    );
  });

  it('thiếu cấu hình thì dừng TRƯỚC khi chiếm chỗ', async () => {
    // Chiem cho roi moi phat hien thieu cau hinh la don ket o 'dang_gui' vinh vien.
    const { svc, order } = dung({ coCauHinh: false });
    await expect(svc.day(7)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(order.updateMany).not.toHaveBeenCalled();
  });
});

describe('TmsService.day — chấm đủ-thiếu trước khi gửi', () => {
  // Chiem cho roi moi phat hien thieu la don ket o 'dang_gui' va khong ai day
  // lai duoc. Phai chan TRUOC updateMany.
  it('thiếu ô bắt buộc thì ném 422 và KHÔNG chiếm chỗ, KHÔNG gọi OF1', async () => {
    const { svc, order, day } = dung({ don: { customer: null, serviceChild: null } });
    await expect(svc.day(7)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(order.updateMany).not.toHaveBeenCalled();
    expect(day).not.toHaveBeenCalled();
  });

  it('câu từ chối liệt kê từng ô thiếu', async () => {
    const { svc } = dung({ don: { customer: null } });
    await expect(svc.day(7)).rejects.toMatchObject({
      // Mot khach thieu ca ma lan ten la HAI o thieu, khong phai mot.
      response: { thieu: [{ truong: 'customerCode' }, { truong: 'customer' }] },
    });
  });
});

describe('TmsService.kiem', () => {
  it('đơn đủ thông tin thì mảng thiếu rỗng', async () => {
    const { svc, day } = dung({});
    await expect(svc.kiem(7)).resolves.toEqual({ thieu: [] });
    expect(day).not.toHaveBeenCalled();
  });

  // Day la cho de nham nhat: mot ham "chi kiem tra" ma lai gui that.
  it('KHÔNG gửi gì sang OF1 và KHÔNG đụng vào trạng thái đơn', async () => {
    const { svc, order, day } = dung({ don: { serviceChild: null } });
    const kq = await svc.kiem(7);
    expect(kq.thieu.map((t) => t.truong)).toEqual(['mode']);
    expect(day).not.toHaveBeenCalled();
    expect(order.updateMany).not.toHaveBeenCalled();
    expect(order.update).not.toHaveBeenCalled();
  });
});
