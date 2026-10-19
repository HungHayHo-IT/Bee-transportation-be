import { ServiceField } from '@prisma/client';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { CustomerNotifyService } from '../notifications/customer-notify.service';
import { NotifyService } from '../notifications/notify.service';
import { CustomersService } from '../customers/customers.service';
import { DiaChiKhachService } from '../customers/dia-chi-khach.service';
import { ServiceDataValidator } from '../services/service-data.validator';
import { CreateOrderDto } from './dto/order.dto';
import { OrdersQueryService } from './orders-query.service';
import { OrdersService } from './orders.service';

/**
 * "Cho thuê thiết bị" bắt buộc có "Thuê từ ngày"; form landing page không thu ô
 * đó và sẽ không thu. Đơn sinh từ form được phép thiếu — mục đích là đưa yêu cầu
 * vào hàng đợi phòng ban để CÓ NGƯỜI NHÌN THẤY, sale hỏi khách chi tiết sau.
 *
 * Cửa nới nằm ở tham số NỘI BỘ opts, không phải dto.source: source do client gửi
 * lên, lấy nó làm điều kiện thì ai gọi POST /orders cũng bỏ qua được mọi trường
 * bắt buộc.
 */
const RENT_FROM = {
  id: 1, serviceId: 5, fieldKey: 'rent_from', label: 'Thuê từ ngày',
  fieldType: 'date', isRequired: true, options: [], sortOrder: 1, isActive: true,
} as unknown as ServiceField;

const USER = { id: 9, roles: ['sale'] } as unknown as AuthenticatedUser;

function mk() {
  const prisma = {
    service: {
      findUnique: jest.fn().mockResolvedValue({
        id: 5, isActive: true, name: 'Cho thuê thiết bị', cargoFields: [],
      }),
    },
    serviceField: { findMany: jest.fn().mockResolvedValue([RENT_FROM]) },
    // create()/update() nay tra dich vu con dang bat de biet don co phai
    // chon them khong — xem dich-vu-con.helper. Thieu cua nay thi test do
    // vi thieu do gia chu khong vi ma sai.
    serviceChild: { findMany: jest.fn().mockResolvedValue([]) },
    order: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ code: 'RNT-250917-01', source: 'website' }),
    },
    $transaction: jest.fn().mockResolvedValue({ orderId: 77, deptIds: [] }),
  } as unknown as PrismaService;

  const svc = new OrdersService(
    prisma,
    { log: jest.fn() } as unknown as ActivityService,
    {
      push: jest.fn().mockResolvedValue(undefined),
      deptRecipients: jest.fn().mockResolvedValue([]),
      adminsAndSales: jest.fn().mockResolvedValue([1]),
    } as unknown as NotifyService,
    { detail: jest.fn().mockResolvedValue({ id: 77 }) } as unknown as OrdersQueryService,
    {} as CustomersService,
    { ghiNho: jest.fn().mockResolvedValue(null) } as unknown as DiaChiKhachService,
    new ServiceDataValidator(prisma),
    {} as CustomerNotifyService,
  );
  return { svc, prisma };
}

const DTO = {
  serviceId: 5,
  newCustomer: { companyName: 'Công ty Sen Vàng', phone: '0977856665' },
} as CreateOrderDto;

describe('OrdersService.create — đơn từ form công khai được phép thiếu trường bắt buộc', () => {
  it('có opts.fromPublicForm thì tạo được đơn, không ném', async () => {
    const { svc, prisma } = mk();
    const res = await svc.create({ ...DTO, source: 'website' }, USER, { fromPublicForm: true });
    expect(res).toEqual({ id: 77 });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('sale nội bộ tạo (không opts) thì VẪN ném "là bắt buộc"', async () => {
    const { svc } = mk();
    await expect(svc.create({ ...DTO }, USER)).rejects.toThrow('"Thuê từ ngày" là bắt buộc');
  });

  /** Chốt chặn lỗ hổng: client tự khai source không mở được cửa nới. */
  it('dto.source = "website" nhưng không có opts thì VẪN ném', async () => {
    const { svc, prisma } = mk();
    await expect(svc.create({ ...DTO, source: 'website' }, USER)).rejects.toThrow('là bắt buộc');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('nới rồi mà gõ sai khóa serviceData thì vẫn bị từ chối', async () => {
    const { svc } = mk();
    await expect(
      svc.create({ ...DTO, serviceData: { rent_fromm: '2026-09-17' } }, USER, { fromPublicForm: true }),
    ).rejects.toThrow('không có trường: rent_fromm');
  });

  it('nới rồi mà giá trị gửi lên sai kiểu thì vẫn bị từ chối', async () => {
    const { svc } = mk();
    await expect(
      svc.create({ ...DTO, serviceData: { rent_from: '17/09/2026' } }, USER, { fromPublicForm: true }),
    ).rejects.toThrow('YYYY-MM-DD');
  });
});

/**
 * Dich vu con (08/10). Day la loi da xay ra that: form landing chi gui dich vu
 * CHA, ma create() bat buoc phai co dich vu con. Ca bon dich vu van chuyen deu
 * co dich vu con, nen MOI yeu cau tu landing nem loi, auto-convert chet, va
 * khach nam im o 'pending' — bon yeu cau lien tiep nhu vay.
 *
 * Don noi bo VAN bat buoc: sale ngoi truoc man hinh co ca danh sach de chon, va
 * don khong co ma TMS thi khong day sang OF1 duoc.
 */
describe('OrdersService.create — dich vu con', () => {
  const coCon = () => {
    const g = mk();
    (g.prisma.serviceChild.findMany as jest.Mock).mockResolvedValue([
      { id: 11, serviceId: 5 }, { id: 12, serviceId: 5 },
    ]);
    return g;
  };

  it('don tu form cong khai KHONG bat buoc dich vu con', async () => {
    const { svc, prisma } = coCon();
    await expect(svc.create({ ...DTO }, USER, { fromPublicForm: true })).resolves.toEqual({ id: 77 });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('don noi bo thi VAN bat buoc', async () => {
    const { svc, prisma } = coCon();
    await expect(svc.create({ ...DTO, serviceData: { rent_from: '2026-09-17' } }, USER))
      .rejects.toThrow('cần chọn thêm dịch vụ con');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  /** Noi "khong bat buoc" khong co nghia la nhan bua: id sai van bi tu choi. */
  it('gui id dich vu con khong thuoc dich vu do thi van tu choi', async () => {
    const { svc } = coCon();
    await expect(
      svc.create({ ...DTO, serviceChildId: 99 }, USER, { fromPublicForm: true }),
    ).rejects.toThrow('không thuộc dịch vụ đã chọn');
  });
});
