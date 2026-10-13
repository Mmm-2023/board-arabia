import { presentUnreadNotification, type UnreadNotification } from './boardSeats'
import { supabase } from './supabase'

export async function loadUnreadNotification(): Promise<UnreadNotification | null> {
  const { data, error } = await supabase.rpc('my_unread_notification')
  if (error) return null
  return presentUnreadNotification(data)
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from('member_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
  return !error
}
