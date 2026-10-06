import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'

type MemberRecord = {
  seat: string
  status: string
  directory_hidden: boolean
  full_name: string
}

export function StaffMemberRecordPage() {
  const { memberId = '' } = useParams()
  const [record, setRecord] = useState<MemberRecord | null>(null)
  const [error, setError] = useState('')
  useNoIndex('Member record | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_read_member', { p_user_id: memberId }).then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError || !data || typeof data !== 'object' || Array.isArray(data)) {
        setRecord(null)
        setError('Could not open this member record.')
        return
      }
      const row = data as MemberRecord
      setError('')
      setRecord({
        seat: String(row.seat || ''),
        status: String(row.status || ''),
        directory_hidden: row.directory_hidden === true,
        full_name: String(row.full_name || 'Member'),
      })
    })
    return () => {
      cancelled = true
    }
  }, [memberId])

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Member record</h1>
      <p className="mt-2 text-[0.95rem] text-stone/70">This read is recorded in the access log.</p>
      {error ? (
        <p className="mt-4 text-[0.95rem] text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {record ? (
        <dl className="mt-6 space-y-3 text-[1rem]">
          <div>
            <dt className="text-pearl/45">Name</dt>
            <dd>{record.full_name}</dd>
          </div>
          <div>
            <dt className="text-pearl/45">Seat</dt>
            <dd>{record.seat}</dd>
          </div>
          <div>
            <dt className="text-pearl/45">Status</dt>
            <dd>{record.status}</dd>
          </div>
          <div>
            <dt className="text-pearl/45">Directory</dt>
            <dd>{record.directory_hidden ? 'Hidden from the directory' : 'Visible to members'}</dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-6">
        <Link to="/admin/people" className="inline-flex min-h-11 items-center text-[0.95rem] underline">
          Back to people
        </Link>
      </p>
    </div>
  )
}
