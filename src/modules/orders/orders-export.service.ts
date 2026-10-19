import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { canSeeOrderAmount } from '@/common/scope/money.visibility';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { ServiceFieldsService } from '../services/service-fields.service';
import { ServiceFieldResponseDto } from '../services/dto/service-field.dto';
import { OrderFilterDto } from './dto/order-filter.dto';
import { statusLabel } from './order-state.helper';
import { ORDER_LIST_INCLUDE } from './orders.mapper';
import { OrdersQueryService } from './orders-query.service';
import { customerDisplayName } from '@/common/customer-display-name';
import { DongNoiDung, hopDongPdf } from './hop-dong.pdf';
import { giaHopDong } from './gia-hop-dong.helper';

const vnDate = (d: Date | null): string => (d ? d.toLocaleDateString('vi-VN') : '');

/** Giá trị trường riêng đọc được cho người: cờ true/false thành Có/Không. */
function readServiceValue(value: unknown): string | number {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'number') return value;
  return String(value);
}

const serviceDataOf = (raw: unknown): Record<string, unknown> =>
  (raw ?? {}) as Record<string, unknown>;

/** Cả cụm gộp một ô, dùng khi bộ lọc trải trên nhiều dịch vụ nên không có bộ cột chung. */
function summariseServiceData(raw: unknown): string {
  return Object.entries(serviceDataOf(raw))
    .map(([key, value]) => `${key}: ${readServiceValue(value)}`)
    .join('; ');
}

@Injectable()
export class OrdersExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: OrdersQueryService,
    private readonly serviceFields: ServiceFieldsService,
  ) {}

  /**
   * Excel KHÔNG đi qua DTO nên phải tự gọi canSeeOrderAmount cho TỪNG DÒNG.
   * Quên là mở đường vòng để lộ doanh thu hàng loạt chỉ bằng một cú bấm.
   */
  async excel(f: OrderFilterDto, user: AuthenticatedUser): Promise<Buffer> {
    // Mỗi dịch vụ có bộ trường riêng, nên bộ cột chỉ trải ra được khi bộ lọc đã khóa
    // vào MỘT dịch vụ. Lọc rộng hơn thì gộp cả cụm vào một ô — vẫn đọc được, không
    // phải là một file 60 cột phần lớn để trống. `includeInactive` để bật: đơn cũ
    // vẫn giữ giá trị của trường đã ngừng dùng.
    const fields: ServiceFieldResponseDto[] = f.serviceId
      ? await this.serviceFields.list(f.serviceId, true)
      : [];

    const rows = await this.prisma.order.findMany({
      where: this.query.buildWhere(f, user),
      include: ORDER_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BeeOps';
    const ws = wb.addWorksheet('Đơn hàng');
    ws.columns = [
      { header: 'Mã đơn', key: 'code', width: 20 },
      { header: 'Dịch vụ', key: 'service', width: 34 },
      { header: 'Khách hàng', key: 'customer', width: 30 },
      { header: 'Điểm đi', key: 'from', width: 16 },
      { header: 'Điểm đến', key: 'to', width: 16 },
      { header: 'Trạng thái', key: 'status', width: 20 },
      { header: 'Sale', key: 'sale', width: 22 },
      { header: 'Phòng phụ trách', key: 'dept', width: 24 },
      { header: 'Doanh thu (VND)', key: 'amount', width: 18 },
      { header: 'Ngày tạo', key: 'createdAt', width: 18 },
      { header: 'Ngày chốt', key: 'closedAt', width: 18 },
      ...(fields.length
        ? fields.map((field) => ({
            header: field.unit ? `${field.label} (${field.unit})` : field.label,
            key: `sf_${field.fieldKey}`,
            width: 22,
          }))
        : [{ header: 'Thông số riêng', key: 'serviceData', width: 46 }]),
    ];
    ws.getRow(1).font = { bold: true };

    for (const o of rows)
      ws.addRow({
        code: o.code,
        service: o.service.name,
        customer: customerDisplayName(o.customer) ?? '',
        from: o.originProvince ?? '',
        to: o.destinationProvince ?? '',
        status: statusLabel(o.status),
        sale: o.creator?.fullName ?? '',
        dept: o.department?.name ?? '',
        // Không có quyền -> ô TRỐNG, không phải 0 (0 đọc thành "đơn không doanh thu").
        amount:
          canSeeOrderAmount(user, o) && o.finalAmount !== null ? Number(o.finalAmount) : null,
        createdAt: o.createdAt,
        closedAt: o.closedAt,
        ...(fields.length
          ? Object.fromEntries(
              fields.map((field) => [
                `sf_${field.fieldKey}`,
                readServiceValue(serviceDataOf(o.serviceData)[field.fieldKey]),
              ]),
            )
          : { serviceData: summariseServiceData(o.serviceData) }),
      });

    ws.getColumn('amount').numFmt = '#,##0';
    ws.getColumn('createdAt').numFmt = 'dd/mm/yyyy hh:mm';
    ws.getColumn('closedAt').numFmt = 'dd/mm/yyyy hh:mm';
    // Số cột thay đổi theo dịch vụ được lọc nên không cố định 'K1' được nữa.
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * Phiếu xác nhận đơn hàng, in ra dưới dạng hợp đồng vận chuyển.
   *
   * `dieuKhoan` do nơi gọi đưa vào chứ không đọc ở đây: luồng ký điện tử phải
   * in ĐÚNG đoạn chữ mà nó lưu lại cùng dòng chữ ký. Tự đọc cấu hình ở đây thì
   * hai nơi đọc hai lần, và nếu ai đó sửa điều khoản xen vào giữa thì bản khách
   * ký sẽ khác bản được lưu — đúng cái mà cả tính năng này cố tránh.
   */
  async confirmationPdf(
    id: number,
    user: AuthenticatedUser,
    dieuKhoan?: string,
  ): Promise<Buffer> {
    const o = await this.query.findReadable(id, user);
    // ORDER_LIST_INCLUDE chỉ select companyName; hợp đồng cần cả người liên hệ,
    // SĐT, email và mã số thuế của Bên B.
    const khach = o.customerId
      ? await this.prisma.customer.findUnique({
          where: { id: o.customerId },
          select: { contactName: true, phone: true, email: true, taxCode: true },
        })
      : null;

    const cauHinh = await this.cauHinhCongTy();
    /* Giá lấy qua `giaHopDong`, KHÔNG đọc thẳng `finalAmount`: lúc gửi hợp đồng
       đi thì đơn chưa chốt nên cột đó còn null, và tờ giấy khách ký sẽ không có
       số tiền nào — xem gia-hop-dong.helper.ts. */
    const giaTri = giaHopDong(o);
    const showMoney = canSeeOrderAmount(user, o) && giaTri !== null;

    return hopDongPdf({
      maDon: o.code,
      benA: {
        ten: cauHinh.cong_ty_ten ?? '',
        diaChi: cauHinh.cong_ty_dia_chi ?? '',
        mst: cauHinh.cong_ty_mst ?? '',
        dienThoai: cauHinh.cong_ty_dien_thoai ?? '',
        email: cauHinh.cong_ty_email ?? '',
        daiDien: cauHinh.cong_ty_dai_dien ?? '',
        chucVu: cauHinh.cong_ty_chuc_vu ?? '',
      },
      benB: {
        ten: customerDisplayName(o.customer) ?? '',
        // Khách hàng chưa có cột địa chỉ — để trống thành đường chấm, điền tay.
        diaChi: '',
        mst: khach?.taxCode ?? '',
        dienThoai: khach?.phone ?? '',
        email: khach?.email ?? '',
      },
      noiDung: await this.noiDungDieu1(o, khach?.contactName ?? ''),
      giaTri: showMoney ? giaTri : null,
      ghiChu: o.closeNote ?? null,
      dieuKhoan: dieuKhoan ?? (await this.dieuKhoanMacDinh()),
      inBoi: user.fullName,
      inLuc: new Date(),
    });
  }

  /** Các khoá `cong_ty_*` đọc một lượt, trả về dạng tra theo tên khoá. */
  private async cauHinhCongTy(): Promise<Record<string, string>> {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { startsWith: 'cong_ty_' } },
      select: { key: true, value: true },
    });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /**
   * Điều khoản dùng khi nơi gọi không đưa vào — tức là bản tải tay từ màn quản
   * trị. Thiếu dòng cấu hình thì in hợp đồng KHÔNG có điều khoản còn tệ hơn
   * báo lỗi, nên trả chuỗi rỗng và để trang hợp đồng tự thiếu phần đó một cách
   * nhìn thấy được.
   */
  private async dieuKhoanMacDinh(): Promise<string> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: 'dieu_khoan_ky' } });
    return row?.value ?? '';
  }

  /** Các dòng của Điều 1 — phụ thuộc dịch vụ nên dựng riêng. */
  private async noiDungDieu1(
    o: Awaited<ReturnType<OrdersQueryService['findScoped']>>,
    nguoiLienHe: string,
  ): Promise<DongNoiDung[]> {
    const quyMo = [
      o.weightKg ? `${Number(o.weightKg)} kg` : '',
      o.volumeCbm ? `${Number(o.volumeCbm)} CBM` : '',
      o.packageCount
        ? `${o.packageCount} kiện${o.containerType ? ` (${o.containerType}')` : ''}`
        : '',
    ].filter(Boolean).join('  ·  ');

    const dong: DongNoiDung[] = [
      { nhan: '1.1. Dịch vụ', giaTri: o.service.name },
      { nhan: '1.2. Tuyến vận chuyển', giaTri: `${o.originProvince ?? ''} → ${o.destinationProvince ?? ''}` },
      { nhan: '1.3. Điểm lấy hàng', giaTri: o.originAddress ?? '' },
      { nhan: '1.4. Điểm giao hàng', giaTri: o.destinationAddress ?? '' },
      { nhan: '1.5. Thời gian dự kiến', giaTri: vnDate(o.desiredDate) },
      { nhan: '1.6. Tên hàng', giaTri: o.goodsName ?? '' },
      { nhan: '1.7. Quy mô lô hàng', giaTri: quyMo },
      { nhan: '1.8. Người liên hệ Bên B', giaTri: nguoiLienHe },
    ];

    // Trường riêng của dịch vụ — ở CUS, BRK, RNT thì đây mới là phần mô tả
    // công việc thật, nên hợp đồng không được bỏ.
    const values = serviceDataOf(o.serviceData);
    const rieng = (await this.serviceFields.list(o.serviceId, true)).filter(
      (f) => values[f.fieldKey] !== undefined,
    );
    let i = 9;
    for (const f of rieng) {
      dong.push({
        nhan: `1.${i++}. ${f.unit ? `${f.label} (${f.unit})` : f.label}`,
        giaTri: String(readServiceValue(values[f.fieldKey])),
      });
    }
    return dong;
  }
}
