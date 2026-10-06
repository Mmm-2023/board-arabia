/** People uses Master for role master and Admin for role staff. No email and no id. */
export function accessActorLabel(name: unknown, role: unknown): string {
  const raw = typeof name === 'string' ? name.trim() : ''
  const cleanName = raw.includes('@') ? '' : raw
  const cleanRole = role === 'Master' || role === 'Admin' ? role : ''
  if (cleanName && cleanRole) return `${cleanName}, ${cleanRole}`
  return cleanRole
}

const LABELS: Record<string, string> = {
  membership_request: 'Membership request',
  member: 'Member record',
  desk_intro: 'Introduction',
  due_diligence_reports: 'Shared due diligence report',
  due_diligence_decks: 'Shared due diligence deck',
  due_diligence_jobs: 'Shared due diligence check',
  ai_tool_jobs: 'Shared AI result',
  ai_tool_outputs: 'Shared AI result',
  ai_tool_notes: 'Shared AI note',
}

export function accessObjectLabel(objectType: string) {
  return LABELS[objectType] || 'Record'
}
