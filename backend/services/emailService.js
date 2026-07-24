const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ─── Transporter (fresh every call — never cache on cloud platforms) ──────────
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn('[email] SMTP env vars missing — emails will be skipped.');
    console.warn(`[email]   SMTP_HOST=${host || '(unset)'} SMTP_USER=${user || '(unset)'} SMTP_PASS=${pass ? '(set)' : '(unset)'}`);
    return null;
  }
  return nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 30000,
    greetingTimeout:   30000,
    socketTimeout:     30000,
  });
}

// ─── Verify SMTP connection on startup — logs success/failure clearly ────────
;(async () => {
  const t = getTransporter();
  if (!t) return;
  try {
    await t.verify();
    console.log('✅ [email] SMTP connection verified — ready to send emails');
  } catch (err) {
    console.error('❌ [email] SMTP connection FAILED:', err.message);
    console.error('[email] Check SMTP_HOST / SMTP_USER / SMTP_PASS in your .env');
    console.error('[email] For Gmail: make sure you are using an App Password, not your account password.');
    console.error('[email]   Generate one at: https://myaccount.google.com/apppasswords');
  }
})();

// ─── Training type labels ─────────────────────────────────────────────────────
const TRAINING_LABELS = {
  FDI: 'Flight Dispatch Initial',
  FDR: 'Flight Dispatch Recurrent',
  FDA: 'Flight Dispatch Advanced',
  FTL: 'Flight Time Limitations',
  NDG: 'Dangerous Goods No-Carry',
  HF:  'Human Factors for OCC',
  GD:  'Ground Operations',
  TCD: 'Training Competencies Development',
};

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// ─── IFOA Logo — dynamically read from disk and encoded as base64 ──────────
function getLogoBase64() {
  try {
    const logoPath = path.join(__dirname, '..', 'assets', 'logo.png');
    return fs.readFileSync(logoPath).toString('base64');
  } catch (err) {
    console.warn('[email] Could not read logo file:', err.message);
    return null;
  }
}

// Build logo attachment only if logo file is available
function logoAttachment() {
  const b64 = getLogoBase64();
  if (!b64) return [];
  return [{
    filename:           'ifoa_logo.png',
    content:            Buffer.from(b64, 'base64'),
    cid:                'ifoa_logo',
    contentDisposition: 'inline',
    contentType:        'image/png',
  }];
}


// ─── Build confirmation HTML ──────────────────────────────────────────────────
function buildConfirmationHtml({ airlineName, contactName, participants, trainingType, trainingDate, endDate, submittedAt }) {
  const count     = participants.length;
  const typeLabel = TRAINING_LABELS[trainingType] || trainingType;
  const startFmt  = fmtDate(trainingDate);
  const endFmt    = endDate ? fmtDate(endDate) : null;
  const subFmt    = new Date(submittedAt).toLocaleString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const rows = participants.map((p, i) => `
    <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#ffffff'}">
      <td style="padding:10px 20px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb">${i + 1}</td>
      <td style="padding:10px 20px;font-size:13px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb">${p.first_name} ${p.last_name}</td>
      <td style="padding:10px 20px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">${p.department || '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Submission Confirmed – IFOA</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Helvetica,Arial,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10)">

      <!-- ═══════ HEADER ═══════ -->
      <tr>
        <td bgcolor="#0c1a2e" style="background:#0c1a2e;padding:28px 40px 24px;text-align:center">
          <!-- Logo — full available width -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" bgcolor="#ffffff" style="background:#ffffff;border-radius:12px;padding:16px 20px;margin-bottom:16px">
                <img src="cid:ifoa_logo" width="460" alt="IFOA" style="display:block;border:0;width:460px;max-width:100%;height:auto"/>
              </td>
            </tr>
          </table>
          <!-- Spacer -->
          <div style="height:16px"></div>
          <!-- Divider -->
          <div style="width:40px;height:2px;background:#16a34a;margin:0 auto 14px"></div>
          <!-- Title -->
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#94a3b8">International Flight Operations Academy</p>
          <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:0.3px">Enrollment Confirmed</p>
        </td>
      </tr>

      <!-- ═══════ GREEN ACCENT BAR ═══════ -->
      <tr>
        <td style="background:linear-gradient(90deg,#16a34a,#22c55e);height:4px;font-size:0;line-height:0">&nbsp;</td>
      </tr>

      <!-- ═══════ GREETING ═══════ -->
      <tr>
        <td style="padding:36px 40px 0">
          <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827">
            Dear ${contactName || airlineName},
          </p>
          <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.7">
            We have successfully received the training enrollment for <strong style="color:#111827">${airlineName}</strong>.
            Your submission of <strong style="color:#111827">${count} participant${count !== 1 ? 's' : ''}</strong>
            has been recorded and is now under review by the IFOA administration team.
          </p>
        </td>
      </tr>

      <!-- ═══════ SUMMARY CARD ═══════ -->
      <tr>
        <td style="padding:24px 40px 0">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
            <tr>
              <td style="background:#1e293b;padding:12px 20px">
                <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#94a3b8">Submission Summary</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:7px 0;font-size:13px;color:#6b7280;width:42%;font-weight:500">Training Type</td>
                    <td style="padding:7px 0;font-size:13px;color:#111827;font-weight:700">${trainingType} &nbsp;—&nbsp; ${typeLabel}</td>
                  </tr>
                  <tr>
                    <td style="padding:7px 0;font-size:13px;color:#6b7280;font-weight:500;border-top:1px solid #f1f5f9">Start Date</td>
                    <td style="padding:7px 0;font-size:13px;color:#111827;font-weight:600;border-top:1px solid #f1f5f9">${startFmt}</td>
                  </tr>
                  ${endFmt ? `<tr>
                    <td style="padding:7px 0;font-size:13px;color:#6b7280;font-weight:500;border-top:1px solid #f1f5f9">End Date</td>
                    <td style="padding:7px 0;font-size:13px;color:#111827;font-weight:600;border-top:1px solid #f1f5f9">${endFmt}</td>
                  </tr>` : ''}
                  <tr>
                    <td style="padding:7px 0;font-size:13px;color:#6b7280;font-weight:500;border-top:1px solid #f1f5f9">Participants</td>
                    <td style="padding:7px 0;border-top:1px solid #f1f5f9">
                      <span style="display:inline-block;background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;border:1px solid #bbf7d0">${count} Enrolled</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:7px 0;font-size:13px;color:#6b7280;font-weight:500;border-top:1px solid #f1f5f9">Submitted At</td>
                    <td style="padding:7px 0;font-size:13px;color:#374151;border-top:1px solid #f1f5f9">${subFmt}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- ═══════ PARTICIPANTS TABLE ═══════ -->
      <tr>
        <td style="padding:24px 40px 0">
          <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#374151">
            Enrolled Participants &nbsp;(${count})
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
            <thead>
              <tr style="background:#1e293b">
                <th style="padding:10px 20px;font-size:10px;font-weight:700;color:#94a3b8;text-align:left;letter-spacing:1.5px;text-transform:uppercase;width:36px">#</th>
                <th style="padding:10px 20px;font-size:10px;font-weight:700;color:#94a3b8;text-align:left;letter-spacing:1.5px;text-transform:uppercase">Full Name</th>
                <th style="padding:10px 20px;font-size:10px;font-weight:700;color:#94a3b8;text-align:left;letter-spacing:1.5px;text-transform:uppercase">Department</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </td>
      </tr>

      <!-- ═══════ WHAT HAPPENS NEXT ═══════ -->
      <tr>
        <td style="padding:24px 40px 0">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;overflow:hidden">
            <tr>
              <td style="padding:5px 0 0 20px;vertical-align:top;width:30px">
                <p style="margin:12px 0 0;font-size:18px">ℹ️</p>
              </td>
              <td style="padding:14px 20px 14px 8px">
                <p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#1d4ed8">What Happens Next?</p>
                <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.7">
                  Your records are now under review by the IFOA team. Certificates will be issued once
                  the training has been verified. All submitted records are locked — only IFOA
                  administrators can make changes.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- ═══════ FOOTER ═══════ -->
      <tr>
        <td style="padding:28px 40px 32px">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">
            Thank you for choosing IFOA for your training needs. If you have any questions,
            please contact us at
            <a href="mailto:${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}" style="color:#2563eb;text-decoration:none;font-weight:600">${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}</a>.
          </p>
          <p style="margin:12px 0 0;font-size:13px;color:#374151">
            Best regards,<br/>
            <strong style="color:#111827">IFOA Administration Team</strong><br/>
            <span style="color:#6b7280;font-size:12px">International Flight Operations Academy</span>
          </p>
        </td>
      </tr>

      <!-- ═══════ BOTTOM BAR ═══════ -->
      <tr>
        <td bgcolor="#0c1a2e" style="background:#0c1a2e;padding:16px 40px">
          <p style="margin:0;font-size:11px;color:#64748b;text-align:center">
            This is an automated email — please do not reply directly. &nbsp;|&nbsp;
            &copy; ${new Date().getFullYear()} International Flight Operations Academy
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>

</body>
</html>`;
}

// ─── Plain-text fallback ──────────────────────────────────────────────────────
function buildConfirmationText({ airlineName, contactName, participants, trainingType, trainingDate, endDate }) {
  const typeLabel = TRAINING_LABELS[trainingType] || trainingType;
  return [
    'IFOA - Enrollment Confirmation',
    '================================',
    '',
    `Dear ${contactName || airlineName},`,
    '',
    `Training enrollment for ${airlineName} has been confirmed.`,
    '',
    `Training Type : ${trainingType} - ${typeLabel}`,
    `Start Date    : ${fmtDate(trainingDate)}`,
    endDate ? `End Date      : ${fmtDate(endDate)}` : null,
    `Participants  : ${participants.length}`,
    '',
    'Enrolled Participants:',
    ...participants.map((p, i) => `  ${i + 1}. ${p.first_name} ${p.last_name} (${p.department || '—'})`),
    '',
    'Records are under review. Certificates will be issued after verification.',
    '',
    'Best regards,',
    'IFOA Administration Team',
    'International Flight Operations Academy',
  ].filter(Boolean).join('\n');
}

// ─── Send submission confirmation ────────────────────────────────────────────
async function sendSubmissionConfirmation(opts) {
  const transporter = getTransporter();
  if (!transporter) return;

  const { toEmail, airlineName, contactName, participants, trainingType, trainingDate, endDate } = opts;
  const count     = participants.length;
  const typeLabel = TRAINING_LABELS[trainingType] || trainingType;
  const payload   = { airlineName, contactName, participants, trainingType, trainingDate, endDate, submittedAt: new Date() };

  try {
    const info = await transporter.sendMail({
      from:    `"IFOA – International Flight Operations Academy" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to:      toEmail,
      subject: `Enrollment Confirmed: ${count} Participant${count !== 1 ? 's' : ''} – ${trainingType} (${typeLabel})`,
      text:    buildConfirmationText(payload),
      html:    buildConfirmationHtml(payload),
      attachments: logoAttachment(),
    });
    console.log(`[email] Confirmation sent to ${toEmail} — messageId: ${info.messageId}`);
  } catch (err) {
    console.error(`[email] FAILED to ${toEmail}:`, err.message, '| code:', err.code || 'none');
  }
}

// ─── Send password reset email ────────────────────────────────────────────────
async function sendPasswordResetEmail({ toEmail, airlineName, resetUrl }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[email] SMTP not configured — password reset skipped.');
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Password Reset – IFOA</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Helvetica,Arial,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10)">

      <!-- ═══════ HEADER ═══════ -->
      <tr>
        <td bgcolor="#0c1a2e" style="background:#0c1a2e;padding:28px 40px 24px;text-align:center">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" bgcolor="#ffffff" style="background:#ffffff;border-radius:12px;padding:16px 20px">
                <img src="cid:ifoa_logo" width="460" alt="IFOA" style="display:block;border:0;width:460px;max-width:100%;height:auto"/>
              </td>
            </tr>
          </table>
          <div style="height:16px"></div>
          <div style="width:40px;height:2px;background:#dc2626;margin:0 auto 14px"></div>
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#94a3b8">International Flight Operations Academy</p>
          <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff">Password Reset Request</p>
        </td>
      </tr>

      <!-- Accent bar -->
      <tr>
        <td style="background:linear-gradient(90deg,#dc2626,#ef4444);height:4px;font-size:0;line-height:0">&nbsp;</td>
      </tr>

      <!-- ═══════ BODY ═══════ -->
      <tr>
        <td style="padding:36px 40px 0">
          <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827">Dear ${airlineName},</p>
          <p style="margin:0 0 24px;font-size:14px;color:#4b5563;line-height:1.7">
            We received a request to reset the password for your IFOA Airline Portal account.
            Click the button below to choose a new password. This link is valid for
            <strong style="color:#111827">1 hour</strong>.
          </p>

          <!-- CTA Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px">
            <tr>
              <td style="background:#1d4ed8;border-radius:10px;text-align:center">
                <a href="${resetUrl}"
                  style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px">
                  Reset My Password
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 6px;font-size:13px;color:#6b7280">If the button doesn't work, copy and paste this link:</p>
          <p style="margin:0 0 24px;font-size:12px;color:#2563eb;word-break:break-all;line-height:1.6">${resetUrl}</p>

          <!-- Warning box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;margin-bottom:8px">
            <tr>
              <td style="padding:14px 18px">
                <p style="margin:0;font-size:13px;color:#854d0e;line-height:1.6">
                  ⚠️ &nbsp;If you did not request a password reset, please ignore this email.
                  Your password will remain unchanged and no action is required.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- ═══════ FOOTER ═══════ -->
      <tr>
        <td style="padding:28px 40px 32px">
          <p style="margin:0;font-size:13px;color:#374151;line-height:1.7">
            Best regards,<br/>
            <strong style="color:#111827">IFOA Security Team</strong><br/>
            <span style="font-size:12px;color:#6b7280">International Flight Operations Academy</span>
          </p>
        </td>
      </tr>

      <!-- Bottom bar -->
      <tr>
        <td bgcolor="#0c1a2e" style="background:#0c1a2e;padding:16px 40px">
          <p style="margin:0;font-size:11px;color:#64748b;text-align:center">
            This is an automated security email — do not reply. &nbsp;|&nbsp;
            &copy; ${new Date().getFullYear()} International Flight Operations Academy
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>

</body>
</html>`;

  const text = `IFOA – Password Reset\n\nDear ${airlineName},\n\nReset your password using this link (valid 1 hour):\n${resetUrl}\n\nIf you did not request this, ignore this email.\n\nIFOA Security Team\nInternational Flight Operations Academy`;

  try {
    const info = await transporter.sendMail({
      from:    `"IFOA – International Flight Operations Academy" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to:      toEmail,
      subject: 'Reset Your IFOA Airline Portal Password',
      text,
      html,
      attachments: logoAttachment(),
    });
    console.log(`[email] Password reset sent to ${toEmail} — messageId: ${info.messageId}`);
  } catch (err) {
    console.error(`[email] FAILED password reset to ${toEmail}:`, err.message, '| code:', err.code || 'none');
  }
}

// ─── Send OTP verification email ────────────────────────────────────────────────
async function sendOtpEmail({ toEmail, airlineName, otp }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[email] SMTP not configured — OTP email skipped.');
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Verify Your Email – IFOA</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10)">
      <tr>
        <td bgcolor="#0c1a2e" style="background:#0c1a2e;padding:28px 40px 24px;text-align:center">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" bgcolor="#ffffff" style="background:#ffffff;border-radius:12px;padding:16px 20px">
                <img src="cid:ifoa_logo" width="460" alt="IFOA" style="display:block;border:0;width:460px;max-width:100%;height:auto"/>
              </td>
            </tr>
          </table>
          <div style="height:16px"></div>
          <div style="width:40px;height:2px;background:#2563eb;margin:0 auto 14px"></div>
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#94a3b8">International Flight Operations Academy</p>
          <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff">Verify Your Email</p>
        </td>
      </tr>
      <tr><td style="background:linear-gradient(90deg,#2563eb,#3b82f6);height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
      <tr>
        <td style="padding:36px 40px 0">
          <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827">Dear ${airlineName},</p>
          <p style="margin:0 0 28px;font-size:14px;color:#4b5563;line-height:1.7">
            Use the one-time code below to verify your email address.
            This code is valid for <strong style="color:#111827">10 minutes</strong> only.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px">
            <tr>
              <td style="background:#eff6ff;border:2px solid #bfdbfe;border-radius:16px;padding:20px 48px;text-align:center">
                <p style="margin:0;font-size:40px;font-weight:900;color:#1d4ed8;letter-spacing:12px;font-family:monospace">${otp}</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;margin-bottom:8px">
            <tr><td style="padding:14px 18px">
              <p style="margin:0;font-size:13px;color:#854d0e;line-height:1.6">
                ⚠️ &nbsp;Do not share this code with anyone.
                If you didn’t request this, please ignore this email.
              </p>
            </td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 40px 32px">
          <p style="margin:0;font-size:13px;color:#374151;line-height:1.7">
            Best regards,<br/>
            <strong style="color:#111827">IFOA Administration Team</strong><br/>
            <span style="font-size:12px;color:#6b7280">International Flight Operations Academy</span>
          </p>
        </td>
      </tr>
      <tr>
        <td bgcolor="#0c1a2e" style="background:#0c1a2e;padding:16px 40px">
          <p style="margin:0;font-size:11px;color:#64748b;text-align:center">
            This is an automated email — please do not reply. &nbsp;|&nbsp;
            &copy; ${new Date().getFullYear()} International Flight Operations Academy
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  try {
    const info = await transporter.sendMail({
      from:    `"IFOA – International Flight Operations Academy" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to:      toEmail,
      subject: `${otp} — Your IFOA Email Verification Code`,
      text:    `Your IFOA verification code is: ${otp}\nValid for 10 minutes. Do not share this code.`,
      html,
      attachments: logoAttachment(),
    });
    console.log(`[email] OTP sent to ${toEmail} — messageId: ${info.messageId}`);
  } catch (err) {
    console.error(`[email] FAILED OTP to ${toEmail}:`, err.message);
    throw err; // let caller handle
  }
}

// ─── Send contract email (with PDF attachment) ───────────────────────────────
async function sendContractEmail({ toEmail, clientName, pdfBuffer, message }) {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured — cannot send contract.');

  const safeName   = (clientName || 'Client').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Client';
  const customNote = (message && message.trim()) ? message.trim().replace(/\n/g, '<br/>') : null;
  const year       = new Date().getFullYear();
  const dateStr    = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const contactEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Services Agreement – ${safeName}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Helvetica,Arial,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 40px rgba(0,0,0,0.12)">

  <!-- ══════ HEADER ══════ -->
  <tr>
    <td bgcolor="#0c1a2e" style="background:#0c1a2e;padding:30px 44px 26px;text-align:center">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" bgcolor="#ffffff" style="background:#ffffff;border-radius:12px;padding:16px 20px">
            <img src="cid:ifoa_logo" width="460" alt="International Flight Operations Academy" style="display:block;border:0;width:460px;max-width:100%;height:auto"/>
          </td>
        </tr>
      </table>
      <div style="height:18px"></div>
      <div style="width:48px;height:3px;background:#d97706;border-radius:2px;margin:0 auto 14px"></div>
      <p style="margin:0 0 5px;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#94a3b8">International Flight Operations Academy GmbH</p>
      <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:0.2px">Services Agreement</p>
      <p style="margin:6px 0 0;font-size:12px;color:#64748b">${dateStr}</p>
    </td>
  </tr>

  <!-- Accent bar -->
  <tr>
    <td style="background:linear-gradient(90deg,#d97706,#f59e0b,#d97706);height:4px;font-size:0;line-height:0">&nbsp;</td>
  </tr>

  <!-- ══════ INTRO ══════ -->
  <tr>
    <td style="padding:38px 44px 0">
      <p style="margin:0 0 10px;font-size:17px;font-weight:700;color:#0f172a">Dear ${safeName},</p>
      <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.8">
        We are pleased to share the <strong style="color:#0f172a">Services Agreement</strong> between
        <strong style="color:#0f172a">${safeName}</strong> and
        <strong style="color:#0f172a">International Flight Operations Academy GmbH</strong> (IFOA),
        outlining the terms and conditions for the training services to be provided.
      </p>
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.8">
        Please find the complete agreement attached to this email as a PDF document.
        We kindly request that you read through the agreement carefully and proceed with the steps below.
      </p>
      ${customNote ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;margin-top:20px">
        <tr><td style="padding:14px 18px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#92400e">Note from IFOA</p>
          <p style="margin:0;font-size:13px;color:#78350f;line-height:1.7">${customNote}</p>
        </td></tr>
      </table>` : ''}
    </td>
  </tr>

  <!-- ══════ ACTION STEPS ══════ -->
  <tr>
    <td style="padding:28px 44px 0">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#475569">Required Actions</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">

        <!-- Step 1 -->
        <tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:16px 20px;width:56px;vertical-align:top">
            <div style="width:32px;height:32px;background:#0c1a2e;border-radius:50%;text-align:center;line-height:32px">
              <span style="font-size:13px;font-weight:800;color:#ffffff">1</span>
            </div>
          </td>
          <td style="padding:16px 20px 16px 0;border-top:none">
            <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#0f172a">Review the Agreement</p>
            <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6">Open the attached PDF and read through all terms and conditions carefully before proceeding.</p>
          </td>
        </tr>

        <!-- Step 2 -->
        <tr style="border-bottom:1px solid #e2e8f0;background:#f8fafc">
          <td style="padding:16px 20px;width:56px;vertical-align:top">
            <div style="width:32px;height:32px;background:#0c1a2e;border-radius:50%;text-align:center;line-height:32px">
              <span style="font-size:13px;font-weight:800;color:#ffffff">2</span>
            </div>
          </td>
          <td style="padding:16px 20px 16px 0">
            <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#0f172a">Sign the Agreement</p>
            <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6">Sign the agreement on the designated signature page by the authorised representative of ${safeName}.</p>
          </td>
        </tr>

        <!-- Step 3 -->
        <tr>
          <td style="padding:16px 20px;width:56px;vertical-align:top">
            <div style="width:32px;height:32px;background:#d97706;border-radius:50%;text-align:center;line-height:32px">
              <span style="font-size:13px;font-weight:800;color:#ffffff">3</span>
            </div>
          </td>
          <td style="padding:16px 20px 16px 0">
            <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#0f172a">Return a Signed Copy</p>
            <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6">
              Please return the signed agreement at your earliest convenience by replying to this email or sending to
              <a href="mailto:${contactEmail}" style="color:#d97706;text-decoration:none;font-weight:600">${contactEmail}</a>.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>

  <!-- ══════ ATTACHMENT CALLOUT ══════ -->
  <tr>
    <td style="padding:24px 44px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px">
        <tr>
          <td style="padding:14px 18px">
            <p style="margin:0;font-size:13px;color:#166534;line-height:1.6;font-weight:600">
              Attachment: &nbsp;Services_Agreement_${safeName.replace(/\s+/g, '_')}.pdf
            </p>
            <p style="margin:4px 0 0;font-size:12px;color:#15803d;line-height:1.5">
              This document contains all the terms, conditions, fees, and service details agreed upon between the parties.
              Please retain a copy for your records once signed.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ══════ CONTACT / QUESTIONS ══════ -->
  <tr>
    <td style="padding:24px 44px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
        <tr>
          <td style="padding:16px 20px">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#475569">Questions or Clarifications?</p>
            <p style="margin:0;font-size:13px;color:#334155;line-height:1.7">
              If you have any questions regarding the terms of this agreement or require any amendments,
              please do not hesitate to contact our team at
              <a href="mailto:${contactEmail}" style="color:#1d4ed8;text-decoration:none;font-weight:600">${contactEmail}</a>.
              We are happy to assist you.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ══════ SIGN-OFF ══════ -->
  <tr>
    <td style="padding:30px 44px 36px">
      <p style="margin:0 0 4px;font-size:14px;color:#334155;line-height:1.7">
        We look forward to a successful partnership and to providing world-class Flight Operations training to your team.
      </p>
      <p style="margin:18px 0 0;font-size:14px;color:#334155">
        Yours sincerely,
      </p>
      <p style="margin:6px 0 0;font-size:14px;line-height:1.7">
        <strong style="color:#0f172a;font-size:15px">IFOA Administration Team</strong><br/>
        <span style="color:#64748b;font-size:12px">International Flight Operations Academy GmbH</span><br/>
        <span style="color:#64748b;font-size:12px">Oberdorf 26, 4314 Zeiningen, Switzerland</span><br/>
        <a href="mailto:${contactEmail}" style="color:#d97706;font-size:12px;text-decoration:none">${contactEmail}</a>
      </p>
    </td>
  </tr>

  <!-- ══════ FOOTER ══════ -->
  <tr>
    <td bgcolor="#0c1a2e" style="background:#0c1a2e;padding:18px 44px">
      <p style="margin:0;font-size:11px;color:#475569;text-align:center;line-height:1.7">
        This email and its attachments are confidential and intended solely for the use of the named recipient.<br/>
        &copy; ${year} International Flight Operations Academy GmbH &nbsp;·&nbsp; All rights reserved
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>`;

  const text = [
    `Dear ${safeName},`,
    '',
    `Please find attached the Services Agreement between ${safeName} and International Flight Operations Academy GmbH (IFOA).`,
    '',
    'REQUIRED ACTIONS:',
    '  1. Review — Read through all terms and conditions in the attached PDF carefully.',
    '  2. Sign   — Sign the agreement on the designated signature page.',
    `  3. Return — Reply to this email with the signed copy, or send to ${contactEmail}.`,
    '',
    customNote ? `Note from IFOA: ${customNote.replace(/<br\/>/g, '\n')}\n` : '',
    `Attachment: Services_Agreement_${safeName.replace(/\s+/g, '_')}.pdf`,
    '',
    'If you have any questions, please contact us at ' + contactEmail,
    '',
    'Yours sincerely,',
    'IFOA Administration Team',
    'International Flight Operations Academy GmbH',
    'Oberdorf 26, 4314 Zeiningen, Switzerland',
  ].filter(s => s !== null).join('\n');

  const info = await transporter.sendMail({
    from:    `"IFOA – International Flight Operations Academy" <${contactEmail}>`,
    to:      toEmail,
    subject: `Services Agreement – ${safeName} | Action Required`,
    text,
    html,
    attachments: [
      ...logoAttachment(),
      {
        filename:    `Services_Agreement_${safeName.replace(/\s+/g, '_')}.pdf`,
        content:     pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
  console.log(`[email] Contract sent to ${toEmail} — messageId: ${info.messageId}`);
  return info;
}

// ─── Send exam invitation email (passwordless take link) ──────────────────────
async function sendExamInviteEmail({ toEmail, participantName, examTitle, durationMinutes, maxAttempts, link }) {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured — cannot send exam invite.');

  const name = participantName || 'Candidate';
  const durationLine = durationMinutes ? `${durationMinutes} minutes` : 'No time limit';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Your Exam Invitation – IFOA</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10)">
      <tr>
        <td bgcolor="#0c1a2e" style="background:#0c1a2e;padding:28px 40px 24px;text-align:center">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" bgcolor="#ffffff" style="background:#ffffff;border-radius:12px;padding:16px 20px">
                <img src="cid:ifoa_logo" width="460" alt="IFOA" style="display:block;border:0;width:460px;max-width:100%;height:auto"/>
              </td>
            </tr>
          </table>
          <div style="height:16px"></div>
          <div style="width:40px;height:2px;background:#2563eb;margin:0 auto 14px"></div>
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#94a3b8">International Flight Operations Academy</p>
          <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff">You've Been Invited to an Exam</p>
        </td>
      </tr>
      <tr><td style="background:linear-gradient(90deg,#2563eb,#3b82f6);height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
      <tr>
        <td style="padding:36px 40px 0">
          <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827">Dear ${name},</p>
          <p style="margin:0 0 24px;font-size:14px;color:#4b5563;line-height:1.7">
            You have been invited to complete the assessment below. Click the button to begin — no login is required, the link is personal to you.
          </p>

          <!-- Exam summary card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px">
            <tr><td style="padding:18px 22px">
              <p style="margin:0 0 10px;font-size:17px;font-weight:800;color:#0f172a">${examTitle}</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:5px 0;font-size:13px;color:#6b7280;width:40%">Time allowed</td>
                  <td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600">${durationLine}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;font-size:13px;color:#6b7280;border-top:1px solid #f1f5f9">Attempts allowed</td>
                  <td style="padding:5px 0;font-size:13px;color:#111827;font-weight:600;border-top:1px solid #f1f5f9">${maxAttempts || 1}</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px">
            <tr>
              <td style="background:#1d4ed8;border-radius:10px;text-align:center">
                <a href="${link}" style="display:inline-block;padding:14px 40px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px">
                  Start the Exam
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 6px;font-size:13px;color:#6b7280">If the button doesn't work, copy and paste this link:</p>
          <p style="margin:0 0 24px;font-size:12px;color:#2563eb;word-break:break-all;line-height:1.6">${link}</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;margin-bottom:8px">
            <tr><td style="padding:14px 18px">
              <p style="margin:0;font-size:13px;color:#854d0e;line-height:1.6">
                ⚠️ &nbsp;This link is personal to you — do not share it. Make sure you have a stable internet connection before you begin.
              </p>
            </td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 40px 32px">
          <p style="margin:0;font-size:13px;color:#374151;line-height:1.7">
            Best regards,<br/>
            <strong style="color:#111827">IFOA Administration Team</strong><br/>
            <span style="font-size:12px;color:#6b7280">International Flight Operations Academy</span>
          </p>
        </td>
      </tr>
      <tr>
        <td bgcolor="#0c1a2e" style="background:#0c1a2e;padding:16px 40px">
          <p style="margin:0;font-size:11px;color:#64748b;text-align:center">
            This is an automated email — please do not reply. &nbsp;|&nbsp;
            &copy; ${new Date().getFullYear()} International Flight Operations Academy
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    `Dear ${name},`,
    '',
    `You have been invited to complete the exam: ${examTitle}`,
    `Time allowed: ${durationLine}`,
    `Attempts allowed: ${maxAttempts || 1}`,
    '',
    'Start the exam using this personal link (do not share it):',
    link,
    '',
    'Best regards,',
    'IFOA Administration Team',
  ].join('\n');

  const info = await transporter.sendMail({
    from:    `"IFOA – International Flight Operations Academy" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    to:      toEmail,
    subject: `Exam Invitation: ${examTitle} – IFOA`,
    text,
    html,
    attachments: logoAttachment(),
  });
  console.log(`[email] Exam invite sent to ${toEmail} — messageId: ${info.messageId}`);
  return info;
}

module.exports = { sendSubmissionConfirmation, sendPasswordResetEmail, sendOtpEmail, sendContractEmail, sendExamInviteEmail };
