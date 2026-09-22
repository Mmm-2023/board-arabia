/** Re-export shared Workspace mail helpers. Password reset only. No booking link. */

export {
  corsHeaders,
  jsonResponse,
  logEmailEvent,
  sendEmail,
} from '../_shared/mail.ts'
