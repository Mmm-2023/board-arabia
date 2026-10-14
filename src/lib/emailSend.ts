import { supabase } from './supabase'

export type CampaignSendMode = 'test' | 'live'

export async function requestCampaignSend(
  campaignId: string,
  mode: CampaignSendMode,
): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('email-send', {
    body: { campaign_id: campaignId, mode },
  })
  if (error || !data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
    return { ok: false, message: 'The send did not start. Nothing was sent.' }
  }
  if (mode === 'test') return { ok: true, message: 'Test sent to the address on your account.' }
  return { ok: true, message: 'Release started. Nothing else is sent on its own.' }
}
