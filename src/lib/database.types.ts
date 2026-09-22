export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      applications: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          full_name: string | null
          email: string | null
          phone: string | null
          turnover: string
          fo_aum: string | null
          investable_capacity_usd: number | null
          include_in_public_aggregates: boolean
          companies: string
          job_titles: string
          linkedin_url: string | null
          calendar_slot: string | null
          status: 'pending' | 'verified' | 'declined' | 'accepted' | 'rejected' | 'admitted'
          notes: string | null
          invite_event_id: string | null
          invite_sent_at: string | null
          decision_at: string | null
          decision_by: string | null
          founding_seat: 'ksa' | 'intl' | null
          member_user_id: string | null
          admitted_at: string | null
          admitted_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          turnover: string
          fo_aum?: string | null
          investable_capacity_usd?: number | null
          include_in_public_aggregates?: boolean
          companies: string
          job_titles: string
          linkedin_url?: string | null
          calendar_slot?: string | null
          status?: 'pending' | 'verified' | 'declined' | 'accepted' | 'rejected' | 'admitted'
          notes?: string | null
          invite_event_id?: string | null
          invite_sent_at?: string | null
          decision_at?: string | null
          decision_by?: string | null
          founding_seat?: 'ksa' | 'intl' | null
          member_user_id?: string | null
          admitted_at?: string | null
          admitted_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          turnover?: string
          fo_aum?: string | null
          investable_capacity_usd?: number | null
          include_in_public_aggregates?: boolean
          companies?: string
          job_titles?: string
          linkedin_url?: string | null
          calendar_slot?: string | null
          status?: 'pending' | 'verified' | 'declined' | 'accepted' | 'rejected' | 'admitted'
          notes?: string | null
          invite_event_id?: string | null
          invite_sent_at?: string | null
          decision_at?: string | null
          decision_by?: string | null
          founding_seat?: 'ksa' | 'intl' | null
          member_user_id?: string | null
          admitted_at?: string | null
          admitted_by?: string | null
        }
        Relationships: []
      }
      members: {
        Row: {
          user_id: string
          application_id: string | null
          email: string
          seat: 'ksa' | 'intl'
          status: 'invited' | 'active' | 'suspended'
          must_set_password: boolean
          invited_at: string
          invited_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          application_id?: string | null
          email: string
          seat: 'ksa' | 'intl'
          status?: 'invited' | 'active' | 'suspended'
          must_set_password?: boolean
          invited_at?: string
          invited_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          application_id?: string | null
          email?: string
          seat?: 'ksa' | 'intl'
          status?: 'invited' | 'active' | 'suspended'
          must_set_password?: boolean
          invited_at?: string
          invited_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          user_id: string
          full_name: string | null
          headline: string | null
          company: string | null
          location: string | null
          linkedin_url: string | null
          bio: string | null
          phone: string | null
          investable_capacity_usd: number | null
          fo_aum_usd: number | null
          turnover_usd: number | null
          capacity_currency: string
          include_in_public_aggregates: boolean
          capacity_verified: boolean
          updated_at: string
        }
        Insert: {
          user_id: string
          full_name?: string | null
          headline?: string | null
          company?: string | null
          location?: string | null
          linkedin_url?: string | null
          bio?: string | null
          phone?: string | null
          investable_capacity_usd?: number | null
          fo_aum_usd?: number | null
          turnover_usd?: number | null
          capacity_currency?: string
          include_in_public_aggregates?: boolean
          capacity_verified?: boolean
          updated_at?: string
        }
        Update: {
          user_id?: string
          full_name?: string | null
          headline?: string | null
          company?: string | null
          location?: string | null
          linkedin_url?: string | null
          bio?: string | null
          phone?: string | null
          investable_capacity_usd?: number | null
          fo_aum_usd?: number | null
          turnover_usd?: number | null
          capacity_currency?: string
          include_in_public_aggregates?: boolean
          capacity_verified?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      platform_stats: {
        Row: {
          id: number
          investment_capability_usd: number | null
          fo_aum_usd: number | null
          turnover_usd: number | null
          founding_admitted_count: number
          founding_ksa_count: number
          founding_intl_count: number
          contributors_investment_n: number
          contributors_fo_n: number
          contributors_turnover_n: number
          updated_at: string
        }
        Insert: {
          id?: number
          investment_capability_usd?: number | null
          fo_aum_usd?: number | null
          turnover_usd?: number | null
          founding_admitted_count?: number
          founding_ksa_count?: number
          founding_intl_count?: number
          contributors_investment_n?: number
          contributors_fo_n?: number
          contributors_turnover_n?: number
          updated_at?: string
        }
        Update: {
          id?: number
          investment_capability_usd?: number | null
          fo_aum_usd?: number | null
          turnover_usd?: number | null
          founding_admitted_count?: number
          founding_ksa_count?: number
          founding_intl_count?: number
          contributors_investment_n?: number
          contributors_fo_n?: number
          contributors_turnover_n?: number
          updated_at?: string
        }
        Relationships: []
      }
      staff_users: {
        Row: {
          user_id: string
          email: string
          role: 'staff' | 'master'
          created_at: string
        }
        Insert: {
          user_id: string
          email: string
          role?: 'staff' | 'master'
          created_at?: string
        }
        Update: {
          user_id?: string
          email?: string
          role?: 'staff' | 'master'
          created_at?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          id: string
          created_at: string
          application_id: string | null
          kind: string
          recipient: string
          subject: string
          status: string
          provider: string | null
          provider_id: string | null
          detail: string | null
          payload: Json | null
        }
        Insert: {
          id?: string
          created_at?: string
          application_id?: string | null
          kind: string
          recipient: string
          subject: string
          status?: string
          provider?: string | null
          provider_id?: string | null
          detail?: string | null
          payload?: Json | null
        }
        Update: {
          id?: string
          created_at?: string
          application_id?: string | null
          kind?: string
          recipient?: string
          subject?: string
          status?: string
          provider?: string | null
          provider_id?: string | null
          detail?: string | null
          payload?: Json | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      founding_capacity: {
        Args: Record<string, never>
        Returns: Json
      }
      list_staff_directory: {
        Args: Record<string, never>
        Returns: {
          email: string
          role: string
          created_at: string
        }[]
      }
      staff_set_member_capacity: {
        Args: {
          p_user_id: string
          p_investable_capacity_usd: number | null
          p_fo_aum_usd: number | null
          p_turnover_usd: number | null
          p_include_in_public_aggregates: boolean
          p_capacity_verified: boolean
        }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
