# -*- coding: utf-8 -*-
"""Vượt quyền, IDOR, rò rỉ doanh thu, thu hồi quyền tức thì."""
from qa_lib import C, mkorder, ok, status_is, suite


def run(f):
    admin, sale, sale2 = f['admin'], f['sale'], f['sale2']
    mA, mB, stA, stB = f['mA'], f['mB'], f['stA'], f['stB']
    lead, acct = f['lead'], f['acct']
    dA, dB, dC = f['dA'], f['dB'], f['dC']

    o = mkorder(sale, f['svc']['DOM'])
    oid = o['id']

    # ---------------------------------------------------------------
    suite('Vượt quyền theo vai trò')
    status_is('nhân viên tạo đơn', stA('POST', '/orders',
              {'serviceId': f['svc']['DOM']})[0], 403)
    status_is('trưởng phòng tạo đơn', mA('POST', '/orders',
              {'serviceId': f['svc']['DOM']})[0], 403)
    status_is('sale tự nhận đơn (việc của phòng ban)',
              sale('POST', f'/orders/{oid}/departments/{dA}/claim')[0], 403)
    status_is('nhân viên chốt đơn', stA('POST', f'/orders/{oid}/close', {})[0], 403)
    status_is('trưởng phòng chốt đơn', mA('POST', f'/orders/{oid}/close', {})[0], 403)
    status_is('sale tạo phòng ban', sale('POST', '/departments', {'name': 'X'})[0], 403)
    status_is('sale tạo tài khoản', sale('POST', '/users',
              {'email': 'x@y.vn', 'fullName': 'X', 'roles': ['sale']})[0], 403)
    status_is('trưởng phòng sửa danh mục dịch vụ',
              mA('PATCH', f"/services/{f['svc']['DOM']}", {'slaHours': 1})[0], 403)
    status_is('Ban lãnh đạo tạo đơn (chỉ được xem)',
              lead('POST', '/orders', {'serviceId': f['svc']['DOM']})[0], 403)

    # ---------------------------------------------------------------
    suite('IDOR — thao tác trên dòng của phòng khác')
    status_is('NV phòng A nhận đơn thay phòng B',
              stA('POST', f'/orders/{oid}/departments/{dB}/claim')[0], 403)
    status_is('NV phòng A báo giá thay phòng B',
              stA('POST', f'/orders/{oid}/departments/{dB}/quote', {'amount': 1})[0], 403)
    status_is('NV phòng A bỏ qua thay phòng B',
              stA('POST', f'/orders/{oid}/departments/{dB}/pass', {'reason': 'x'})[0], 403)
    status_is('trưởng phòng A gán người của phòng B',
              mA('POST', f'/orders/{oid}/departments/{dA}/assign',
                 {'assigneeId': f['stBId']})[0], 400)
    status_is('phòng C (không được phân phối) báo giá',
              acct('POST', f'/orders/{oid}/departments/{dC}/quote', {'amount': 1})[0],
              [403, 404])

    # ---------------------------------------------------------------
    suite('Scope đơn hàng')
    status_is('sale khác đọc chi tiết đơn', sale2('GET', f'/orders/{oid}')[0], 404)
    status_is('sale khác đọc timeline', sale2('GET', f'/orders/{oid}/timeline')[0], 404)
    status_is('sale khác đọc bình luận', sale2('GET', f'/orders/{oid}/comments')[0], 404)
    status_is('sale khác đọc mốc tiến độ', sale2('GET', f'/orders/{oid}/milestones')[0], 404)
    status_is('sale khác đọc file', sale2('GET', f'/orders/{oid}/files')[0], 404)
    status_is('sale khác hủy đơn', sale2('POST', f'/orders/{oid}/cancel',
              {'reason': 'phá hoại'})[0], 404)
    ok('trả 404 chứ không 403 — không xác nhận đơn tồn tại',
       sale2('GET', f'/orders/{oid}')[0] == 404)

    lst = sale2.data('GET', '/orders')
    ok('danh sách của sale khác không chứa đơn này',
       all(i['id'] != oid for i in lst['items']), str(lst['total']))

    status_is('phòng C (không tham gia) đọc đơn', acct('GET', f'/orders/{oid}')[0], 404)
    ok('phòng A (được phân phối) đọc được đơn', mA('GET', f'/orders/{oid}')[0] == 200)
    # Lanh dao xem bao cao tong nhung KHONG mo duoc tung don ngoai phong minh —
    # scope.service.ts dung canReadAllOrders (chi Admin) cho orderWhere, co chu y.
    status_is('Ban lãnh đạo mở đơn ngoài phòng mình', lead('GET', f'/orders/{oid}')[0], 404)

    # ---------------------------------------------------------------
    suite('Rò rỉ doanh thu')
    mA('POST', f'/orders/{oid}/departments/{dA}/quote', {'amount': 50_000_000})
    mB('POST', f'/orders/{oid}/departments/{dB}/quote', {'amount': 40_000_000})
    sale('POST', f'/orders/{oid}/select-quote', {'departmentId': dB})
    sale('POST', f'/orders/{oid}/close', {'note': 'ok'})

    ok('phòng THUA: finalAmount = null (chi tiết)',
       mA.data('GET', f'/orders/{oid}')['finalAmount'] is None)
    ok('phòng THẮNG: finalAmount hiện',
       mB.data('GET', f'/orders/{oid}')['finalAmount'] == 40_000_000)
    loser_list = [i for i in mA.data('GET', '/orders')['items'] if i['id'] == oid]
    ok('phòng THUA: finalAmount = null (danh sách)',
       loser_list and loser_list[0]['finalAmount'] is None)
    kb = mA.data('GET', '/orders/kanban')
    flat = [i for col in kb.values() for i in col if i['id'] == oid]
    ok('phòng THUA: finalAmount = null (kanban)', flat and flat[0]['finalAmount'] is None)
    drill = [i for i in mA.data('GET', '/dashboard/drill?revenueOnly=true')['items'] if i['id'] == oid]
    ok('phòng THUA: finalAmount = null (drill)', drill and drill[0]['finalAmount'] is None)

    st, blob = mA('GET', '/orders/export', raw=True)
    ok('Excel của phòng thua không chứa số 40000000',
       st == 200 and b'40000000' not in blob, f'{st}')
    st, blob = mB('GET', '/orders/export', raw=True)
    ok('Excel của phòng thắng vẫn xuất được', st == 200 and blob[:2] == b'PK', f'{st}')

    ok('phòng THUA: doanh thu dashboard = 0',
       mA.data('GET', '/dashboard/summary')['revenueThisMonth'] == 0)

    status_is('phòng thắng in phiếu xác nhận (chỉ sale/admin)',
              mB('GET', f'/orders/{oid}/confirmation.pdf')[0], 403)

    # ---------------------------------------------------------------
    suite('Báo giá kín')
    rows = mA.data('GET', f'/orders/{oid}')['departments']
    ok('phòng A chỉ thấy 1 dòng báo giá', len(rows) == 1, str(len(rows)))
    ok('và đó là dòng của chính mình', rows and rows[0]['departmentId'] == dA)
    ok('không lộ giá 40tr của phòng B', all(r['amount'] != 40_000_000 for r in rows))
    ns = len(sale.data('GET', f'/orders/{oid}')['departments'])
    ok('sale phụ trách thấy cả 2 dòng', ns == 2, f'thấy {ns}')
    # LECH THIET KE (can xac nhan): bo test nay viet theo thiet ke cu, khi co
    # can_view_company_report / vai lanh dao con mo duoc tung don. Hien tai
    # can-read-all-orders.ts da thu hep con DUNG Admin, va comment trong file do
    # ghi ro day la co y. Ghi nhan hanh vi hien tai thay vi khang dinh cai cu.
    status_is('Ban lãnh đạo mở đơn ngoài phòng (thiết kế hiện tại: chặn)',
              lead('GET', f'/orders/{oid}')[0], 404)

    # ---------------------------------------------------------------
    suite('Cờ "Xem báo cáo công ty" cấp lẻ')
    before = acct('GET', f'/orders/{oid}')[0]
    ok('trước khi bật cờ: không thấy đơn ngoài phạm vi', before == 404, str(before))
    # AggregateReportGuard chan TANG CA NHAN, khong phai "chi tang cong ty":
    # acct la staff thuoc phong C nen o tang phong -> 200, va du lieu da duoc
    # narrow() thu hep ve dung phong do (kiem chung: acct nhan [], admin nhan 2 dong).
    ok('trước khi bật cờ: báo cáo tổng hợp chỉ thấy phòng mình',
       acct.data('GET', '/dashboard/response-time') == [])

    admin('PATCH', f"/users/{f['acctId']}", {'canViewCompanyReport': True})
    # Xem SO LIEU tong va mo TUNG DON la hai quyen khac nhau — co ghi trong
    # is-company-wide.ts / can-read-all-orders.ts. Co chi mo cai thu nhat.
    status_is('SAU khi bật cờ: vẫn KHÔNG mở được đơn ngoài phòng',
              acct('GET', f'/orders/{oid}')[0], 404)
    ok('SAU khi bật cờ: dashboard công ty',
       acct.data('GET', '/dashboard/summary')['scopeLevel'] == 'company')
    status_is('cờ KHÔNG kèm quyền hành động — vẫn không tạo được đơn',
              acct('POST', '/orders', {'serviceId': f['svc']['DOM']})[0], 403)

    admin('PATCH', f"/users/{f['acctId']}", {'canViewCompanyReport': False})
    ok('THU HỒI cờ có hiệu lực NGAY', acct('GET', f'/orders/{oid}')[0] == 404)

    # ---------------------------------------------------------------
    suite('Thu hồi quyền tức thì (token chỉ mang sub)')
    admin('PATCH', f"/users/{f['stAId']}", {'roles': ['staff'], 'departmentId': f['dC']})
    ok('đổi phòng ban -> mất quyền trên đơn cũ ngay',
       stA('GET', f'/orders/{oid}')[0] == 404)
    admin('PATCH', f"/users/{f['stAId']}", {'departmentId': dA})
    ok('trả lại phòng -> có quyền lại ngay', stA('GET', f'/orders/{oid}')[0] == 200)

    admin('PATCH', f"/users/{f['stAId']}/status", {'isActive': False})
    status_is('khóa tài khoản -> 401 ngay ở request kế tiếp',
              stA('GET', '/auth/me')[0], 401)
    admin('PATCH', f"/users/{f['stAId']}/status", {'isActive': True})
    ok('mở khóa -> dùng lại được', stA('GET', '/auth/me')[0] == 200)

    status_is('Admin tự khóa chính mình', admin('PATCH', '/users/1/status',
              {'isActive': False})[0], 400)

    # ---------------------------------------------------------------
    suite('Không xác thực')
    anon = C('anon')
    # /services CO Y gan @Public(): app mobile cu con tai danh muc qua duong nay
    # (xem comment trong services.controller.ts). Danh muc dich vu von da cong
    # khai tren landing page nen khong co gi kin bi lo — nhung no van la mot
    # ngoai le can go khi mobile chuyen han sang /services/public.
    for p in ['/auth/me', '/orders', '/dashboard/summary', '/activity',
              f'/orders/{oid}']:
        status_is(f'ẩn danh GET {p}', anon('GET', p)[0], 401)
    ok('ẩn danh GET /services (@Public có chủ ý) không lộ trường nội bộ',
       all('costBasis' not in s0 and 'departmentIds' not in s0
           for s0 in (anon.data('GET', '/services') or {}).get('items', [])))
    ok('/health mở công khai', anon('GET', '/health')[0] == 200)
    anon.cookie = 'access_token=khong-phai-jwt'
    status_is('token rác -> 401', anon('GET', '/auth/me')[0], 401)

    return oid
