import type { Env } from './env';
import type { LoadedHousehold } from './household';
import { guestDisplayName } from '../shared/rsvp';

type Message = { to: string; subject: string; html: string; text: string };
type Kind = 'confirmation' | 'reminder';

/**
 * Sends through Resend when RESEND_API_KEY is set; otherwise logs the email
 * (visible in `wrangler dev` output and Workers logs). Every attempt is
 * recorded in the emails table either way.
 */
export async function sendEmail(
  env: Env,
  householdId: number | null,
  kind: Kind,
  msg: Message,
  idempotencyKey: string,
): Promise<'sent' | 'logged' | 'failed'> {
  let status: 'sent' | 'logged' | 'failed' = 'logged';
  let providerId: string | null = null;
  let err: string | null = null;

  if (!env.RESEND_API_KEY) {
    console.log(`[email:${kind}] (not sent, no RESEND_API_KEY) to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  } else {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [msg.to],
          reply_to: env.EMAIL_REPLY_TO || undefined,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (res.ok) {
        status = 'sent';
        providerId = data.id ?? null;
      } else {
        status = 'failed';
        err = `${res.status} ${data.message ?? ''}`.trim().slice(0, 500);
      }
    } catch (e) {
      status = 'failed';
      err = String(e).slice(0, 500);
    }
    if (status === 'failed') console.error(`[email:${kind}] failed to=${msg.to}: ${err}`);
  }

  await env.DB.prepare(
    'INSERT INTO emails (household_id, kind, to_address, status, provider_id, error) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
  )
    .bind(householdId, kind, msg.to, status, providerId, err)
    .run();
  return status;
}

/* ---------- templates ---------- */

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5eee2;font-family:Georgia,serif;color:#2b1d16">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fffaf2;border:1px solid #d8c098;border-radius:12px">
<tr><td style="padding:32px 28px">
<p style="margin:0 0 4px;font:600 11px/1.4 Helvetica,Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;color:#6f7a3c">Blake &amp; Casey</p>
<h1 style="margin:0 0 20px;font-weight:normal;font-size:28px;color:#7a1f2c">${esc(title)}</h1>
${bodyHtml}
</td></tr></table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;background:#7a1f2c;color:#f5eee2;text-decoration:none;padding:12px 22px;border-radius:999px;font:600 12px Helvetica,Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">${esc(label)}</a></p>`;

export function confirmationEmail(h: LoadedHousehold, editUrl: string, deadline: string): Omit<Message, 'to'> {
  const mealLabel = (slug: string | null) => {
    if (!slug) return null;
    for (const e of h.events) {
      const opt = e.mealOptions.find((o) => o.slug === slug);
      if (opt) return opt.label;
    }
    return slug;
  };

  const lines: string[] = [];
  const rows: string[] = [];
  for (const g of h.guests) {
    const answers = h.events
      .filter((e) => e.slug in g.events)
      .map((e) => `${e.name}: ${g.events[e.slug] ? 'Attending' : 'Not attending'}`);
    const anyYes = Object.values(g.events).some(Boolean);
    if (g.isPlusOne && !anyYes) continue; // an unused plus-one isn't worth listing
    const meal = mealLabel(g.meal);
    const extra = [meal && `Meal: ${meal}`, g.dietaryNotes && `Dietary notes: ${g.dietaryNotes}`].filter(Boolean) as string[];
    const name = guestDisplayName(g);
    lines.push(`${name}\n  ${[...answers, ...extra].join('\n  ')}`);
    rows.push(
      `<tr><td style="padding:12px 0;border-top:1px solid #eadfcc"><strong style="font-size:17px">${esc(name)}</strong><br>
       <span style="font:14px/1.6 Helvetica,Arial,sans-serif;color:#5e4c40">${[...answers, ...extra].map(esc).join('<br>')}</span></td></tr>`,
    );
  }

  const extrasText = [
    h.shuttleSeats ? `Shuttle seats: ${h.shuttleSeats}` : null,
    h.songRequest ? `Song request: ${h.songRequest}` : null,
    h.noteToCouple ? `Your note: ${h.noteToCouple}` : null,
  ].filter(Boolean) as string[];

  const deadlineLabel = new Date(deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Detroit' });

  const html = wrapHtml(
    'Thank you for your reply',
    `<p style="font:16px/1.6 Helvetica,Arial,sans-serif">Here’s exactly what we have for ${esc(h.displayName)}:</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>
     ${extrasText.length ? `<p style="font:14px/1.6 Helvetica,Arial,sans-serif;color:#5e4c40">${extrasText.map(esc).join('<br>')}</p>` : ''}
     <p style="font:15px/1.6 Helvetica,Arial,sans-serif">Need to change something? You can update your reply until ${esc(deadlineLabel)}.</p>
     ${button(editUrl, 'Update my RSVP')}`,
  );
  const text = `Thank you for your reply!\n\nHere's exactly what we have for ${h.displayName}:\n\n${lines.join('\n\n')}\n\n${extrasText.join('\n')}${extrasText.length ? '\n\n' : ''}Need to change something? You can update your reply until ${deadlineLabel}:\n${editUrl}\n`;
  return { subject: 'Your RSVP for Blake & Casey’s wedding', html, text };
}

export function reminderEmail(displayName: string, rsvpUrl: string, deadline: string): Omit<Message, 'to'> {
  const deadlineLabel = new Date(deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Detroit' });
  const html = wrapHtml(
    'A gentle reminder',
    `<p style="font:16px/1.6 Helvetica,Arial,sans-serif">Hi ${esc(displayName)}, we’d love to know if you can make it. Please reply by ${esc(deadlineLabel)} so we can give the caterer final numbers.</p>
     ${button(rsvpUrl, 'Reply now')}`,
  );
  const text = `Hi ${displayName}, we'd love to know if you can make it. Please reply by ${deadlineLabel} so we can give the caterer final numbers.\n\n${rsvpUrl}\n`;
  return { subject: 'Reminder: please RSVP for Blake & Casey’s wedding', html, text };
}
