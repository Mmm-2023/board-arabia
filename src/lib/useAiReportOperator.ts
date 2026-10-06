import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import {
  readAiReportOperatorPreview,
  type AiReportOperator,
} from './aiReportOperator'

/** One read of the signed-in operator row. A miss or error returns null. */
export async function loadAiReportOperator(): Promise<AiReportOperator | null> {
  const preview = readAiReportOperatorPreview()
  if (preview !== undefined) return preview
  try {
    const { data, error } = await supabase
      .from('ai_report_operator')
      .select('entity, cr')
      .eq('id', 1)
      .maybeSingle()
    if (error || !data) return null
    const entity = data.entity.trim()
    const cr = data.cr.trim()
    if (!entity || !cr) return null
    return { entity, cr }
  } catch {
    return null
  }
}

export function useAiReportOperator(): AiReportOperator | null {
  const preview = readAiReportOperatorPreview()
  const [row, setRow] = useState<AiReportOperator | null>(preview === undefined ? null : preview)
  useEffect(() => {
    const nextPreview = readAiReportOperatorPreview()
    if (nextPreview !== undefined) {
      setRow(nextPreview)
      return
    }
    let cancelled = false
    void loadAiReportOperator().then((loaded) => {
      if (!cancelled) setRow(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return row
}
