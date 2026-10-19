# -*- coding: utf-8 -*-
"""Máy trạng thái, quy tắc nghiệp vụ, hoàn tác vòng giá."""
from qa_lib import mkorder, ok, status_is, suite


def run(f):
    admin, sale, mA, mB = f['admin'], f['sale'], f['mA'], f['mB']
    dA, dB, DOM, CUS = f['dA'], f['dB'], f['svc']['DOM'], f['svc']['CUS']

    # ---------------------------------------------------------------
    suite('Vòng đời — chuyển trạng thái sai phải bị chặn')
    o = mkorder(sale, DOM)
    oid = o['id']
    ok('tạo đơn -> distributed', o['status'] == 'distributed', o['status'])
    status_is('chốt khi chưa báo giá', sale('POST', f'/orders/{oid}/close', {})[0], 409)
    status_is('chọn báo giá khi chưa ai báo',
              sale('POST', f'/orders/{oid}/select-quote', {'departmentId': dA})[0], 400)

    mA('POST', f'/orders/{oid}/departments/{dA}/quote', {'amount': 30_000_000})
    ok('1/2 phòng báo giá -> quoting',
       sale.data('GET', f'/orders/{oid}')['status'] == 'quoting')
    status_is('chốt khi mới ở quoting', sale('POST', f'/orders/{oid}/close', {})[0], 409)

    mB('POST', f'/orders/{oid}/departments/{dB}/quote', {'amount': 31_000_000})
    stt = sale.data('GET', f'/orders/{oid}')['status']
    ok('2/2 phòng -> awaiting_selection', stt == 'awaiting_selection', stt)

    sale('POST', f'/orders/{oid}/select-quote', {'departmentId': dA})
    d = sale.data('GET', f'/orders/{oid}')
    # Chon bao gia KHONG con doi trang thai (migration 023): don nam yen o
    # "Cho chot gia" cho toi luc chot hoac huy. Dau hieu da chon la departmentId.
    ok('chọn xong -> vẫn awaiting_selection', d['status'] == 'awaiting_selection', d['status'])
    ok('chọn xong -> đã gắn phòng phụ trách', bool(d.get('departmentName')), str(d.get('departmentName')))
    ok('chọn xong CHƯA khóa doanh thu', d['finalAmount'] is None)
    states = {r['departmentId']: r['state'] for r in d['departments']}
    ok('phòng được chọn -> won', states.get(dA) == 'won', str(states))
    ok('phòng còn lại -> lost', states.get(dB) == 'lost', str(states))
    status_is('chọn lại lần nữa', sale('POST', f'/orders/{oid}/select-quote',
              {'departmentId': dB})[0], 409)
    status_is('phòng đã lost còn báo giá được',
              mB('POST', f'/orders/{oid}/departments/{dB}/quote', {'amount': 1})[0], 400)

    # ---------------------------------------------------------------
    suite('Mở lại vòng giá phải HOÀN TÁC việc chọn')
    sale('POST', f'/orders/{oid}/request-revision',
         {'departmentIds': [dA, dB], 'reason': 'khách muốn giảm giá'})
    d = sale.data('GET', f'/orders/{oid}')
    ok('quay về quoting', d['status'] == 'quoting', d['status'])
    ok('departmentId đã xóa', d['departmentName'] is None, str(d['departmentName']))
    st2 = {r['departmentId']: r['state'] for r in d['departments']}
    ok('won/lost đã trả về quoted',
       st2.get(dA) == 'quoted' and st2.get(dB) == 'quoted', str(st2))
    ok('phòng thua cũ KHÔNG còn thấy doanh thu (vẫn null)',
       mB.data('GET', f'/orders/{oid}')['finalAmount'] is None)
    ok('ghi revision_request vào bình luận',
       any(c['kind'] == 'revision_request' for c in sale.data('GET', f'/orders/{oid}/comments')['items']))
    status_is('chốt sau khi mở lại vòng giá', sale('POST', f'/orders/{oid}/close', {})[0], 409)

    mB('POST', f'/orders/{oid}/departments/{dB}/quote', {'amount': 28_000_000})
    hist = [r for r in mB.data('GET', f'/orders/{oid}')['departments'] if r['departmentId'] == dB]
    ok('quoteVersion tăng lên 2', hist and hist[0]['quoteVersion'] == 2,
       str(hist[0]['quoteVersion'] if hist else '-'))

    sale('POST', f'/orders/{oid}/select-quote', {'departmentId': dB})
    sale('POST', f'/orders/{oid}/close', {'note': 'chốt vòng 2'})
    d = sale.data('GET', f'/orders/{oid}')
    ok('chốt -> doanh thu = giá VÒNG 2 của phòng thắng', d['finalAmount'] == 28_000_000,
       str(d['finalAmount']))
    status_is('chốt hai lần', sale('POST', f'/orders/{oid}/close', {})[0], 409)
    status_is('từ chối đơn đã chốt', sale('POST', f'/orders/{oid}/reject',
              {'rejectReason': 'Giá cao'})[0], 409)

    # ---------------------------------------------------------------
    suite('Mốc tiến độ')
    ms = sale.data('GET', f'/orders/{oid}/milestones')['items']
    ok('sinh đúng 5 mốc của DOM', len(ms) == 5, str(len(ms)))
    ok('mốc cuối là Nghiệm thu', 'Nghiệm thu' in ms[-1]['name'], ms[-1]['name'])
    status_is('nhảy cóc mốc',
              mB('PATCH', f"/orders/{oid}/milestones/{ms[2]['id']}", {'status': 'done'})[0], 400)
    status_is('bỏ qua mốc không kèm ghi chú',
              mB('PATCH', f"/orders/{oid}/milestones/{ms[0]['id']}", {'status': 'skipped'})[0], 400)
    status_is('bỏ qua mốc CUỐI (Nghiệm thu)',
              mB('PATCH', f"/orders/{oid}/milestones/{ms[-1]['id']}",
                 {'status': 'skipped', 'note': 'thôi'})[0], 400)
    status_is('phòng KHÔNG phụ trách cập nhật tiến độ',
              mA('PATCH', f"/orders/{oid}/milestones/{ms[0]['id']}", {'status': 'done'})[0], 403)
    status_is('sale cập nhật tiến độ',
              sale('PATCH', f"/orders/{oid}/milestones/{ms[0]['id']}", {'status': 'done'})[0], 403)

    other = mkorder(sale, DOM)
    # 403 cũng đạt: kiểm tra quyền chạy TRƯỚC kiểm tra tồn tại — đúng thứ tự an toàn.
    status_is('cập nhật mốc của đơn KHÁC qua id chéo',
              mB('PATCH', f"/orders/{other['id']}/milestones/{ms[0]['id']}",
                 {'status': 'done'})[0], [400, 403, 404])

    mB('PATCH', f"/orders/{oid}/milestones/{ms[0]['id']}", {'status': 'done'})
    # Tick moc KHONG con doi trang thai don. Don chot roi thi dung o 'closed'.
    ok('mốc đầu KHÔNG đổi trạng thái đơn',
       sale.data('GET', f'/orders/{oid}')['status'] == 'closed')
    mB('PATCH', f"/orders/{oid}/milestones/{ms[1]['id']}",
       {'status': 'skipped', 'note': 'không áp dụng'})
    for m in ms[2:]:
        mB('PATCH', f"/orders/{oid}/milestones/{m['id']}", {'status': 'done'})
    d_done = sale.data('GET', f'/orders/{oid}')
    ok('hết mốc vẫn ở closed', d_done['status'] == 'closed', d_done['status'])
    # Nhung completedAt PHAI duoc ghi: bo loc "theo ngay hoan thanh" doc cot nay.
    ok('hết mốc -> ghi completedAt', d_done.get('completedAt') is not None,
       str(d_done.get('completedAt')))
    # 'closed' van huy duoc — don da chot van co the do be sau do.
    # Huy sau cung, khong thi cac kiem tra moc ben duoi chay tren don da huy.
    status_is('hủy đơn đã chốt vẫn được',
              sale('POST', f'/orders/{oid}/cancel', {'reason': 'muộn rồi'})[0], 201)

    # ---------------------------------------------------------------
    suite('Từ chối vs Hủy — hai thứ khác nhau')
    r1 = mkorder(sale, DOM)
    mA('POST', f"/orders/{r1['id']}/departments/{dA}/quote", {'amount': 9_000_000})
    status_is('từ chối ngay ở quoting (khách nói không qua điện thoại)',
              sale('POST', f"/orders/{r1['id']}/reject",
                   {'rejectReason': 'Khách chọn đối thủ'})[0], 201)
    # Khong con trang thai 'rejected' rieng — khach che gia cung ve 'cancelled'.
    d_r = sale.data('GET', f"/orders/{r1['id']}")
    ok('-> cancelled', d_r['status'] == 'cancelled', d_r['status'])
    ok('lý do khách từ chối được giữ', bool(d_r.get('rejectReason')), str(d_r.get('rejectReason')))
    status_is('lý do từ chối ngoài danh mục',
              sale('POST', f"/orders/{mkorder(sale, DOM)['id']}/reject",
                   {'rejectReason': 'tôi tự nghĩ ra'})[0], 400)

    c1 = mkorder(sale, DOM)
    status_is('hủy không kèm lý do', sale('POST', f"/orders/{c1['id']}/cancel", {})[0], 400)
    sale('POST', f"/orders/{c1['id']}/cancel", {'reason': 'nhập trùng'})
    ok('-> cancelled', sale.data('GET', f"/orders/{c1['id']}")['status'] == 'cancelled')

    # Mau so gio la "don da ra toi ban dam phan": thang + huy MA DA CO bao gia.
    # r1 co bao gia roi moi bi tu choi -> vao mau so. c1 huy khi chua ai bao gia
    # -> nam ngoai. Dung dung nghia cu, chi doi dau hieu nhan biet.
    wr = admin.data('GET', '/dashboard/win-rate')
    ok('đơn huỷ SAU khi đã báo giá vào mẫu số', wr['rejected'] >= 1, str(wr))
    ok('mẫu số = thắng + huỷ-đã-báo-giá', wr['decided'] == wr['won'] + wr['rejected'], str(wr))

    # ---------------------------------------------------------------
    suite('Bỏ qua & bế tắc')
    p1 = mkorder(sale, DOM)
    pid = p1['id']
    status_is('bỏ qua không kèm lý do',
              mA('POST', f'/orders/{pid}/departments/{dA}/pass', {})[0], 400)
    mA('POST', f'/orders/{pid}/departments/{dA}/pass', {'reason': 'quá tải'})
    mB('POST', f'/orders/{pid}/departments/{dB}/pass', {'reason': 'không có xe'})
    d = sale.data('GET', f'/orders/{pid}')
    ok('MỌI phòng bỏ qua -> KHÔNG nhảy sang awaiting_selection',
       d['status'] == 'distributed', d['status'])
    notes = admin.data('GET', '/notifications')['items']
    ok('có thông báo all_passed cho Admin',
       any(n['type'] == 'all_passed' and n['orderId'] == pid for n in notes),
       str([n['type'] for n in notes[:5]]))
    status_is('chọn báo giá khi mọi phòng đã bỏ qua',
              sale('POST', f'/orders/{pid}/select-quote', {'departmentId': dA})[0], 400)

    admin('POST', f'/orders/{pid}/departments', {'departmentId': f['dC']})
    ok('Admin thêm phòng ngoài cấu hình -> vẫn distributed',
       sale.data('GET', f'/orders/{pid}')['status'] == 'distributed')
    status_is('thêm trùng phòng đã có',
              admin('POST', f'/orders/{pid}/departments', {'departmentId': dA})[0], 400)

    # ---------------------------------------------------------------
    suite('Đơn chưa định tuyến')
    # LIF chứ không phải PRJ: từ migration 047, PRJ mang bốn dịch vụ con FCL/LCL
    # nên tạo đơn PRJ mà bỏ trống dịch vụ con sẽ bị từ chối. Phép thử này nói về
    # dịch vụ KHÔNG phòng nào phụ trách, không nói về dịch vụ con.
    u = mkorder(sale, f['svc']['LIF'])   # LIF không phòng nào phụ trách
    ok('dịch vụ mồ côi -> trạng thái new', u['status'] == 'new', u['status'])
    ok('không phòng nào được phân phối', len(u['departments']) == 0)
    ok('vào hàng đợi Chưa định tuyến của Admin',
       any(x['id'] == u['id'] for x in admin.data('GET', '/orders/unrouted')['items']))
    admin('POST', f"/orders/{u['id']}/departments", {'departmentId': dA})
    ok('Admin gán phòng -> distributed',
       sale.data('GET', f"/orders/{u['id']}")['status'] == 'distributed')

    # ---------------------------------------------------------------
    suite('Sửa đơn sau khi chốt')
    status_is('sửa đơn đã chốt KHÔNG kèm ghi chú',
              sale('PATCH', f'/orders/{oid}', {'goodsName': 'đổi hàng'})[0], 400)
    status_is('sửa đơn đã chốt CÓ ghi chú',
              sale('PATCH', f'/orders/{oid}',
                   {'goodsName': 'đổi hàng', 'changeNote': 'khách đổi mặt hàng'})[0], 200)
    tl = sale.data('GET', f'/orders/{oid}/timeline')['items']
    ok('lưu vết vào timeline', any(t['action'] == 'update' for t in tl),
       str([t['action'] for t in tl]))
    ok('doanh thu KHÔNG đổi khi sửa đơn',
       sale.data('GET', f'/orders/{oid}')['finalAmount'] == 28_000_000)
