# -*- coding: utf-8 -*-
"""Đồng thời, biên dữ liệu, validation, múi giờ, injection."""
import re, subprocess
from qa_lib import C, PW, mkorder, ok, parallel, status_is, suite


def pg(sql):
    out = subprocess.run(
        ['docker', 'exec', 'beeops-postgres', 'psql', '-U', 'beeops', '-d', 'beeops', '-tAc', sql],
        capture_output=True, text=True, encoding='utf-8')
    return (out.stdout or '').strip()


def run(f):
    admin, sale, mA = f['admin'], f['sale'], f['mA']
    DOM, dA = f['svc']['DOM'], f['dA']

    # ---------------------------------------------------------------
    suite('Đồng thời — sinh mã đơn')
    N = 25
    saleClients = []
    for i in range(N):
        c = C(f'p{i}')
        c.login('qa.sale1@bee.vn', PW)
        saleClients.append(c)

    def create(i):
        st, p = saleClients[i]('POST', '/orders', {
            'serviceId': DOM, 'originProvince': 'HN', 'destinationProvince': 'HP'})
        return (st, p.get('data', {}).get('code'))

    res = parallel(create, N)
    codes = [c for st, c in res if st == 201 and c]
    ok(f'{N} đơn tạo song song đều thành công', len(codes) == N,
       f'thành công {len(codes)}/{N}: {[r[0] for r in res if r[0] != 201][:3]}')
    ok('mã đơn KHÔNG trùng nhau', len(set(codes)) == len(codes),
       f'{len(codes)} mã, {len(set(codes))} duy nhất')
    nums = sorted(int(c.split('-')[2]) for c in codes)
    ok('số thứ tự liên tục, không nhảy cóc',
       nums == list(range(nums[0], nums[0] + len(nums))) if nums else False,
       f'{nums[:5]}...{nums[-3:]}' if nums else '-')

    dup = pg("SELECT count(*) FROM (SELECT code FROM orders GROUP BY code HAVING count(*)>1) t")
    ok('DB xác nhận không có mã trùng', dup == '0', dup)

    # ---------------------------------------------------------------
    suite('Đồng thời — nộp trùng')
    o = mkorder(sale, DOM)
    oid = o['id']
    mAs = []
    for i in range(6):
        c = C(f'mA{i}')
        c.login('qa.ma@bee.vn', PW)
        mAs.append(c)

    def quote(i):
        return mAs[i]('POST', f'/orders/{oid}/departments/{dA}/quote',
                      {'amount': 10_000_000 + i})[0]
    codes2 = parallel(quote, 6)
    ok('6 lần báo giá song song không làm hỏng dòng',
       all(c in (201, 400, 409, 500) for c in codes2), str(codes2))
    row = pg(f"SELECT quote_version FROM order_departments "
             f"WHERE order_id={oid} AND department_id={dA}")
    ok('quote_version = số lần báo giá thành công',
       row.isdigit() and int(row) == sum(1 for c in codes2 if c == 201), f'v={row} {codes2}')

    def close_twice(_i):
        return sale('POST', f'/orders/{oid}/close', {})[0]
    mA('POST', f'/orders/{oid}/departments/{dA}/quote', {'amount': 12_000_000})
    sale('POST', f'/orders/{oid}/select-quote', {'departmentId': dA})
    outs = parallel(close_twice, 4)
    ok('chốt 4 lần song song: đúng 1 lần thành công',
       sum(1 for c in outs if c == 201) == 1, str(outs))
    amt = pg(f'SELECT final_amount FROM orders WHERE id={oid}')
    ok('doanh thu ghi đúng 1 lần', amt == '12000000', amt)

    # ---------------------------------------------------------------
    suite('Múi giờ mã đơn')
    db_today = pg('SELECT current_date')
    o2 = mkorder(sale, DOM)
    ok('ngày trong mã đơn khớp current_date của PostgreSQL',
       o2['code'].split('-')[1] == db_today.replace('-', ''),
       f"{o2['code']} vs {db_today}")
    ok('định dạng mã đơn đúng đặc tả',
       re.fullmatch(r'[A-Z]{3}-\d{8}-\d{3}', o2['code']) is not None, o2['code'])
    tz = pg("SELECT current_setting('TimeZone')")
    ok('DB chạy múi giờ Việt Nam', tz == 'Asia/Ho_Chi_Minh', tz)

    seq_dom = pg(f"SELECT max(daily_no) FROM orders WHERE service_id={DOM} "
                 f"AND order_day=current_date")
    # CUS co truong bat buoc 'declaration_type' (cau hinh trong service_fields),
    # khong truyen thi API tra 400 — dung nhu thiet ke.
    o3 = mkorder(sale, f['svc']['CUS'],
                 serviceData={'declaration_type': 'Nhập kinh doanh'})
    ok('STT chạy RIÊNG theo từng dịch vụ (CUS bắt đầu lại từ 1)',
       int(o3['code'].split('-')[2]) < int(seq_dom or 0),
       f"CUS={o3['code']} DOM_max={seq_dom}")

    # ---------------------------------------------------------------
    suite('Kiểm tra dữ liệu vào')
    status_is('báo giá số âm', mA('POST', f"/orders/{mkorder(sale, DOM)['id']}"
              f'/departments/{dA}/quote', {'amount': -1})[0], 400)
    o4 = mkorder(sale, DOM)
    status_is('báo giá bằng 0',
              mA('POST', f"/orders/{o4['id']}/departments/{dA}/quote", {'amount': 0})[0], 400)
    status_is('báo giá không phải số',
              mA('POST', f"/orders/{o4['id']}/departments/{dA}/quote",
                 {'amount': 'nhiều tiền'})[0], 400)
    status_is('báo giá vượt numeric(15,0) -> 400 chứ không 500',
              mA('POST', f"/orders/{o4['id']}/departments/{dA}/quote",
                 {'amount': 10 ** 16})[0], 400)

    status_is('field lạ trong body bị chặn (forbidNonWhitelisted)',
              sale('POST', '/orders', {'serviceId': DOM, 'hackField': 1})[0], 400)
    status_is('gán vai trò không tồn tại',
              admin('POST', '/users', {'email': 'z@z.vn', 'fullName': 'Z',
                                       'roles': ['superuser']})[0], 400)
    status_is('tạo user không vai trò nào',
              admin('POST', '/users', {'email': 'z2@z.vn', 'fullName': 'Z', 'roles': []})[0], 400)
    status_is('email trùng', admin('POST', '/users',
              {'email': 'qa.sale1@bee.vn', 'fullName': 'X', 'roles': ['sale']})[0], 409)
    status_is('dịch vụ không tồn tại', sale('POST', '/orders', {'serviceId': 999999})[0], 400)
    status_is('id đơn không phải số', sale('GET', '/orders/abc')[0], 400)
    status_is('mã dịch vụ sai định dạng',
              admin('POST', '/services',
                    {'code': 'domestic', 'name': 'X', 'milestones': ['A']})[0], 400)
    status_is('dịch vụ không có mốc nào',
              admin('POST', '/services', {'code': 'ZZZ', 'name': 'X', 'milestones': []})[0], 400)
    status_is('limit vượt trần', sale('GET', '/orders?limit=5000')[0], 400)
    status_is('page = 0', sale('GET', '/orders?page=0')[0], 400)
    status_is('mật khẩu mới quá ngắn',
              sale('POST', '/auth/change-password',
                   {'currentPassword': PW, 'newPassword': '123'})[0], 400)
    status_is('đổi mật khẩu sai mật khẩu cũ',
              sale('POST', '/auth/change-password',
                   {'currentPassword': 'sai-be-bet', 'newPassword': 'MatKhauMoi123'})[0], 400)

    # ---------------------------------------------------------------
    suite('Injection & chuỗi lạ')
    payloads = ["'; DROP TABLE orders; --", "1 OR 1=1", "%", "_", "\\", "<script>x</script>"]
    for p in payloads:
        st, _ = sale('GET', '/orders?q=' + p.replace(' ', '%20').replace('<', '%3C'))
        ok(f'tìm kiếm với chuỗi {p[:18]!r} không làm sập', st == 200, str(st))
    ok('bảng orders vẫn còn', pg("SELECT to_regclass('public.orders')") == 'orders')

    long_name = 'A' * 5000
    status_is('tên khách quá dài bị chặn',
              sale('POST', '/customers', {'companyName': long_name})[0], 400)
    st, cu = sale('POST', '/customers', {'companyName': 'Cty <b>Bôi Đậm</b> & Cộng sự'})
    ok('ký tự đặc biệt trong tên khách lưu nguyên văn',
       st == 201 and cu['data']['companyName'] == 'Cty <b>Bôi Đậm</b> & Cộng sự')

    status_is('body rỗng với Content-Type JSON',
              sale('POST', '/notifications/read', None)[0], [200, 201])
    st, _ = sale('POST', '/notifications/read', rawbody=b'{khong-phai-json')
    ok('JSON hỏng -> 400 chứ không 500', st == 400, str(st))
    st, _ = sale('POST', '/notifications/read', rawbody=b'"chi-la-mot-chuoi"')
    ok('body JSON hợp lệ nhưng không phải object -> 400', st == 400, str(st))
    status_is('báo giá đúng trần numeric(15,0)',
              mA('POST', f"/orders/{o4['id']}/departments/{dA}/quote",
                 {'amount': 999_999_999_999_999})[0], 201)

    # ---------------------------------------------------------------
    suite('Toàn vẹn dữ liệu')
    orphan = pg("SELECT count(*) FROM order_departments od "
                "LEFT JOIN orders o ON o.id=od.order_id WHERE o.id IS NULL")
    ok('không có order_departments mồ côi', orphan == '0', orphan)
    bad_amt = pg("SELECT count(*) FROM orders WHERE final_amount IS NOT NULL "
                 "AND status IN ('new','distributed','quoting','awaiting_selection')")
    ok('không đơn nào có doanh thu khi chưa chốt', bad_amt == '0', bad_amt)
    bad_dept = pg("SELECT count(*) FROM orders WHERE status IN "
                  "('closed') AND department_id IS NULL")
    ok('mọi đơn đã chốt đều có phòng phụ trách', bad_dept == '0', bad_dept)
    # Khong con trang thai 'completed'; dau hieu da xong la completed_at.
    bad_ms = pg("SELECT count(*) FROM orders o WHERE o.completed_at IS NOT NULL AND EXISTS "
                "(SELECT 1 FROM order_milestones m WHERE m.order_id=o.id AND m.status='pending')")
    ok('đơn đã ghi completed_at không còn mốc pending', bad_ms == '0', bad_ms)
    two_won = pg("SELECT count(*) FROM (SELECT order_id FROM order_departments "
                 "WHERE state='won' GROUP BY order_id HAVING count(*)>1) t")
    ok('không đơn nào có 2 phòng thắng', two_won == '0', two_won)
    dupkey = pg("SELECT count(*) FROM (SELECT dedupe_key FROM notifications "
                "WHERE dedupe_key IS NOT NULL GROUP BY dedupe_key HAVING count(*)>1) t")
    ok('dedupe_key không trùng', dupkey == '0', dupkey)
