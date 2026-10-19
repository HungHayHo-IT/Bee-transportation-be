/**
 * Template email OTP — HTML dựng bằng bảng cho tương thích với Outlook/Gmail,
 * inline CSS vì client email lột bỏ <style>, độ rộng tối đa 600px cho mobile.
 * Đăng ký / đặt lại PIN / đổi email dùng chung một shell, chỉ tiêu đề+mô tả khác.
 */

const PURPOSE_HEADINGS: Record<string, { title: string; lead: string }> = {
  register: {
    title: 'Xác thực đăng ký tài khoản',
    lead: 'Dùng mã bên dưới để hoàn tất đăng ký tài khoản BeeOps của bạn.',
  },
  reset_pin: {
    title: 'Đặt lại mã PIN',
    lead: 'Dùng mã bên dưới để đặt lại mã PIN của bạn.',
  },
  change_email: {
    title: 'Xác thực email mới',
    lead: 'Dùng mã bên dưới để xác thực địa chỉ email mới cho tài khoản BeeOps.',
  },
  /* Ký phiếu xác nhận đơn. Thiếu dòng này thì rơi về bản 'register' và khách
     đang ký đơn lại đọc "Xác thực đăng ký tài khoản" — một câu nói sai việc
     đúng vào lúc người ta đang phân vân có nên tin đường dẫn này không. */
  sign_order: {
    title: 'Xác nhận ký phiếu đơn hàng',
    lead: 'Dùng mã bên dưới để xác nhận bạn đồng ý ký phiếu xác nhận đơn hàng.',
  },
};

export interface OtpEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderOtpEmail(code: string, purpose: string): OtpEmail {
  const heading = PURPOSE_HEADINGS[purpose] ?? PURPOSE_HEADINGS.register;
  const subject = `${heading.title} · Mã ${code}`;

  const html = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${heading.title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1c2434;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.06);">
            <tr>
              <td style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:28px 32px;text-align:left;">
                <div style="display:inline-block;background:#ffffff;color:#f97316;width:36px;height:36px;line-height:36px;text-align:center;border-radius:10px;font-weight:800;font-size:18px;letter-spacing:.5px;">B</div>
                <span style="color:#ffffff;font-weight:700;font-size:18px;letter-spacing:.5px;margin-left:10px;vertical-align:middle;">BeeOps</span>
                <span style="color:rgba(255,255,255,.85);font-size:13px;margin-left:8px;vertical-align:middle;">Bee Transportation</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px 8px;">
                <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">${heading.title}</h1>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">${heading.lead}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
                  <tr>
                    <td style="padding:20px 24px;text-align:center;">
                      <div style="font-size:12px;letter-spacing:.15em;color:#9a3412;text-transform:uppercase;font-weight:600;">Mã xác thực</div>
                      <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:36px;letter-spacing:12px;color:#c2410c;font-weight:700;margin-top:8px;">${code}</div>
                      <div style="font-size:12px;color:#9a3412;margin-top:6px;">Có hiệu lực trong 5 phút</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px 0;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
                  <b style="color:#0f172a;">Không chia sẻ mã này</b> với bất kỳ ai. Nhân viên BeeOps sẽ
                  <b>không bao giờ</b> hỏi mã xác thực qua điện thoại hay tin nhắn.
                </p>
                <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
                  Nếu bạn không thực hiện yêu cầu này, có thể bỏ qua email — mã sẽ tự hết hạn.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 40px 32px;">
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:12px;color:#94a3b8;line-height:1.7;">
                      <b style="color:#64748b;">Bee Transportation Corporation</b><br>
                      TTC Tower, 253 Hoàng Văn Thụ, Phường Tân Sơn Hoà, TP. Hồ Chí Minh<br>
                      Hotline: (+84) 886 440 449 · Email:
                      <a href="mailto:info@beetransportation.vn" style="color:#f97316;text-decoration:none;">info@beetransportation.vn</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">
            Email này được gửi tự động, vui lòng không trả lời trực tiếp.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  // Fallback plain-text cho client không đọc được HTML.
  const text = [
    heading.title,
    '',
    heading.lead,
    '',
    `Mã xác thực: ${code}`,
    'Có hiệu lực trong 5 phút.',
    '',
    'Không chia sẻ mã này với bất kỳ ai. Nhân viên BeeOps sẽ không bao giờ',
    'hỏi mã xác thực qua điện thoại hay tin nhắn.',
    '',
    'Nếu bạn không thực hiện yêu cầu này, có thể bỏ qua email này.',
    '',
    'Bee Transportation Corporation',
    'Hotline: (+84) 886 440 449 · info@beetransportation.vn',
  ].join('\n');

  return { subject, html, text };
}
