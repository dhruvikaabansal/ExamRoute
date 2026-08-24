import nodemailer from 'nodemailer';

/**
 * Email, by whichever route the host actually allows out.
 *
 * There are three modes, tried in this order:
 *
 *   1. An HTTP email API (Resend) when `RESEND_API_KEY` is set.
 *   2. SMTP when `SMTP_HOST` and `SMTP_USER` are set.
 *   3. Neither — the message is printed to the server console.
 *
 * The HTTP path exists because of a failure that cost a live signup flow.
 * Render's free tier blocks outbound SMTP entirely — ports 25, 465 and 587 —
 * as an anti-spam measure, and most free PaaS tiers do the same. So a
 * perfectly correct Gmail app password produced `Connection timeout` on every
 * send, forever, and no amount of checking the credentials would ever have
 * found it: the credentials were fine, the port was shut.
 *
 * An HTTP API goes out over 443 like any other request, which no host blocks
 * because blocking it would break everything else. SMTP is kept for hosts that
 * permit it, but HTTP is preferred when both are configured.
 */

const hasResend = !!process.env.RESEND_API_KEY;
const hasSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER);

const FROM = process.env.MAIL_FROM || 'ExamRoute <onboarding@resend.dev>';

let transporter = null;
if (hasSmtp) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    /*
     * Timeouts, because nodemailer has none worth the name by default.
     *
     * Plenty of hosts block or throttle outbound SMTP, and an unreachable
     * mail server without a timeout does not fail — it hangs, holding the
     * request open behind it. A mail send that cannot complete in eight
     * seconds is not going to complete.
     */
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 8_000,
  });
}

/**
 * The last thing that went wrong, so the app can be honest rather than
 * cheerful. "We have sent you a code" is a lie the moment delivery is broken,
 * and it is the most expensive kind of lie: the user waits, refreshes, checks
 * spam, and blames themselves.
 */
let lastError = null;

export function mailerStatus() {
  return {
    mode: hasResend ? 'http' : hasSmtp ? 'smtp' : 'console',
    configured: hasResend || hasSmtp,
    lastError,
  };
}

async function sendViaResend({ to, subject, text, html }) {
  // AbortSignal.timeout keeps a hung API call from holding the request open,
  // the same reason the SMTP transport has explicit timeouts.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    // Resend explains itself in the body; a bare status code would send
    // whoever debugs this next back to the dashboard to guess.
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend responded ${res.status}: ${detail.slice(0, 200)}`);
  }
  return { sent: true, via: 'http' };
}

/**
 * Never throws. Callers decide what a failed send means — for an OTP it is
 * worth telling the user about, for a booking confirmation it is not — and a
 * throw here would turn "your receipt did not send" into "your payment failed".
 */
export async function sendMail({ to, subject, text, html }) {
  if (!hasResend && !hasSmtp) {
    console.log('\n[DEV EMAIL — no mail transport configured, logging instead]');
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   ${text || html}\n`);
    return { ok: true, devMode: true };
  }

  try {
    const result = hasResend
      ? await sendViaResend({ to, subject, text, html })
      : await transporter.sendMail({ from: FROM, to, subject, text, html }).then(() => ({
          sent: true,
          via: 'smtp',
        }));

    lastError = null;
    return { ok: true, ...result };
  } catch (err) {
    lastError = { message: err.message, at: new Date().toISOString() };

    /*
      Name the likely cause rather than repeating the symptom. "Connection
      timeout" printed once a minute tells you nothing you did not already
      know; the actionable fact is that free hosting tiers close the SMTP
      ports, so no credential change will ever fix it.
    */
    const blocked = /timeout|ETIMEDOUT|ECONNREFUSED|ESOCKET/i.test(err.message);
    if (blocked && hasSmtp) {
      console.warn(
        `Email failed: ${err.message}\n` +
          '   Outbound SMTP is blocked on most free hosting tiers (Render, Fly, ' +
          'Railway) regardless of credentials.\n' +
          '   Set RESEND_API_KEY to send over HTTPS instead — see server/.env.example.'
      );
    } else {
      console.warn(`Email failed: ${err.message}`);
    }

    return { ok: false, error: err.message };
  }
}

// True when nothing is configured and mail is only being printed.
export const mailerDevMode = !hasResend && !hasSmtp;
