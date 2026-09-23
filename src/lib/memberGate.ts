import { postLoginDestination } from '../../supabase/functions/_shared/staff_auth.ts'
import { readCallerAccess } from './requireStaff'

/** Staff go to /admin. A live member who is also staff may open /dashboard.
 * Everyone else, including members, founding, and sponsor, goes to /dashboard.
 */
export async function resolveAfterLogin(userId: string, requested: string | null) {
  const access = await readCallerAccess(userId)
  return postLoginDestination({
    role: access.role,
    memberStatus: access.memberStatus,
    requested,
  })
}
