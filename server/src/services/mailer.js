import nodemailer from 'nodemailer';

// If SMTP env vars are set, real emails are sent. Otherwise we run in "dev mode":
// the email body (incl. OTP) is logged to the server console so you can test the
// whole flow with zero setup. Add SMTP_* later to send for real.
const hasSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER);

let transporter = null;
if (hasSmtp) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export async function sendMail({ to, subject, text, html }) {
  if (!hasSmtp) {
    console.log('\n📧 [DEV EMAIL — no SMTP configured, logging instead]');
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   ${text || html}\n`);
    return { devMode: true };
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'ExamRoute <no-reply@examroute.app>',
    to,
    subject,
    text,
    html,
  });
  return { sent: true };
}

export const mailerDevMode = !hasSmtp;
