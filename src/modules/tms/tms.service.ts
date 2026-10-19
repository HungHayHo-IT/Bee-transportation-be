import {
  ConflictException, Injectable, NotFoundException, ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { Of1Client, type KetQuaDayTms } from './of1.client';
import { DiaChiKhachService } from '../customers/dia-chi-khach.service';
import { dungPayloadTmsBill, thieuGiDeDay, type DonDeDay, type OThieu } from './tms-payload.helper';
import { dungPayloadCustomer, thieuGiDeDongBo } from './customer-payload.helper';

/** Trạng thái cho phép đẩy (lại). Xem giải thích ở `day()`. */
const CHO_DAY = [{ tmsStatus: null }, { tmsStatus: 'tu_choi' }, { tmsStatus: 'khong_ro' }];

@Injectable()
export class TmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: Of1Client,
    private readonly diaChi: DiaChiKhachService,
  ) {}

  /**
   * Đẩy một đơn sang OF1-TMS, bảo đảm mỗi đơn chỉ vào OF1 một lần.
   *
   * CHIẾM CHỖ trong cơ sở dữ liệu trước, gọi OF1 sau. Đổi thứ tự là mở cửa cho
   * hai lượt cùng đẩy một đơn trong cùng một khoảnh khắc.
   *
   * Đẩy lại được khi đang ở `tu_choi` hoặc `khong_ro`:
   *
   * - `tu_choi` — OF1 nói rõ nó từ chối, bên đó KHÔNG sinh bill nào.
   * - `khong_ro` — mạng đứt giữa chừng, không biết đơn đã vào hay chưa.
   *
   * Trước đây `khong_ro` bị cấm tuyệt đối, vì contract v1.0 nói mỗi CREATE
   * nhận được là một bill MỚI: gửi lại khi không chắc là sinh đơn trùng bên
   * đối tác. Contract v1.3 mục 5.1 đổi hẳn điều đó — khoá là `orderCode`, và
   * tài liệu viết thẳng: "Mất response? Cứ gửi lại cùng orderCode — không tạo
   * đơn trùng."
   *
   * Giữ luật cũ sau khi nền đã đổi là bắt người ta đối soát tay cho một thao
   * tác nay đã an toàn.
   *
   * VẪN chặn `nhan` và `dang_gui`: cái đầu đã xong, cái sau đang có lượt khác
   * chạy.
   */
  async day(orderId: number): Promise<KetQuaDayTms> {
    // Kiểm cấu hình TRƯỚC khi chiếm chỗ: chiếm rồi mới phát hiện thiếu là đơn
    // kẹt ở 'dang_gui' vĩnh viễn, không ai đẩy lại được.
    const cauHinh = this.client.docCauHinh();
    if (!cauHinh) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình OF1-TMS (OF1_TMS_URL, OF1_COMPANY_CODE, OF1_TOKEN)',
      );
    }

    const don = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        serviceChild: { select: { tmsMode: true } },
        customer: {
          select: { code: true, companyName: true, contactName: true, phone: true },
        },
        originLocation: { select: { name: true, address: true, of1Id: true } },
        destinationLocation: { select: { name: true, address: true, of1Id: true } },
      },
    });
    if (!don) throw new NotFoundException('Không tìm thấy đơn');
    /* Cung tap trang thai voi CHO_DAY — hai cho noi cung mot luat. Chung tach
       nhau vi cho nay tra cau noi duoc cho nguoi dung, con CHO_DAY la dieu
       kien chiem cho nguyen tu. */
    if (!CHO_DAY.some((x) => x.tmsStatus === don.tmsStatus)) {
      throw new ConflictException(`Đơn đã đẩy sang OF1 (${don.tmsStatus})`);
    }

    /* Chấm đủ-thiếu TRƯỚC khi chiếm chỗ. Để OF1 trả 400 thì rẻ hơn về mã
       nguồn nhưng đắt hơn về vận hành: OF1 luôn trả HTTP 200 và không chặn
       trùng, nên mỗi lần gửi hỏng vẫn là một lần phải đối soát tay. Và chiếm
       chỗ rồi mới phát hiện thiếu là đơn kẹt ở 'dang_gui'. */
    const thieu = thieuGiDeDay(don as unknown as DonDeDay);
    if (thieu.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Đơn chưa đủ thông tin để chuyển sang OF1-TMS',
        thieu,
      });
    }

    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, OR: CHO_DAY },
      data: { tmsStatus: 'dang_gui', tmsPushedAt: new Date(), tmsError: null },
    });
    if (count === 0) throw new ConflictException('Đơn đang được đẩy ở nơi khác');

    /* Tra MÃ địa chỉ ngay trước khi gửi, không lưu sẵn trên đơn: địa chỉ của
       đơn sửa được, và một mã lưu từ hôm trước sẽ trỏ vào chỗ khác với chuỗi
       đang hiện trên màn hình. Hai câu hỏi rẻ, chạy một lần mỗi lần đẩy. */
    const khach = (don as { customerId: number | null }).customerId;
    const canhBaoKhach = khach === null ? [] : await this.guiLaiKhach(khach);
    const d = don as unknown as DonDeDay;
    const payload = dungPayloadTmsBill({
      ...d,
      serviceData: (don as { serviceData?: unknown }).serviceData,
      maDiaChiLay: khach === null ? null : await this.diaChi.maTheoDiaChi(khach, d.originAddress),
      maDiaChiGiao: khach === null
        ? null : await this.diaChi.maTheoDiaChi(khach, d.destinationAddress),
    });
    const kq = await this.client.day(payload, cauHinh);
    await this.prisma.order.update({
      where: { id: orderId },
      data: { tmsStatus: kq.ketQua, tmsError: kq.loi },
    });
    return { ...kq, canhBao: [...canhBaoKhach, ...kq.canhBao] };
  }

  /**
   * Gui lai ho so khach sang OF1 NGAY TRUOC khi day don. Tra ve cac canh bao.
   *
   * Contract muc 3: don gui `customerCode` chua dong bo se bi tu choi 400. Truoc
   * day ho so khach chi sang OF1 khi co nguoi chay script bang tay, nen khach
   * moi tao — hay khach vua sua dia chi — khong bao gio sang toi ben kia, va don
   * dau tien cua ho an 400. Gui lai moi lan day thi khong can cron, khong can moc
   * vao man sua khach: upsert theo `customerCode` nen gui lai bao nhieu lan cung
   * an toan, va dia chi moi nhat luon di truoc don dung den no.
   *
   * KHONG BAO GIO chan don. Day chi la lam moi: khach da dong bo tu truoc thi
   * don van vao duoc du lan gui nay hong. Neu khach chua tung sang OF1 thi chinh
   * OF1 se tu choi don voi cau ro rang, va canh bao o day noi ly do.
   */
  private async guiLaiKhach(customerId: number): Promise<string[]> {
    const cauHinh = this.client.docCauHinh('CUSTOMER');
    if (!cauHinh) return [];
    const k = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        code: true, companyName: true, contactName: true, email: true,
        taxCode: true, note: true, status: true,
        addresses: {
          select: { code: true, address: true, contact: true, type: true, isActive: true },
          orderBy: { code: 'asc' },
        },
      },
    });
    if (!k) return [];
    const thieu = thieuGiDeDongBo(k);
    if (thieu.length > 0) {
      return [`Hồ sơ khách chưa gửi lại được sang OF1: thiếu ${thieu.map((t) => t.nhan).join(', ')}`];
    }
    const kq = await this.client.dayKhach(dungPayloadCustomer(k), cauHinh);
    const ra = kq.canhBao.map((c) => `Hồ sơ khách: ${c}`);
    if (kq.ketQua !== 'nhan') ra.unshift(`Hồ sơ khách chưa cập nhật được sang OF1: ${kq.loi ?? kq.ketQua}`);
    return ra;
  }

  /**
   * Chấm đủ-thiếu mà KHÔNG gửi gì cả, cho màn hình hiện sẵn trạng thái nút.
   *
   * Tách khỏi `day()` để trang chi tiết đơn biết trước là bấm vào sẽ được hay
   * không, thay vì để người dùng bấm rồi mới nhận câu từ chối.
   */
  async kiem(orderId: number): Promise<{ thieu: OThieu[] }> {
    const don = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        serviceChild: { select: { tmsMode: true } },
        customer: {
          select: { code: true, companyName: true, contactName: true, phone: true },
        },
        originLocation: { select: { name: true, address: true, of1Id: true } },
        destinationLocation: { select: { name: true, address: true, of1Id: true } },
      },
    });
    if (!don) throw new NotFoundException('Không tìm thấy đơn');
    return { thieu: thieuGiDeDay(don as unknown as DonDeDay) };
  }
}
