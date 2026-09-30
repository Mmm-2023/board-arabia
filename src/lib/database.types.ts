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
          invited_by_member_id: string | null
          invite_token_id: string | null
          invite_reason: string | null
          ft_source: string | null
          ft_medium: string | null
          ft_campaign: string | null
          ft_content: string | null
          ft_term: string | null
          ft_referrer_host: string | null
          ft_landing_path: string | null
          ft_at: string | null
          lt_source: string | null
          lt_medium: string | null
          lt_campaign: string | null
          analytics_id: string | null
          attribution_version: number | null
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
          invited_by_member_id?: string | null
          invite_token_id?: string | null
          invite_reason?: string | null
          ft_source?: string | null
          ft_medium?: string | null
          ft_campaign?: string | null
          ft_content?: string | null
          ft_term?: string | null
          ft_referrer_host?: string | null
          ft_landing_path?: string | null
          ft_at?: string | null
          lt_source?: string | null
          lt_medium?: string | null
          lt_campaign?: string | null
          analytics_id?: string | null
          attribution_version?: number | null
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
          invited_by_member_id?: string | null
          invite_token_id?: string | null
          invite_reason?: string | null
          ft_source?: string | null
          ft_medium?: string | null
          ft_campaign?: string | null
          ft_content?: string | null
          ft_term?: string | null
          ft_referrer_host?: string | null
          ft_landing_path?: string | null
          ft_at?: string | null
          lt_source?: string | null
          lt_medium?: string | null
          lt_campaign?: string | null
          analytics_id?: string | null
          attribution_version?: number | null
        }
        Relationships: []
      }
      members: {
        Row: {
          user_id: string
          application_id: string | null
          email: string
          seat: 'ksa' | 'intl' | 'sponsor'
          status: 'invited' | 'active' | 'suspended'
          must_set_password: boolean
          invited_at: string
          invited_by: string | null
          invites_granted: number
          invites_remaining: number
          is_demo: boolean
          tier: 'founding' | 'member'
          founding_number: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          application_id?: string | null
          email: string
          seat: 'ksa' | 'intl' | 'sponsor'
          status?: 'invited' | 'active' | 'suspended'
          must_set_password?: boolean
          invited_at?: string
          invited_by?: string | null
          invites_granted?: number
          invites_remaining?: number
          is_demo?: boolean
          tier?: 'founding' | 'member'
          founding_number?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          application_id?: string | null
          email?: string
          seat?: 'ksa' | 'intl' | 'sponsor'
          status?: 'invited' | 'active' | 'suspended'
          must_set_password?: boolean
          invited_at?: string
          invited_by?: string | null
          invites_granted?: number
          invites_remaining?: number
          is_demo?: boolean
          tier?: 'founding' | 'member'
          founding_number?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      member_invites: {
        Row: {
          id: string
          token: string
          inviter_member_id: string
          channel: 'email' | 'whatsapp'
          status: 'pending' | 'opened' | 'applied' | 'accepted' | 'rejected' | 'admitted'
          recipient_email: string | null
          recipient_phone: string | null
          recipient_name: string | null
          application_id: string | null
          expires_at: string
          opened_at: string | null
          applied_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          token: string
          inviter_member_id: string
          channel: 'email' | 'whatsapp'
          status?: 'pending' | 'opened' | 'applied' | 'accepted' | 'rejected' | 'admitted'
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_name?: string | null
          application_id?: string | null
          expires_at: string
          opened_at?: string | null
          applied_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          token?: string
          inviter_member_id?: string
          channel?: 'email' | 'whatsapp'
          status?: 'pending' | 'opened' | 'applied' | 'accepted' | 'rejected' | 'admitted'
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_name?: string | null
          application_id?: string | null
          expires_at?: string
          opened_at?: string | null
          applied_at?: string | null
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
          avatar_path: string | null
          avatar_style: 'male' | 'female'
          availability: 'open' | 'selective' | 'at_capacity' | null
          sector_tags: string[]
          vision_themes: string[]
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
          avatar_path?: string | null
          avatar_style?: 'male' | 'female'
          availability?: 'open' | 'selective' | 'at_capacity' | null
          sector_tags?: string[]
          vision_themes?: string[]
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
          avatar_path?: string | null
          avatar_style?: 'male' | 'female'
          availability?: 'open' | 'selective' | 'at_capacity' | null
          sector_tags?: string[]
          vision_themes?: string[]
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
      due_diligence_decks: {
        Row: {
          id: string
          member_id: string
          storage_path: string
          file_name: string
          mime_type: string
          byte_size: number
          company_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          member_id: string
          storage_path: string
          file_name: string
          mime_type: string
          byte_size: number
          company_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          storage_path?: string
          file_name?: string
          mime_type?: string
          byte_size?: number
          company_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      due_diligence_jobs: {
        Row: {
          id: string
          deck_id: string
          member_id: string
          status: 'queued' | 'reading' | 'checking' | 'writing' | 'ready' | 'failed'
          progress: number
          error: string | null
          model_id: string | null
          model_skip_reason: string | null
          pipeline_step: string
          step_claim: string | null
          pipeline: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          deck_id: string
          member_id: string
          status?: 'queued' | 'reading' | 'checking' | 'writing' | 'ready' | 'failed'
          progress?: number
          error?: string | null
          model_id?: string | null
          model_skip_reason?: string | null
          pipeline_step?: string
          step_claim?: string | null
          pipeline?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          deck_id?: string
          member_id?: string
          status?: 'queued' | 'reading' | 'checking' | 'writing' | 'ready' | 'failed'
          progress?: number
          error?: string | null
          model_id?: string | null
          model_skip_reason?: string | null
          pipeline_step?: string
          step_claim?: string | null
          pipeline?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      due_diligence_reports: {
        Row: {
          id: string
          job_id: string
          deck_id: string
          member_id: string
          file_name: string
          company_label: string
          sector_label: string
          ask_label: string
          disclaimer: string
          publicly_consistent_pct: number | null
          not_publicly_verifiable_pct: number | null
          claims: Json
          sources: Json
          next_steps: Json
          analysis: Json | null
          analysis_status: string
          model_id: string | null
          model_skip_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          job_id: string
          deck_id: string
          member_id: string
          file_name: string
          company_label: string
          sector_label: string
          ask_label: string
          disclaimer: string
          publicly_consistent_pct?: number | null
          not_publicly_verifiable_pct?: number | null
          claims: Json
          sources: Json
          next_steps: Json
          analysis?: Json | null
          analysis_status?: string
          model_id?: string | null
          model_skip_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          deck_id?: string
          member_id?: string
          file_name?: string
          company_label?: string
          sector_label?: string
          ask_label?: string
          disclaimer?: string
          publicly_consistent_pct?: number | null
          not_publicly_verifiable_pct?: number | null
          claims?: Json
          sources?: Json
          next_steps?: Json
          analysis?: Json | null
          analysis_status?: string
          model_id?: string | null
          model_skip_reason?: string | null
          created_at?: string
        }
        Relationships: []
      }
      candidates: {
        Row: {
          user_id: string
          email: string
          full_name: string
          role: 'chairperson' | 'board_member' | 'c_suite' | 'other'
          region: 'ksa_gcc' | 'intl'
          request_state: 'open' | 'submitted' | 'in_review' | 'needs_info' | 'review_call' | 'waitlisted' | 'approved' | 'declined' | 'closed'
          email_verified_at: string | null
          owner: string | null
          submitted_at: string | null
          board_seats: string | null
          company_name: string | null
          job_title: string | null
          company_website: string | null
          linkedin_url: string | null
          scale_kind: 'turnover' | 'aum' | null
          scale_band: string | null
          sector_tags: string[] | null
          vision_tags: string[] | null
          statement: string | null
          cr_number: string | null
          cr_country: string | null
          referral_name: string | null
          invited_by_member_id: string | null
          invite_token_id: string | null
          invite_reason: string | null
          investable_capacity_usd: number | null
          include_in_public_aggregates: boolean | null
          phone: string | null
          ft_source: string | null
          ft_medium: string | null
          ft_campaign: string | null
          ft_content: string | null
          ft_term: string | null
          ft_referrer_host: string | null
          ft_landing_path: string | null
          ft_at: string | null
          lt_source: string | null
          lt_medium: string | null
          lt_campaign: string | null
          analytics_id: string | null
          attribution_version: number | null
          needs_info_items: string[] | null
          needs_info_question: string | null
          needs_info_reply: string | null
          needs_info_at: string | null
          decision_reason: string | null
          decision_note: string | null
          decided_at: string | null
          declined_until: string | null
          waitlist_revisit_at: string | null
          approved_at: string | null
          closed_reason: string | null
          review_seat: 'ksa' | 'intl' | null
          review_tier: 'founding' | 'member' | null
          linkedin_checked: boolean
          cr_checked: boolean
          capacity_verified: boolean
          state_changed_at: string | null
          consent_at: string | null
          checklist_reminded_at: string | null
          free_webmail: boolean
          retention_reminded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          email: string
          full_name: string
          role: 'chairperson' | 'board_member' | 'c_suite' | 'other'
          region: 'ksa_gcc' | 'intl'
          request_state?: 'open' | 'submitted' | 'in_review' | 'needs_info' | 'review_call' | 'waitlisted' | 'approved' | 'declined' | 'closed'
          invite_reason?: string | null
          ft_source?: string | null
          ft_medium?: string | null
          ft_campaign?: string | null
          ft_content?: string | null
          ft_term?: string | null
          ft_referrer_host?: string | null
          ft_landing_path?: string | null
          ft_at?: string | null
          lt_source?: string | null
          lt_medium?: string | null
          lt_campaign?: string | null
          analytics_id?: string | null
          attribution_version?: number | null
        }
        Update: {
          full_name?: string
          role?: 'chairperson' | 'board_member' | 'c_suite' | 'other'
          region?: 'ksa_gcc' | 'intl'
          email_verified_at?: string | null
          invited_by_member_id?: string | null
          invite_token_id?: string | null
          invite_reason?: string | null
          board_seats?: string | null
          company_name?: string | null
          job_title?: string | null
          company_website?: string | null
          linkedin_url?: string | null
          scale_kind?: 'turnover' | 'aum' | null
          scale_band?: string | null
          sector_tags?: string[] | null
          vision_tags?: string[] | null
          statement?: string | null
          cr_number?: string | null
          cr_country?: string | null
          referral_name?: string | null
          investable_capacity_usd?: number | null
          include_in_public_aggregates?: boolean | null
          phone?: string | null
          linkedin_checked?: boolean
          cr_checked?: boolean
          checklist_reminded_at?: string | null
          waitlist_revisit_at?: string | null
        }
        Relationships: []
      }
      candidate_events: {
        Row: {
          id: string
          candidate_user_id: string
          kind: string
          detail: Json
          actor_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          candidate_user_id: string
          kind: string
          detail?: Json
          actor_id?: string | null
        }
        Update: {
          detail?: Json
        }
        Relationships: []
      }
      candidate_notes: {
        Row: {
          id: string
          candidate_user_id: string
          author_id: string
          body: string
          created_at: string
        }
        Insert: {
          candidate_user_id: string
          author_id: string
          body: string
        }
        Update: {
          body?: string
        }
        Relationships: []
      }
    }
    Views: {
      majlis_events_member: {
        Row: {
          id: string
          host_member_id: string
          title: string
          description: string
          region: string
          focus_tags: string[]
          starts_at: string
          ends_at: string
          timezone: string
          capacity: number
          venue_name: string
          venue_address: string | null
          venue_visibility: string
          status: 'pending_approval' | 'published' | 'rejected' | 'cancelled' | 'hidden'
          rejection_feedback: string | null
          admin_note: string | null
          approved_at: string | null
          created_at: string
          map_lat: number | null
          map_lng: number | null
          rsvp_opens_at: string | null
          founding_priority_ends_at: string | null
          featured: boolean
          sponsor_label: string | null
          cancelled_at: string | null
          cancel_reason: string | null
          registered_count: number
          waitlist_count: number
          my_rsvp_status: 'registered' | 'waitlist' | 'cancelled' | null
          my_waitlist_position: number | null
          host_avatar_style: 'male' | 'female' | null
          host_avatar_path: string | null
        }
        Relationships: []
      }
      majlis_events_sponsor: {
        Row: {
          id: string
          title: string
          description: string
          region: string
          focus_tags: string[]
          starts_at: string
          ends_at: string
          timezone: string
          capacity: number
          venue_name: string
          status: 'published'
          map_lat: number | null
          map_lng: number | null
          rsvp_opens_at: string | null
          founding_priority_ends_at: string | null
          featured: boolean
          sponsor_label: string | null
          registered_count: number
          waitlist_count: number
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          id: string
          campaign: string
          channel: string
          month: string
          spend_sar: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          campaign: string
          channel: string
          month: string
          spend_sar?: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          campaign?: string
          channel?: string
          month?: string
          spend_sar?: number
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      majlis_roster: {
        Row: {
          id: string
          event_id: string
          member_id: string
          status: 'registered' | 'waitlist' | 'cancelled'
          waitlist_position: number | null
          registered_at: string
          cancelled_at: string | null
          email: string
          full_name: string | null
          avatar_style: 'male' | 'female' | null
          avatar_path: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      founding_capacity: {
        Args: Record<string, never>
        Returns: Json
      }
      marketing_funnel_counts: {
        Args: {
          p_from: string
          p_to: string
          p_channel?: string
        }
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
      staff_set_avatar_style: {
        Args: {
          p_user_id: string
          p_style: string
        }
        Returns: undefined
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
      lookup_member_invite: {
        Args: { p_token: string }
        Returns: Json
      }
      majlis_consume_apply_slot: {
        Args: { p_member: string }
        Returns: undefined
      }
      due_diligence_consume_run: {
        Args: { p_member: string }
        Returns: undefined
      }
      list_directory: {
        Args: Record<string, never>
        Returns: Json
      }
      list_member_mandates: {
        Args: Record<string, never>
        Returns: Json
      }
      request_mandate_intro: {
        Args: { p_mandate_id: string }
        Returns: Json
      }
      request_member_intro: {
        Args: { p_target_id: string; p_reason: string }
        Returns: Json
      }
      respond_member_intro: {
        Args: { p_intro_id: string; p_decision: string }
        Returns: Json
      }
      list_my_intros: {
        Args: Record<string, never>
        Returns: Json
      }
      staff_list_all_intros: {
        Args: Record<string, never>
        Returns: Json
      }
      list_member_rooms: {
        Args: Record<string, never>
        Returns: Json
      }
      list_my_deal_rooms: {
        Args: Record<string, never>
        Returns: Json
      }
      search_deal_room_directory: {
        Args: { p_query: string }
        Returns: Json
      }
      list_member_home_activity: {
        Args: Record<string, never>
        Returns: Json
      }
      list_trusted_partners: {
        Args: Record<string, never>
        Returns: Json
      }
      list_landing_preview_deals: {
        Args: Record<string, never>
        Returns: Json
      }
      landing_platform_totals: {
        Args: Record<string, never>
        Returns: Json
      }
      staff_list_mandate_intros: {
        Args: Record<string, never>
        Returns: Json
      }
      staff_list_mandates: {
        Args: Record<string, never>
        Returns: Json
      }
      staff_list_mandate_matches: {
        Args: { p_mandate_id: string }
        Returns: Json
      }
      staff_decide_mandate_intro: {
        Args: { p_intro_id: string; p_decision: string }
        Returns: Json
      }
      list_re_opportunities: {
        Args: Record<string, never>
        Returns: Json
      }
      list_re_partners: {
        Args: Record<string, never>
        Returns: Json
      }
      request_re_opportunity_intro: {
        Args: { p_opportunity_id: string }
        Returns: Json
      }
      staff_list_re_opportunity_intros: {
        Args: Record<string, never>
        Returns: Json
      }
      staff_decide_re_opportunity_intro: {
        Args: { p_intro_id: string; p_decision: string }
        Returns: Json
      }
      staff_save_re_opportunity: {
        Args: {
          p_id: string | null
          p_published: boolean
          p_sector: string
          p_city: string
          p_asset_class: string
          p_capital_role: string
          p_ticket_band: string
          p_one_liner: string
          p_sponsor_member_id: string | null
          p_counterparty_name: string
          p_terms: string
          p_contact_name: string
          p_contact_email: string
          p_contact_phone: string
          p_narrative: string
          p_foreign_ownership_path: string
          p_escrow_off_plan: string
          p_title_clarity: string
          p_white_land_exposure: string
          p_sort_order: number
        }
        Returns: Json
      }
      staff_set_re_opportunity_readiness: {
        Args: {
          p_id: string
          p_foreign_ownership_path: string
          p_escrow_off_plan: string
          p_title_clarity: string
          p_white_land_exposure: string
        }
        Returns: Json
      }
      request_re_partner_intro: {
        Args: { p_partner_id: string }
        Returns: Json
      }
      staff_list_re_partner_intros: {
        Args: Record<string, never>
        Returns: Json
      }
      staff_decide_re_partner_intro: {
        Args: { p_intro_id: string; p_decision: string }
        Returns: Json
      }
      staff_save_re_partner: {
        Args: {
          p_id: string | null
          p_published: boolean
          p_name: string
          p_kind: string
          p_city: string
          p_blurb: string
          p_contact_name: string
          p_contact_email: string
          p_contact_phone: string
          p_sort_order: number
        }
        Returns: Json
      }
      staff_assign_sponsor_category: {
        Args: { p_member_id: string; p_category_slug: string }
        Returns: Json
      }
      sponsor_desk: {
        Args: Record<string, never>
        Returns: Json
      }
      staff_list_sponsor_catalog: {
        Args: Record<string, never>
        Returns: Json
      }
      staff_save_sponsor_package: {
        Args: {
          p_slug: string
          p_name: string
          p_price_label: string
          p_majlis_slots: number
          p_intro_credits: number
          p_room_credits: number
          p_active: boolean
          p_is_placeholder: boolean
        }
        Returns: Json
      }
      staff_assign_sponsor_package: {
        Args: { p_member_id: string; p_package_slug: string }
        Returns: Json
      }
      staff_set_majlis_presented_by: {
        Args: { p_event_id: string; p_member_id: string | null; p_label: string }
        Returns: Json
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
