import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Tx } from '@/common/prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { chonDuocKhiTaoDon } from '../customers/approval.helper';

/**
 * Tra hồ sơ khách theo số điện thoại, bỏ khoảng trắng thừa hai đầu.
 *
 * Số rỗng thì KHÔNG tra: `findFirst` với `phone: undefined` là "lấy hàng đầu
 * tiên trong bảng", tức là gán đơn của người lạ vào một khách có sẵn bất kỳ.
 */
async function findByPhone(
  tx: Tx,
  phone: string | undefined,
): Promise<{ id: number; phone: string | null } | null> {
  const needle = phone?.trim();
  if (!needle) return null;
  return tx.customer.findFirst({
    where: { phone: needle },
    select: { id: true, phone: true },
  });
}

/**
 * Hồ sơ khách của đơn do ĐỐI TÁC tự tạo (081): luôn là hồ sơ mang chính email
 * của tài khoản đó — tìm thấy thì dùng lại, chưa có thì tạo.
 *
 * Bỏ qua customerId/tên công ty client gửi lên: tra theo tên có thể dính vào
 * một hồ sơ không mang email Bee Logistics, và đơn đó lập tức rơi khỏi phạm vi
 * của chính người vừa tạo (ScopeService lọc đối tác theo email hồ sơ khách).
 */
export async function khachCuaDoiTac(
  tx: Tx,
  email: string,
  nhap: { companyName?: string; contactName?: string; phone?: string } | undefined,
): Promise<number> {
  const co = await tx.customer.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (co) return co.id;
  return (await tx.customer.create({
    data: {
      companyName: nhap?.companyName?.trim() || null,
      contactName: nhap?.contactName?.trim() || null,
      phone: nhap?.phone?.trim() || null,
      email,
      status: 'approved',
    },
  })).id;
}

/**
 * Chọn hồ sơ khách cho một đơn đang tạo, trong CÙNG transaction sinh mã đơn.
 *
 * QA-09: khách mới tạo NGAY TRONG giao dịch này. Trùng tên thì dùng lại hồ sơ
 * cũ — sale gõ lại tên một khách quen không được đẻ ra hồ sơ thứ hai.
 *
 * Lấp số điện thoại còn trống của hồ sơ cũ là chỗ giữ cho HAI LẦN CHẤM đủ-thiếu
 * khớp nhau: `create()` chấm trên DTO, `promoteIfComplete()` chấm lại trên hồ sơ
 * khách đã lưu. Không lấp thì đơn của khách cũ chưa có số sẽ kẹt vĩnh viễn trong
 * awaiting_info — chấm lần sau đọc `phone = null`, không đồng ý thăng, và thoát
 * lặng lẽ không một dòng log.
 *
 * CHỈ lấp chỗ trống, TUYỆT ĐỐI không đè số đã có: người gửi form công khai là
 * khách vãng lai ẩn danh, cho phép đè nghĩa là ai cũng đổi được số liên hệ của
 * một công ty có thật chỉ bằng cách gõ đúng tên họ.
 *
 * Nằm ngoài OrdersService để giữ orders.service.ts dưới mốc 300 dòng — nhận phụ
 * thuộc qua tham số thay vì `this`.
 */
export async function resolveCustomerId(
  tx: Tx,
  customers: Pick<CustomersService, 'findByName'>,
  dto: {
    customerId?: number;
    newCustomer?: { companyName?: string; contactName?: string; phone?: string };
  },
): Promise<number | undefined> {
  // Chọn một hồ sơ CÓ SẴN thì hồ sơ đó phải đã được duyệt.
  //
  // Đây là điểm chặn thật của cả tính năng duyệt khách. Danh sách gợi ý đã lọc
  // sẵn nên giao diện không mời hồ sơ chờ, nhưng giao diện không phải là hàng
  // rào: một lần gọi API thẳng với customerId bất kỳ vẫn mở được đơn cho hồ sơ
  // chưa ai rà. Chặn ở tầng dữ liệu thì đường nào cũng đụng.
  if (dto.customerId !== undefined) {
    const c = await tx.customer.findUnique({
      where: { id: dto.customerId },
      select: { status: true },
    });
    if (!c) throw new NotFoundException('Không tìm thấy khách hàng');
    if (!chonDuocKhiTaoDon(c.status))
      throw new BadRequestException(
        c.status === 'pending'
          ? 'Hồ sơ khách hàng này đang chờ duyệt, chưa dùng để tạo đơn được'
          : 'Hồ sơ khách hàng này đã bị từ chối',
      );
  }

  if (!dto.newCustomer) return dto.customerId;

  const companyName = dto.newCustomer.companyName?.trim();

  // Khách từ form website chưa có tên công ty, nên không còn khoá TÊN để tra.
  // Khoá thay thế là SỐ ĐIỆN THOẠI — trường bắt buộc duy nhất của form đó.
  // Không tra gì cả thì mỗi lần khách hỏi lại là một hồ sơ mới: danh bạ phình
  // ra và "số đơn của khách" bị chia nhỏ thành nhiều mẩu vô nghĩa.
  const existing = companyName
    ? await customers.findByName(tx, companyName)
    : await findByPhone(tx, dto.newCustomer.phone);

  if (!existing)
    return (await tx.customer.create({
      // Hồ sơ đẻ ra lúc tạo đơn — kể cả khách tự gửi từ landing — vào thẳng
      // danh bạ ('approved'). Từ 052 không còn màn duyệt: để 'pending' là hồ sơ
      // bị ẩn khỏi màn Khách hàng vĩnh viễn (danh sách chỉ hiện 'approved'),
      // đã xảy ra với 20 khách từ website trước khi sửa (077, 14/10/2026).
      data: { ...dto.newCustomer, companyName: companyName ?? null, status: 'approved' },
    })).id;

  const submitted = dto.newCustomer.phone?.trim();
  const stored = existing.phone?.trim();
  if (submitted && !stored)
    await tx.customer.update({ where: { id: existing.id }, data: { phone: submitted } });
  return existing.id;
}
