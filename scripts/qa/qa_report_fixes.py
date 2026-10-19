# -*- coding: utf-8 -*-
"""Hồi quy cho biên bản QA front-end 22/08/2026 — mỗi phát hiện một kiểm tra thật.

Đây là lưới an toàn: sửa xong rồi ai đó lỡ tay hoàn tác thì bộ này đỏ ngay, chứ
không đợi vòng QA sau phát hiện lại.
"""
from qa_lib import mkorder, ok, status_is, suite


def _quote(oid, dept, mgr, amount, **kw):
    body = {'amount': amount}
    body.update(kw)
    return mgr('POST', f'/orders/{oid}/departments/{dept}/quote', body)


def run(f):
    admin, sale, mA, mB = f['admin'], f['sale'], f['mA'], f['mB']
    dA, dB = f['dA'], f['dB']
    DOM = f['svc']['DOM']

    # ---------------------------------------------------------------- QA-01
    suite('QA-01 — trưởng phòng lấy được danh sách nhân viên phòng mình')
    st, p = mA('GET', '/users')
    status_is('trưởng phòng gọi GET /users', st, 200)
    items = p.get('data', {}).get('items', [])
    ok('chỉ trả người của phòng mình', bool(items) and all(u['departmentId'] == dA for u in items),
       str([(u['email'], u['departmentId']) for u in items][:4]))
    ok('có mặt nhân viên của phòng A', any(u['email'] == 'qa.sta@bee.vn' for u in items))
    other = mA('GET', f'/users?departmentId={dB}')[1]['data']['items']
    ok('hỏi phòng khác trả rỗng, không lộ danh sách', other == [], str(other))
    status_is('sale vẫn KHÔNG gọi được', sale('GET', '/users')[0], 403)

    # ---------------------------------------------------------------- QA-02
    suite('QA-02 — tỉnh/thành quy về danh mục chuẩn')
    st, p = sale('POST', '/orders', {
        'serviceId': DOM, 'originProvince': 'HN', 'destinationProvince': ' hải phòng '})
    status_is('viết tắt vẫn tạo được đơn', st, 201)
    d = p.get('data', {})
    ok('HN -> Hà Nội', d.get('originProvince') == 'Hà Nội', str(d.get('originProvince')))
    ok('" hải phòng " -> Hải Phòng',
       d.get('destinationProvince') == 'Hải Phòng', str(d.get('destinationProvince')))
    status_is('tỉnh không có thật -> 400',
              sale('POST', '/orders', {'serviceId': DOM, 'originProvince': 'Xứ Mộng Mơ'})[0], 400)
    provinces = admin.data('GET', '/reference/provinces')['items']
    ok('GET /reference/provinces trả 34 tỉnh/thành', len(provinces) == 34, str(len(provinces)))

    # ---------------------------------------------------------------- QA-05
    suite('QA-05 — mọi danh sách dùng chung vỏ phân trang')
    envelope = {'items', 'total', 'page', 'limit'}
    for path, who in [('/departments', admin), ('/users', admin), ('/services', admin),
                      ('/customers', sale), ('/orders/unrouted', admin),
                      ('/notifications', mA), ('/orders', admin), ('/activity', admin),
                      ('/queue', mA)]:
        body = who.data('GET', path)
        ok(f'{path} có items/total/page/limit',
           isinstance(body, dict) and envelope <= set(body), str(body)[:120])

    # ---------------------------------------------------------------- QA-06
    suite('QA-06 — trường thời gian tên là createdAt ở mọi nơi')
    act = admin.data('GET', '/activity')['items']
    ok('/activity dùng createdAt chứ không phải at',
       bool(act) and 'createdAt' in act[0] and 'at' not in act[0],
       str(sorted(act[0].keys())) if act else 'rỗng')

    # ---------------------------------------------------------------- QA-07
    suite('QA-07 — phân trang và ?limit của drill')
    status_is('drill nhận ?limit', admin('GET', '/dashboard/drill?limit=3')[0], 200)
    lst = admin.data('GET', '/orders?page=1&limit=2')
    ok('/orders?limit=2 trả tối đa 2 dòng', len(lst['items']) <= 2 and lst['limit'] == 2,
       str((len(lst['items']), lst['limit'])))

    # ---------------------------------------------------------------- QA-09
    suite('QA-09 — tạo đơn kèm khách mới trong một lệnh')
    st, p = sale('POST', '/orders', {
        'serviceId': DOM,
        'newCustomer': {'companyName': 'Khách Mới Một Lệnh', 'phone': '0900000001'}})
    status_is('POST /orders với newCustomer', st, 201)
    cid = p.get('data', {}).get('customerId')
    ok('đơn gắn với khách vừa tạo', bool(cid), str(p.get('data', {}).get('customerName')))
    st2, p2 = sale('POST', '/orders', {
        'serviceId': DOM, 'newCustomer': {'companyName': 'khách mới một lệnh'}})
    ok('tên trùng thì DÙNG LẠI hồ sơ cũ, không đẻ hồ sơ thứ hai',
       st2 == 201 and p2['data']['customerId'] == cid,
       f"{st2} · {p2.get('data', {}).get('customerId')} vs {cid}")
    status_is('gửi cả customerId lẫn newCustomer -> 400',
              sale('POST', '/orders', {'serviceId': DOM, 'customerId': cid,
                                       'newCustomer': {'companyName': 'X'}})[0], 400)

    # ---------------------------------------------------------------- QA-14
    suite('QA-14 — doneByName giống nhau ở hai endpoint')
    oid = mkorder(sale, DOM)['id']
    _quote(oid, dA, mA, 30_000_000)
    _quote(oid, dB, mB, 28_000_000)
    sale('POST', f'/orders/{oid}/select-quote', {'departmentId': dB})
    sale('POST', f'/orders/{oid}/close', {'note': 'chốt để kiểm tra mốc'})
    ms = mB.data('GET', f'/orders/{oid}/milestones')['items']
    if ok('có bộ mốc sau khi chốt', bool(ms), str(ms)):
        mB('PATCH', f'/orders/{oid}/milestones/{ms[0]["id"]}', {'status': 'done'})
        a = mB.data('GET', f'/orders/{oid}/milestones')['items'][0]['doneByName']
        b = mB.data('GET', f'/orders/{oid}')['milestones'][0]['doneByName']
        ok('chi tiết đơn và /milestones trả cùng doneByName', a == b and bool(a), f'{a!r} vs {b!r}')

    # ---------------------------------------------------------------- QA-16/17
    suite('QA-16 & QA-17 — lịch sử báo giá và giữ trường khi gửi lại')
    oid2 = mkorder(sale, DOM)['id']
    _quote(oid2, dA, mA, 26_500_000, scopeNote='Bao gồm bốc xếp 2 đầu', leadTime='3 ngày')
    _quote(oid2, dA, mA, 24_900_000)          # chỉ gửi amount

    def rowA():
        return next(x for x in sale.data('GET', f'/orders/{oid2}')['departments']
                    if x['departmentId'] == dA)

    row = rowA()
    ok('QA-17: gửi lại chỉ với amount KHÔNG xóa scopeNote',
       row['scopeNote'] == 'Bao gồm bốc xếp 2 đầu', str(row['scopeNote']))
    ok('QA-17: cũng không xóa leadTime', row['leadTime'] == '3 ngày', str(row['leadTime']))
    _quote(oid2, dA, mA, 24_000_000, scopeNote=None)
    ok('QA-17: gửi null tường minh thì XÓA được', rowA()['scopeNote'] is None,
       str(rowA()['scopeNote']))

    h = mA.data('GET', f'/orders/{oid2}/departments/{dA}/quote-history')
    amounts = [e['amount'] for e in h['history']]
    ok('QA-16: đọc lại được các bản đã bị ghi đè',
       26_500_000 in amounts and 24_900_000 in amounts, str(amounts))
    versions = [e['version'] for e in h['history']]
    ok('QA-16: lịch sử xếp theo phiên bản tăng dần', versions == sorted(versions), str(versions))
    ok('QA-16: có tên người gửi', all(e['sentByName'] for e in h['history']),
       str([e['sentByName'] for e in h['history']]))
    status_is('QA-16: phòng B KHÔNG đọc được lịch sử phòng A (báo giá kín)',
              mB('GET', f'/orders/{oid2}/departments/{dA}/quote-history')[0], 403)
    status_is('QA-16: sale tạo đơn thì đọc được',
              sale('GET', f'/orders/{oid2}/departments/{dA}/quote-history')[0], 200)

    # ---------------------------------------------------------------- QA-18
    suite('QA-18 — thông báo 409 nói rõ phải làm gì')
    _quote(oid2, dB, mB, 25_000_000)
    sale('POST', f'/orders/{oid2}/select-quote', {'departmentId': dA})
    st, p = sale('POST', f'/orders/{oid2}/select-quote', {'departmentId': dB})
    msg = p.get('error', {}).get('message', '')
    ok('chọn lại khi đã chọn -> 409 kèm hướng dẫn', st == 409 and 'điều chỉnh giá' in msg,
       f'{st} · {msg}')
    ok('không còn câu "từ X sang X"', ' sang "Chờ khách xác nhận"' not in msg, msg)

    # ---------------------------------------------------------------- QA-19
    suite('QA-19 — ba cột ghi chú riêng cho ba nghiệp vụ')
    o3 = mkorder(sale, DOM)['id']
    _quote(o3, dA, mA, 10_000_000)
    _quote(o3, dB, mB, 11_000_000)
    sale('POST', f'/orders/{o3}/select-quote', {'departmentId': dA})
    sale('POST', f'/orders/{o3}/reject',
         {'rejectReason': 'Khách chọn đối thủ', 'note': 'Khách đã ký với nhà thầu khác'})
    d3 = sale.data('GET', f'/orders/{o3}')
    ok('ghi chú từ chối vào rejectNote',
       d3['rejectNote'] == 'Khách đã ký với nhà thầu khác', str(d3['rejectNote']))
    ok('closeNote để trống khi đơn bị từ chối', d3['closeNote'] is None, str(d3['closeNote']))

    o4 = mkorder(sale, DOM)['id']
    sale('POST', f'/orders/{o4}/cancel', {'reason': 'Khách báo hoãn vô thời hạn'})
    d4 = sale.data('GET', f'/orders/{o4}')
    ok('lý do hủy vào cancelReason',
       d4['cancelReason'] == 'Khách báo hoãn vô thời hạn', str(d4['cancelReason']))

    # ---------------------------------------------------------------- QA-20/21
    suite('QA-20 & QA-21 — kiểu số trong nhật ký và nhãn kỳ doanh thu')
    close_ev = [t for t in sale.data('GET', f'/orders/{oid}/timeline')['items']
                if t['action'] == 'close']
    if ok('có bản ghi close trong nhật ký', bool(close_ev)):
        amt = close_ev[0]['detail'].get('finalAmount')
        ok('QA-20: finalAmount trong nhật ký là SỐ', isinstance(amt, (int, float)),
           f'{amt!r} ({type(amt).__name__})')
    pts = f['lead'].data('GET', '/dashboard/revenue?groupBy=month')
    if ok('có ít nhất một điểm doanh thu', bool(pts)):
        ok('QA-21: nhãn kỳ tháng rơi đúng ngày 01',
           all(x['period'].endswith('-01') for x in pts), str([x['period'] for x in pts]))

    # ---------------------------------------------------------------- QA-22
    suite('QA-22 — lát cắt theo phòng/sale chỉ cho cấp công ty')
    for dim in ('department', 'sale'):
        status_is(f'sale gọi dimension={dim} -> 403',
                  sale('GET', f'/dashboard/revenue/by?dimension={dim}')[0], 403)
        status_is(f'trưởng phòng gọi dimension={dim} -> 403',
                  mA('GET', f'/dashboard/revenue/by?dimension={dim}')[0], 403)
        status_is(f'ban lãnh đạo gọi dimension={dim} -> 200',
                  f['lead']('GET', f'/dashboard/revenue/by?dimension={dim}')[0], 200)
    status_is('sale vẫn xem được lát cắt theo dịch vụ',
              sale('GET', '/dashboard/revenue/by?dimension=service')[0], 200)

    # ---------------------------------------------------------------- QA-23
    suite('QA-23 — hộp thư phân trang')
    box = mA.data('GET', '/notifications?page=1&limit=5')
    ok('trả tối đa 5 dòng', len(box['items']) <= 5, str(len(box['items'])))
    ok('total đếm toàn bộ, không chỉ trang này', box['total'] >= len(box['items']),
       f"{box['total']} vs {len(box['items'])}")

    # ---------------------------------------------------------------- QA-25
    suite('QA-25 — trùng tên khách hàng')
    name = 'Công ty Trùng Tên Kiểm Thử'
    st1, p1 = sale('POST', '/customers', {'companyName': name})
    status_is('tạo lần đầu', st1, 201)
    st2, p2 = sale('POST', '/customers', {'companyName': '  ' + name.upper() + '  '})
    status_is('tạo lại (khác hoa thường + khoảng trắng) -> 409', st2, 409)
    ok('409 kèm id hồ sơ đang có để client dùng lại',
       p2.get('error', {}).get('details', {}).get('existingCustomerId') == p1['data']['id'],
       str(p2.get('error')))

    # ---------------------------------------------------------------- QA-11
    suite('QA-11 — updated_at được cập nhật thật')
    o5 = mkorder(sale, DOM)['id']
    before = sale.data('GET', f'/orders/{o5}')['updatedAt']
    sale('PATCH', f'/orders/{o5}', {'goodsName': 'Đổi tên hàng'})
    after = sale.data('GET', f'/orders/{o5}')['updatedAt']
    ok('updated_at đổi sau khi sửa đơn', after != before, f'{before} -> {after}')
