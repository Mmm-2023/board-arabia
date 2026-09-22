/** Re-export shared Workspace mail helpers. Booking link stays in this function only. */

export {
  ADMIN_NOTIFY_EMAIL,
  corsHeaders,
  jsonResponse,
  logEmailEvent,
  publicSite,
  sendEmail,
} from '../_shared/mail.ts'

/** Private booking link. Emailed on Accept only. Never expose on the public site. */
export const PRIVATE_BOOKING_LINK =
  Deno.env.get('PRIVATE_BOOKING_LINK') ??
  'https://calendar.app.google/a7RVc2v3mZ226Sd89'
