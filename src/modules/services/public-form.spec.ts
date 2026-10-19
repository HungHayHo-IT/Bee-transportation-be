import { dungFormCongKhai } from './public-form.helper';
import { missingOrderInfo } from '../orders/order-completeness.helper';
import { kiemDichVuCon } from '../orders/dich-vu-con.helper';

const CON = [{ id: 7, name: 'Xuất khẩu nguyên container (FCL)', tmsMode: 'EXPORT_FCL' }];

function batBuoc(ds: ReturnType<typeof dungFormCongKhai>): string[] {
  return ds.filter((o) => o.required).map((o) => o.key);
}

describe('dungFormCongKhai', () => {
  it('dịch vụ không chia nhỏ thì KHÔNG hỏi dịch vụ con', () => {
    const ds = dungFormCongKhai({ hasDomesticDestination: true }, []);
    expect(ds.map((o) => o.key)).not.toContain('serviceChildId');
  });

  it('dịch vụ có dòng con đang bật thì hỏi, và là bắt buộc', () => {
    const ds = dungFormCongKhai({ hasDomesticDestination: true }, CON);
    const o = ds.find((x) => x.key === 'serviceChildId');
    expect(o).toMatchObject({ type: 'select', required: true });
    expect(o?.options).toEqual(CON);
  });

  // CBT di ra nuoc ngoai: danh sach tinh/thanh Viet Nam vo nghia voi no, va
  // backend cung bo qua o nay luc cham don. Hoi mot o ma backend khong doi la
  // chan khach gui yeu cau vi mot ly do khong co that.
  it('dịch vụ không có điểm đến trong nước thì KHÔNG hỏi tỉnh/thành điểm đến', () => {
    const ds = dungFormCongKhai({ hasDomesticDestination: false }, []);
    expect(ds.map((o) => o.key)).not.toContain('destinationProvince');
  });

  it('ô select mới có options, ô khác để mảng rỗng', () => {
    for (const o of dungFormCongKhai({ hasDomesticDestination: true }, CON))
      expect(o.options.length > 0).toBe(o.type === 'select');
  });
});

/* Day moi la phan dang gia: config phai khop LUAT BACKEND DANG CHAY, khong
   phai mot ban chep tay. Lech mot o la app gui len thieu, va yeu cau nam im o
   `pending` khong ai nhin thay. */
describe('config khớp với luật backend', () => {
  it('mọi ô bắt buộc của missingOrderInfo đều có trong config', () => {
    const ds = dungFormCongKhai({ hasDomesticDestination: true }, []);
    const thieu = missingOrderInfo({
      customerName: null,
      phone: null,
      serviceId: null,
      originProvince: null,
      destinationProvince: null,
      serviceData: {},
      requiredFields: [],
    });
    // Bon o backend doi, tru 'Dich vu' (app da chon dich vu truoc khi mo form).
    expect(thieu).toEqual(['Tên khách hàng', 'Số điện thoại', 'Dịch vụ', 'Điểm đi', 'Điểm đến']);
    expect(batBuoc(ds)).toEqual(
      expect.arrayContaining(['customerName', 'phone', 'originProvince', 'destinationProvince']),
    );
  });

  it('điểm đến: backend bỏ qua thì config cũng bỏ qua', () => {
    const thieu = missingOrderInfo({
      hasDomesticDestination: false,
      customerName: 'A', phone: '0900000000', serviceId: 1,
      originProvince: 'Hà Nội', destinationProvince: null,
      serviceData: {}, requiredFields: [],
    });
    expect(thieu).toEqual([]);
    expect(batBuoc(dungFormCongKhai({ hasDomesticDestination: false }, [])))
      .not.toContain('destinationProvince');
  });

  it('dịch vụ con: backend chặn thì config cũng đánh dấu bắt buộc', () => {
    const conDangBat = [{ id: 7, serviceId: 1 }];
    expect(kiemDichVuCon(1, undefined, conDangBat, true)).not.toBeNull();
    expect(batBuoc(dungFormCongKhai({ hasDomesticDestination: true }, CON)))
      .toContain('serviceChildId');
  });

  it('không có dòng con: backend không chặn thì config cũng không hỏi', () => {
    expect(kiemDichVuCon(1, undefined, [], true)).toBeNull();
    expect(dungFormCongKhai({ hasDomesticDestination: true }, []).map((o) => o.key))
      .not.toContain('serviceChildId');
  });
});
