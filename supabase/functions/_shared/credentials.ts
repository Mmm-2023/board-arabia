import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export type Issued =
  | {
      mode: 'magic_link'
      userId: string
      createdNew: boolean
      tokenHash: string
      otp: string
      otpType: 'invite' | 'magiclink'
    }
  | {
      mode: 'temp_password'
      userId: string
      createdNew: boolean
      tempPassword: string
    }

export async function issueCredential(
  admin: SupabaseClient,
  email: string,
  site: string,
): Promise<Issued | { error: string }> {
  const redirectTo = `${site}/auth/confirm`
  const invite = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  })
  const invited = readLink(invite.data, true, 'invite')
  if (invited) return invited

  const inviteMsg = invite.error?.message ?? ''
  if (/already|registered|exists/i.test(inviteMsg)) {
    const magic = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    })
    const linked = readLink(magic.data, false, 'magiclink')
    if (linked) return linked
    return { error: magic.error?.message || inviteMsg || 'Could not issue a sign-in link' }
  }

  const tempPassword = makeTempPassword()
  const created = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  })
  if (created.error || !created.data.user?.id) {
    return { error: created.error?.message || inviteMsg || 'Could not create member login' }
  }
  return {
    mode: 'temp_password',
    userId: created.data.user.id,
    createdNew: true,
    tempPassword,
  }
}

function readLink(
  data: {
    user?: { id?: string } | null
    properties?: { hashed_token?: string; email_otp?: string } | null
  } | null,
  createdNew: boolean,
  otpType: 'invite' | 'magiclink',
): Issued | null {
  const userId = data?.user?.id || ''
  const tokenHash = data?.properties?.hashed_token || ''
  if (!userId || !tokenHash) return null
  return {
    mode: 'magic_link',
    userId,
    createdNew,
    tokenHash,
    otp: data?.properties?.email_otp || '',
    otpType,
  }
}

export function makeTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
