/** Re-export shared Workspace mail helpers. Invite email only. No booking link. */

export {
  adminNotifyEmail,
  corsHeaders,
  jsonResponse,
  logEmailEvent,
  publicSite,
  sendEmail,
} from '../_shared/mail.ts'
