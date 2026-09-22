/** Re-export shared Workspace mail helpers. Invite email only. No booking link. */

export {
  ADMIN_NOTIFY_EMAIL,
  corsHeaders,
  jsonResponse,
  logEmailEvent,
  publicSite,
  sendEmail,
} from '../_shared/mail.ts'
