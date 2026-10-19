import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityService } from '@/common/activity/activity.service';
import { MailService } from '@/common/mail/mail.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { OrderStatus } from '@/common/enums';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { OrdersExportService } from '@/modules/orders/orders-export.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { CustomerOtpService } from '@/modules/customer-auth/customer-otp.service';
import { DieuKhoanService } from '@/modules/cms/dieu-khoan.service';
import { ChuKyS3Service } from './chu-ky-s3.service';
import { SignaturesService } from './signatures.service';
import { TrangThaiKy } from './chu-ky.helper';

const sale: AuthenticatedUser = {
  id: 4, email: 'sale@bee.vn', fullName: 'Sale', roles: ['sale'],
  departmentId: null, canViewCompanyReport: false, mustChangePassword: false,
};

interface Opts {
  mailHong?: boolean;
  departmentId?: number | null;
  status?: OrderStatus;
  dieuKhoan?: string | null;
  /** Để false khi muốn dựng lại cảnh máy chủ CHƯA cấu hình đường dẫn trang ký. */
  coSignPageUrl?: boolean;
}

/**
 * Prisma giả: $transaction gọi thẳng callback với cùng bộ stub, nên các lời gọi
 * bên trong transaction quan sát được như mọi lời gọi khác.
 */
function mkHarness(opts: Opts = {}) {
  const {
    mailHong = false,
    departmentId = 3,
    status = OrderStatus.DISTRIBUTED,
    dieuKhoan = 'Dieu khoan van chuyen...',
    coSignPageUrl = true,
  } = opts;

  const stub = {
    order: {
      findUnique: jest.fn().mockResolvedValue({
        id: 11, code: 'DOM-20260904-001', status, departmentId, customerId: 21,
      }),
    },
    customer: {
      findUnique: jest.fn().mockResolvedValue({ id: 21, email: 'khach@vd.vn' }),
    },
    appSetting: {
      findUnique: jest.fn().mockResolvedValue(dieuKhoan === null ? null : { value: dieuKhoan }),
    },
    orderSignature: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 77 }),
      delete: jest.fn().mockResolvedValue({ id: 77 }),
      update: jest.fn().mockResolvedValue({ id: 77 }),
    },
  };
  // Gán sau: $transaction tham chiếu chính `stub`, khai báo lồng vào trong thì
  // TypeScript không suy ra được kiểu của nó.
  const withTx = Object.assign(stub, {
    $transaction: jest.fn((cb: (tx: typeof stub) => unknown) => cb(stub)),
  });

  const mail = {
    send: jest.fn(),
    layout: jest.fn((noiDung: string) => `<html>${noiDung}</html>`),
  } as unknown as MailService;
  if (mailHong) {
    (mail.send as jest.Mock).mockRejectedValue(new Error('SMTP tu choi'));
  } else {
    (mail.send as jest.Mock).mockResolvedValue(undefined);
  }

  const activity = { log: jest.fn().mockResolvedValue(undefined) } as unknown as ActivityService;
  const s3 = { luuFile: jest.fn().mockResolvedValue(undefined) } as unknown as ChuKyS3Service;
  const xuat = {
    confirmationPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7 gia')),
  } as unknown as OrdersExportService;

  const service = new SignaturesService(
    withTx as unknown as PrismaService,
    s3,
    xuat,
    {} as OrdersService,
    mail,
    {} as CustomerOtpService,
    activity,
    /* Cấu hình GIẢ chứ không phải ConfigService thật: ConfigService còn đọc
       tiếp `process.env`, nên máy nào có sẵn SIGN_PAGE_URL thì bài "thiếu cấu
       hình" không bao giờ đỏ được — một bài luôn xanh vì sai lý do. */
    {
      get: (k: string) =>
        k === 'SIGN_PAGE_URL' && coSignPageUrl ? 'https://bee.vn/vi-vn/ky' : undefined,
    } as unknown as ConfigService,
    /* Điều khoản ký giờ do DieuKhoanService ghép từ các điều soạn trong CMS
       (migration 053), không còn đọc thẳng app_settings. Giả nguyên dịch vụ
       đó thay vì mock Prisma: chỗ này chỉ quan tâm "có toàn văn hay không". */
    { toanVan: async () => dieuKhoan ?? '' } as unknown as DieuKhoanService,
  );

  return { service, stub: withTx, mail, activity, s3, xuat };
}

describe('SignaturesService.guiYeuCau', () => {
  it('chốt PDF lên S3 rồi mới tạo dòng, và gửi mail cho khách', async () => {
    const { service, stub, mail, s3 } = mkHarness();

    const row = await service.guiYeuCau(11, sale);

    expect(row).toEqual({ id: 77 });
    expect(s3.luuFile).toHaveBeenCalledTimes(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
    // Mã băm của phiếu phải được lưu: đó là thứ chứng minh bản khách ký chính
    // là bản ta gửi đi.
    expect(stub.orderSignature.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pdfSha256: expect.stringMatching(/^[0-9a-f]{64}$/) }),
      }),
    );
  });

  /* Bản PDF khách ký và đoạn chữ lưu cạnh dòng chữ ký phải là MỘT. Để nơi kia
     tự đọc lại cấu hình thì có hai lần đọc ở hai thời điểm, và một lần sửa điều
     khoản xen vào giữa đủ làm hai thứ lệch nhau mà không ai thấy. */
  it('in vào phiếu đúng đoạn điều khoản sẽ được lưu cùng chữ ký', async () => {
    const { service, stub, xuat } = mkHarness({ dieuKhoan: 'Dieu khoan rieng cua lan nay' });

    await service.guiYeuCau(11, sale);

    expect(xuat.confirmationPdf).toHaveBeenCalledWith(11, sale, 'Dieu khoan rieng cua lan nay');
    expect(stub.orderSignature.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dieuKhoan: 'Dieu khoan rieng cua lan nay' }),
      }),
    );
  });

  it('huỷ yêu cầu đang chờ cũ trước khi tạo yêu cầu mới', async () => {
    const { service, stub } = mkHarness();

    await service.guiYeuCau(11, sale);

    expect(stub.orderSignature.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 11, trangThai: TrangThaiKy.CHO_KY },
        data: expect.objectContaining({ trangThai: TrangThaiKy.HET_HAN }),
      }),
    );
    const huy = stub.orderSignature.updateMany.mock.invocationCallOrder[0];
    const tao = stub.orderSignature.create.mock.invocationCallOrder[0];
    expect(huy).toBeLessThan(tao);
  });

  it('mail hỏng thì XOÁ dòng vừa tạo chứ không để lại một yêu cầu chết', async () => {
    const { service, stub, activity } = mkHarness({ mailHong: true });

    await expect(service.guiYeuCau(11, sale)).rejects.toBeInstanceOf(BadRequestException);

    /* Xoá, không phải đánh dấu hết hạn: mã gốc chỉ tồn tại trong lần gọi đó,
       nên dòng này chưa bao giờ là một yêu cầu khách nhận được. Để lại dạng
       "hết hạn" thì sale nhìn bảng tưởng khách đã bỏ quá hạn. */
    expect(stub.orderSignature.delete).toHaveBeenCalledWith({ where: { id: 77 } });
    expect(stub.orderSignature.update).not.toHaveBeenCalled();
    // Và không ghi nhật ký một lần gửi chưa từng rời khỏi máy chủ.
    expect(activity.log).not.toHaveBeenCalled();
  });

  /**
   * THIẾU CẤU HÌNH PHẢI NÓI LÀ THIẾU CẤU HÌNH.
   *
   * `guiMailKy` dựng đường dẫn ở dòng đầu tiên, và cả lời gọi nằm trong khối
   * bắt lỗi báo "Không gửi được email". Nên máy chủ quên đặt SIGN_PAGE_URL cũng
   * hiện ra y hệt lỗi SMTP — và người đi sửa sẽ đi đào nhầm hướng.
   *
   * Đã mất công thật: trên production, SMTP hoàn toàn khoẻ (`verify()` trả OK)
   * mà màn hình vẫn báo không gửi được email.
   *
   * Và phải chặn TRƯỚC khi dựng PDF: không có đường dẫn thì cả việc dựng phiếu
   * lẫn đẩy lên S3 đều là công toi.
   */
  it('thiếu SIGN_PAGE_URL thì báo đúng là thiếu cấu hình, không đổ cho email', async () => {
    const { service, xuat, s3, mail, stub } = mkHarness({ coSignPageUrl: false });

    await expect(service.guiYeuCau(11, sale)).rejects.toThrow(/SIGN_PAGE_URL/);

    expect(xuat.confirmationPdf).not.toHaveBeenCalled();
    expect(s3.luuFile).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
    expect(stub.orderSignature.create).not.toHaveBeenCalled();
  });

  it('đơn chưa chọn báo giá thắng thì chặn trước khi đụng tới S3', async () => {
    const { service, s3, xuat } = mkHarness({ departmentId: null });

    await expect(service.guiYeuCau(11, sale)).rejects.toBeInstanceOf(ConflictException);

    expect(xuat.confirmationPdf).not.toHaveBeenCalled();
    expect(s3.luuFile).not.toHaveBeenCalled();
  });

  it('đơn đã chốt thì không gửi ký được nữa', async () => {
    const { service } = mkHarness({ status: OrderStatus.CLOSED });
    await expect(service.guiYeuCau(11, sale)).rejects.toBeInstanceOf(ConflictException);
  });

  it('chưa soạn điều khoản thì không gửi, chứ không gửi một phiếu trống điều khoản', async () => {
    const { service, s3 } = mkHarness({ dieuKhoan: '   ' });
    await expect(service.guiYeuCau(11, sale)).rejects.toBeInstanceOf(BadRequestException);
    expect(s3.luuFile).not.toHaveBeenCalled();
  });
});
