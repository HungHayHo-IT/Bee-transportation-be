import { PrismaService } from '@/common/prisma/prisma.service';
import { linkGuestQuoteRequests } from './guest-request-link.helper';

/**
 * B-27 nửa sau: khách gửi form báo giá lúc chưa đăng nhập thì yêu cầu không
 * gắn vào tài khoản nào (`customer_id` null), nên mã yêu cầu phát cho khách vô
 * dụng trong app — chỉ đọc qua điện thoại cho nhân viên được.
 *
 * Gắn khi khách đăng nhập sau bằng ĐÚNG email đã khai.
 */
function mk() {
  const updateMany = jest.fn().mockResolvedValue({ count: 2 });
  const prisma = { quoteRequest: { updateMany } } as unknown as PrismaService;
  return { prisma, updateMany };
}

const whereOf = (m: jest.Mock) => m.mock.calls[0][0].where as Record<string, unknown>;

describe('linkGuestQuoteRequests — gắn yêu cầu vãng lai vào tài khoản', () => {
  it('chỉ đụng yêu cầu CHƯA có chủ', async () => {
    const { prisma, updateMany } = mk();
    await linkGuestQuoteRequests(prisma, 7, 'a@b.c');
    expect(whereOf(updateMany).customerId).toBeNull();
  });

  it('gắn đúng customerId được truyền vào', async () => {
    const { prisma, updateMany } = mk();
    await linkGuestQuoteRequests(prisma, 7, 'a@b.c');
    expect(updateMany.mock.calls[0][0].data).toEqual({ customerId: 7 });
  });

  /**
   * quote_requests.email là text thường và lúc lưu chỉ .trim() chứ không hạ
   * chữ, trong khi customer_accounts.email là citext. Khớp phân biệt hoa thường
   * thì khách gõ "Linh@Bee.VN" trên form rồi đăng nhập bằng "linh@bee.vn" sẽ
   * không bao giờ nhận lại được yêu cầu của chính mình.
   */
  it('khớp email KHÔNG phân biệt hoa thường', async () => {
    const { prisma, updateMany } = mk();
    await linkGuestQuoteRequests(prisma, 7, 'Linh@Bee.VN');
    const email = whereOf(updateMany).email as { equals: string; mode: string };
    expect(email.mode).toBe('insensitive');
    expect(email.equals).toBe('linh@bee.vn');
  });

  it('cắt khoảng trắng hai đầu trước khi khớp', async () => {
    const { prisma, updateMany } = mk();
    await linkGuestQuoteRequests(prisma, 7, '  a@b.c  ');
    expect((whereOf(updateMany).email as { equals: string }).equals).toBe('a@b.c');
  });

  /**
   * ĐIỂM QUAN TRỌNG NHẤT. Số điện thoại KHÔNG được dùng để khớp: ai cũng gõ
   * được số bất kỳ vào form công khai, và số điện thoại thì được tái cấp cho
   * người khác. Khớp theo số là trao yêu cầu của người lạ cho chủ tài khoản.
   * Email thì khách đã chứng minh quyền kiểm soát bằng OTP lúc đăng ký.
   */
  it('KHÔNG khớp theo số điện thoại', async () => {
    const { prisma, updateMany } = mk();
    await linkGuestQuoteRequests(prisma, 7, 'a@b.c');
    expect(Object.keys(whereOf(updateMany))).not.toContain('phone');
  });

  /** Email rỗng thì không có gì để khớp — đừng quét cả bảng. */
  it('email rỗng thì không gọi DB', async () => {
    const { prisma, updateMany } = mk();
    await linkGuestQuoteRequests(prisma, 7, '   ');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('trả về số yêu cầu đã gắn', async () => {
    const { prisma } = mk();
    await expect(linkGuestQuoteRequests(prisma, 7, 'a@b.c')).resolves.toBe(2);
  });

  /**
   * Gắn yêu cầu là việc phụ. DB chập chờn ở bước này không được phép làm hỏng
   * việc chính là đăng nhập — khách sẽ không hiểu vì sao mật khẩu đúng mà vẫn
   * vào không được.
   */
  it('lỗi DB thì nuốt, trả 0, không ném ra ngoài', async () => {
    const updateMany = jest.fn().mockRejectedValue(new Error('DB chập chờn'));
    const prisma = { quoteRequest: { updateMany } } as unknown as PrismaService;
    await expect(linkGuestQuoteRequests(prisma, 7, 'a@b.c')).resolves.toBe(0);
  });
});
