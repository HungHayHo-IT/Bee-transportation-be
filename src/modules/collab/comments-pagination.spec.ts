import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotifyService } from '@/modules/notifications/notify.service';
import { CommentsService } from './comments.service';

const USER = {
  id: 1, fullName: 'Sale A', roles: ['admin'], departmentId: null,
} as unknown as AuthenticatedUser;

const ROW = {
  id: 1, kind: 'comment', body: 'x', departmentId: null, department: null,
  userId: 1, user: { fullName: 'Sale A' }, createdAt: new Date(), mentions: [],
};

function mk(total: number, rows: unknown[] = [ROW]) {
  const count = jest.fn().mockResolvedValue(total);
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = {
    order: { findFirst: jest.fn().mockResolvedValue({ id: 7, createdBy: 1, departmentId: null }) },
    comment: { count, findMany, create: jest.fn().mockResolvedValue({ id: 9 }) },
    orderDepartment: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  } as unknown as PrismaService;
  const svc = new CommentsService(
    prisma,
    { orderWhere: () => ({}), orderReadWhere: () => ({}) } as never,
    { push: jest.fn().mockResolvedValue(undefined), deptRecipients: jest.fn().mockResolvedValue([]) } as unknown as NotifyService,
  );
  return { svc, count, findMany };
}

/**
 * Cho `create()`: `count()` phải phản ánh ĐÚNG lúc nó được gọi — trước hay sau khi
 * bình luận mới đã ghi — chứ không phải một hằng số cố định. `mk()` ở trên trả cùng
 * một `total` cho mọi lần gọi nên không phân biệt được "đếm trước khi ghi" (lỗi
 * lệch-một điển hình) với "đếm sau khi ghi" (đúng). Fixture này gắn `count()` vào
 * việc `comment.create` (bản ghi) đã chạy hay chưa: gọi trước insert thấy
 * `beforeTotal`, gọi sau insert thấy `afterTotal`.
 */
function mkCreate(beforeTotal: number, afterTotal: number, rows: unknown[] = [ROW]) {
  let inserted = false;
  const create = jest.fn().mockImplementation(async () => {
    inserted = true;
    return { id: 9 };
  });
  const count = jest.fn().mockImplementation(async () => (inserted ? afterTotal : beforeTotal));
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = {
    order: { findFirst: jest.fn().mockResolvedValue({ id: 7, createdBy: 1, departmentId: null }) },
    comment: { count, findMany, create },
    orderDepartment: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  } as unknown as PrismaService;
  const svc = new CommentsService(
    prisma,
    { orderWhere: () => ({}), orderReadWhere: () => ({}) } as never,
    { push: jest.fn().mockResolvedValue(undefined), deptRecipients: jest.fn().mockResolvedValue([]) } as unknown as NotifyService,
  );
  return { svc, count, findMany };
}

describe('CommentsService.list — phân trang', () => {
  it('skip = (page - 1) * limit', async () => {
    const { svc, findMany } = mk(100);
    await svc.list(7, USER, 3, 20);
    expect(findMany.mock.calls[0][0].skip).toBe(40);
    expect(findMany.mock.calls[0][0].take).toBe(20);
  });

  it('total lấy từ count, không phải số dòng trang này', async () => {
    const { svc } = mk(87);
    const res = await svc.list(7, USER, 1, 20);
    expect(res.total).toBe(87);
  });

  it('giữ thứ tự thời gian tăng dần — luồng hội thoại đọc từ cũ tới mới', async () => {
    const { svc, findMany } = mk(1);
    await svc.list(7, USER, 1, 20);
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
  });
});

/**
 * Luồng sắp asc nên bình luận vừa viết ở TRANG CUỐI. Trả trang đầu là người dùng
 * viết xong không thấy bình luận của chính mình — đúng thứ dễ sai nhất khi phân
 * trang một luồng hội thoại.
 */
describe('CommentsService.create — trả về trang cuối', () => {
  it('87 bình luận, limit 20 thì trả trang 5', async () => {
    const { svc, findMany } = mk(87);
    const res = await svc.create(7, { body: 'hi' } as never, USER);
    expect(res.page).toBe(5);
    expect(findMany.mock.calls[0][0].skip).toBe(80);
  });

  it('chia hết thì không đẻ thêm trang rỗng — 40 bình luận, limit 20, ra trang 2', async () => {
    const { svc } = mk(40);
    const res = await svc.create(7, { body: 'hi' } as never, USER);
    expect(res.page).toBe(2);
  });

  it('luồng rỗng trước đó vẫn ra trang 1, không phải trang 0', async () => {
    const { svc } = mk(1);
    const res = await svc.create(7, { body: 'hi' } as never, USER);
    expect(res.page).toBe(1);
  });

  /**
   * Biên chia hết: 40 bình luận CÓ SẴN (trước khi ghi), limit 20 — bình luận vừa
   * viết là bình luận thứ 41, mở ra trang 3. Nếu `total` bị đếm TRƯỚC khi ghi (lỗi
   * lệch-một mà việc tách `count()` ra khỏi luồng `list()` có thể vô tình gây ra
   * qua một lần tái cấu trúc sau này), phép tính sẽ dùng 40 và ra trang 2 — người
   * viết xong không thấy bình luận của chính mình, đúng lỗi mà `create()` tồn tại
   * để tránh.
   */
  it('mở trang mới: 40 bình luận có sẵn (chia hết cho limit), bình luận vừa viết mở trang 3', async () => {
    const { svc } = mkCreate(40, 41);
    const res = await svc.create(7, { body: 'hi' } as never, USER);
    expect(res.page).toBe(3);
  });
});
