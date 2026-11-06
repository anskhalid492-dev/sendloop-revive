export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          detail: Json
          id: string
          target_id: string | null
          target_label: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_label?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          channel: string
          created_at: string
          destination: string
          detail: Json
          duration_ms: number | null
          error: string | null
          id: string
          kind: string
          response_code: number | null
          status: string
          title: string
        }
        Insert: {
          channel: string
          created_at?: string
          destination: string
          detail?: Json
          duration_ms?: number | null
          error?: string | null
          id?: string
          kind: string
          response_code?: number | null
          status?: string
          title: string
        }
        Update: {
          channel?: string
          created_at?: string
          destination?: string
          detail?: Json
          duration_ms?: number | null
          error?: string | null
          id?: string
          kind?: string
          response_code?: number | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      admin_permission_grants: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          permission: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_rate_limits: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_start?: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      admin_security_events: {
        Row: {
          created_at: string
          detail: string | null
          email: string | null
          event_type: string
          id: string
          ip: string | null
          result: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          email?: string | null
          event_type: string
          id?: string
          ip?: string | null
          result?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          email?: string | null
          event_type?: string
          id?: string
          ip?: string | null
          result?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_sessions: {
        Row: {
          aal: string | null
          created_at: string
          id: string
          ip: string | null
          last_seen_at: string
          revoked_at: string | null
          revoked_by: string | null
          session_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          aal?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          session_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aal?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      affiliate_adjustments: {
        Row: {
          actor_id: string | null
          commission_id: string
          created_at: string
          delta_cents: number
          event_key: string
          id: string
          payment_key: string
          reason: string
        }
        Insert: {
          actor_id?: string | null
          commission_id: string
          created_at?: string
          delta_cents: number
          event_key: string
          id?: string
          payment_key: string
          reason: string
        }
        Update: {
          actor_id?: string | null
          commission_id?: string
          created_at?: string
          delta_cents?: number
          event_key?: string
          id?: string
          payment_key?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_adjustments_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "referral_commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_adjustments_payment_key_fkey"
            columns: ["payment_key"]
            isOneToOne: false
            referencedRelation: "affiliate_payments"
            referencedColumns: ["payment_key"]
          },
        ]
      }
      affiliate_balance_adjustments: {
        Row: {
          actor_id: string
          after_cents: number
          before_cents: number
          created_at: string
          delta_cents: number
          environment: string
          id: string
          reason: string
          referral_profile_id: string
          request_key: string
        }
        Insert: {
          actor_id: string
          after_cents: number
          before_cents: number
          created_at?: string
          delta_cents: number
          environment: string
          id?: string
          reason: string
          referral_profile_id: string
          request_key: string
        }
        Update: {
          actor_id?: string
          after_cents?: number
          before_cents?: number
          created_at?: string
          delta_cents?: number
          environment?: string
          id?: string
          reason?: string
          referral_profile_id?: string
          request_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_balance_adjustments_referral_profile_id_fkey"
            columns: ["referral_profile_id"]
            isOneToOne: false
            referencedRelation: "referral_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_event_receipts: {
        Row: {
          created_at: string
          event_key: string
          result: string
        }
        Insert: {
          created_at?: string
          event_key: string
          result: string
        }
        Update: {
          created_at?: string
          event_key?: string
          result?: string
        }
        Relationships: []
      }
      affiliate_payments: {
        Row: {
          attribution_id: string | null
          commission_id: string | null
          created_at: string
          currency: string
          customer_id: string | null
          disputed: boolean
          eligible_cents: number
          environment: string
          invoice_id: string | null
          paid_cents: number
          payment_id: string
          payment_key: string
          period_key: string | null
          purchase_kind: string | null
          refunded_cents: number
          updated_at: string
        }
        Insert: {
          attribution_id?: string | null
          commission_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          disputed?: boolean
          eligible_cents?: number
          environment: string
          invoice_id?: string | null
          paid_cents?: number
          payment_id: string
          payment_key: string
          period_key?: string | null
          purchase_kind?: string | null
          refunded_cents?: number
          updated_at?: string
        }
        Update: {
          attribution_id?: string | null
          commission_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          disputed?: boolean
          eligible_cents?: number
          environment?: string
          invoice_id?: string | null
          paid_cents?: number
          payment_id?: string
          payment_key?: string
          period_key?: string | null
          purchase_kind?: string | null
          refunded_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payments_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "referral_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_payments_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "referral_commissions"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payout_allocations: {
        Row: {
          amount_cents: number
          commission_id: string
          created_at: string
          payout_id: string
        }
        Insert: {
          amount_cents: number
          commission_id: string
          created_at?: string
          payout_id: string
        }
        Update: {
          amount_cents?: number
          commission_id?: string
          created_at?: string
          payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payout_allocations_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "referral_commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_payout_allocations_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "referral_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payout_proofs: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string
          object_key: string
          payout_id: string
          size: number
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          object_key: string
          payout_id: string
          size: number
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          object_key?: string
          payout_id?: string
          size?: number
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payout_proofs_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "referral_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_wallets: {
        Row: {
          address: string
          network: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          network: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          network?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_personalizations: {
        Row: {
          accepted: boolean
          attempts: number
          campaign_id: string
          completed_at: string | null
          content: string | null
          created_at: string
          data_used: string[]
          edited: boolean
          error: string | null
          id: string
          instructions: string
          lead_id: string
          locked_by: string | null
          locked_until: string | null
          model: string | null
          pain_points: Json
          prompt_hash: string
          quality: string
          started_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted?: boolean
          attempts?: number
          campaign_id: string
          completed_at?: string | null
          content?: string | null
          created_at?: string
          data_used?: string[]
          edited?: boolean
          error?: string | null
          id?: string
          instructions?: string
          lead_id: string
          locked_by?: string | null
          locked_until?: string | null
          model?: string | null
          pain_points?: Json
          prompt_hash?: string
          quality?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted?: boolean
          attempts?: number
          campaign_id?: string
          completed_at?: string | null
          content?: string | null
          created_at?: string
          data_used?: string[]
          edited?: boolean
          error?: string | null
          id?: string
          instructions?: string
          lead_id?: string
          locked_by?: string | null
          locked_until?: string | null
          model?: string | null
          pain_points?: Json
          prompt_hash?: string
          quality?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_personalizations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_personalizations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_personalizations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_runner_state: {
        Row: {
          key: string
          last_run_at: string | null
          locked_by: string | null
          locked_until: string | null
          paused_at: string | null
          paused_reason: string | null
          updated_at: string
        }
        Insert: {
          key: string
          last_run_at?: string | null
          locked_by?: string | null
          locked_until?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          updated_at?: string
        }
        Update: {
          key?: string
          last_run_at?: string | null
          locked_by?: string | null
          locked_until?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      api_idempotency_keys: {
        Row: {
          api_key_id: string | null
          created_at: string
          endpoint: string
          id: string
          idempotency_key: string
          request_fingerprint: string
          response_body: Json | null
          state: string
          status_code: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          endpoint: string
          id?: string
          idempotency_key: string
          request_fingerprint: string
          response_body?: Json | null
          state?: string
          status_code?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          idempotency_key?: string
          request_fingerprint?: string
          response_body?: Json | null
          state?: string
          status_code?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_idempotency_keys_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_idempotency_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      api_jobs: {
        Row: {
          api_key_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          kind: string
          params: Json
          progress: number
          result: Json | null
          started_at: string | null
          status: string
          total: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          api_key_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          kind: string
          params?: Json
          progress?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          total?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          api_key_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          kind?: string
          params?: Json
          progress?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          total?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_jobs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          rate_limit_per_minute: number
          revoked_at: string | null
          scopes: string[]
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          rate_limit_per_minute?: number
          revoked_at?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          rate_limit_per_minute?: number
          revoked_at?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_counters: {
        Row: {
          api_key_id: string
          request_count: number
          window_start: string
        }
        Insert: {
          api_key_id: string
          request_count?: number
          window_start: string
        }
        Update: {
          api_key_id?: string
          request_count?: number
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_rate_counters_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      appsumo_codes: {
        Row: {
          batch: string
          code: string
          created_at: string | null
          id: string
          plan: string
          redeemed_at: string | null
          redeemed_by: string | null
          redeemed_email: string | null
          redeemed_workspace_id: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          subscription_id: string | null
        }
        Insert: {
          batch?: string
          code: string
          created_at?: string | null
          id?: string
          plan?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          redeemed_email?: string | null
          redeemed_workspace_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          subscription_id?: string | null
        }
        Update: {
          batch?: string
          code?: string
          created_at?: string | null
          id?: string
          plan?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          redeemed_email?: string | null
          redeemed_workspace_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appsumo_codes_redeemed_workspace_id_fkey"
            columns: ["redeemed_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appsumo_codes_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "billing_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      appsumo_redemption_logs: {
        Row: {
          action: string | null
          code: string | null
          code_id: string | null
          created_at: string | null
          email: string | null
          failure_reason: string | null
          id: string
          ip_address: string | null
          success: boolean | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          code?: string | null
          code_id?: string | null
          created_at?: string | null
          email?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          code?: string | null
          code_id?: string | null
          created_at?: string | null
          email?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      automation_events: {
        Row: {
          campaign_id: string | null
          conversation_id: string | null
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          lead_id: string | null
          matched_automations: number
          payload: Json
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          conversation_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          lead_id?: string | null
          matched_automations?: number
          payload?: Json
          workspace_id: string
        }
        Update: {
          campaign_id?: string | null
          conversation_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          lead_id?: string | null
          matched_automations?: number
          payload?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_run_steps: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          label: string
          output: Json
          position: number
          run_id: string
          started_at: string
          status: string
          step_id: string | null
          workspace_id: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          label: string
          output?: Json
          position: number
          run_id: string
          started_at?: string
          status: string
          step_id?: string | null
          workspace_id: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          label?: string
          output?: Json
          position?: number
          run_id?: string
          started_at?: string
          status?: string
          step_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_run_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          attempts: number
          automation_id: string
          automation_version: number
          branch: string | null
          campaign_id: string | null
          completed_at: string | null
          created_at: string
          current_step: number
          definition: Json
          error: string | null
          event_id: string | null
          id: string
          lead_id: string | null
          locked_at: string | null
          locked_by: string | null
          metadata: Json
          result: string | null
          resume_at: string | null
          started_at: string | null
          status: string
          trigger_type: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          automation_id: string
          automation_version?: number
          branch?: string | null
          campaign_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: number
          definition?: Json
          error?: string | null
          event_id?: string | null
          id?: string
          lead_id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json
          result?: string | null
          resume_at?: string | null
          started_at?: string | null
          status?: string
          trigger_type: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          automation_id?: string
          automation_version?: number
          branch?: string | null
          campaign_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: number
          definition?: Json
          error?: string | null
          event_id?: string | null
          id?: string
          lead_id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json
          result?: string | null
          resume_at?: string | null
          started_at?: string | null
          status?: string
          trigger_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "automation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_steps: {
        Row: {
          automation_id: string
          branch: string | null
          config: Json
          created_at: string
          id: string
          kind: string
          position: number
          workspace_id: string
        }
        Insert: {
          automation_id: string
          branch?: string | null
          config?: Json
          created_at?: string
          id?: string
          kind: string
          position: number
          workspace_id: string
        }
        Update: {
          automation_id?: string
          branch?: string | null
          config?: Json
          created_at?: string
          id?: string
          kind?: string
          position?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_steps_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          condition_logic: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_run_at: string | null
          name: string
          status: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
          version: number
          webhook_secret: string | null
          webhook_token: string | null
          workspace_id: string
        }
        Insert: {
          condition_logic?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_run_at?: string | null
          name: string
          status?: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
          version?: number
          webhook_secret?: string | null
          webhook_token?: string | null
          workspace_id: string
        }
        Update: {
          condition_logic?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_run_at?: string | null
          name?: string
          status?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          version?: number
          webhook_secret?: string | null
          webhook_token?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          job_type: string
          last_error: string | null
          lease_owner: string | null
          lease_until: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          started_at: string | null
          status: string
          updated_at: string
          worker: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          job_type: string
          last_error?: string | null
          lease_owner?: string | null
          lease_until?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
          worker: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          job_type?: string
          last_error?: string | null
          lease_owner?: string | null
          lease_until?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
          worker?: string
        }
        Relationships: []
      }
      billing_audit_log: {
        Row: {
          action: string
          created_at: string
          detail: Json
          environment: Database["public"]["Enums"]["billing_environment"] | null
          event_id: string | null
          id: string
          provider: Database["public"]["Enums"]["billing_provider"] | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          environment?:
            | Database["public"]["Enums"]["billing_environment"]
            | null
          event_id?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["billing_provider"] | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          environment?:
            | Database["public"]["Enums"]["billing_environment"]
            | null
          event_id?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["billing_provider"] | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          created_at: string
          email: string | null
          environment: Database["public"]["Enums"]["billing_environment"]
          external_customer_id: string
          id: string
          provider: Database["public"]["Enums"]["billing_provider"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          environment: Database["public"]["Enums"]["billing_environment"]
          external_customer_id: string
          id?: string
          provider: Database["public"]["Enums"]["billing_provider"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          environment?: Database["public"]["Enums"]["billing_environment"]
          external_customer_id?: string
          id?: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          environment: Database["public"]["Enums"]["billing_environment"]
          external_invoice_id: string
          hosted_url: string | null
          id: string
          issued_at: string
          number: string | null
          pdf_url: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          status: string
          subscription_id: string | null
          workspace_id: string | null
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          environment: Database["public"]["Enums"]["billing_environment"]
          external_invoice_id: string
          hosted_url?: string | null
          id?: string
          issued_at?: string
          number?: string | null
          pdf_url?: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          status?: string
          subscription_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          environment?: Database["public"]["Enums"]["billing_environment"]
          external_invoice_id?: string
          hosted_url?: string | null
          id?: string
          issued_at?: string
          number?: string | null
          pdf_url?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"]
          status?: string
          subscription_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "billing_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plan_prices: {
        Row: {
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          created_at: string
          currency: string
          environment: Database["public"]["Enums"]["billing_environment"]
          external_price_id: string
          id: string
          plan_id: string
          provider: Database["public"]["Enums"]["billing_provider"]
          updated_at: string
        }
        Insert: {
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          created_at?: string
          currency?: string
          environment: Database["public"]["Enums"]["billing_environment"]
          external_price_id: string
          id?: string
          plan_id: string
          provider: Database["public"]["Enums"]["billing_provider"]
          updated_at?: string
        }
        Update: {
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          created_at?: string
          currency?: string
          environment?: Database["public"]["Enums"]["billing_environment"]
          external_price_id?: string
          id?: string
          plan_id?: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_plan_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_provider_secrets: {
        Row: {
          ciphertext: string
          created_at: string
          environment: string
          meta: Json
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ciphertext: string
          created_at?: string
          environment: string
          meta?: Json
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ciphertext?: string
          created_at?: string
          environment?: string
          meta?: Json
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      billing_providers: {
        Row: {
          created_at: string
          environment: Database["public"]["Enums"]["billing_environment"]
          id: string
          is_enabled: boolean
          last_error: string | null
          last_error_at: string | null
          last_payment_at: string | null
          last_webhook_at: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          public_config: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          environment: Database["public"]["Enums"]["billing_environment"]
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_payment_at?: string | null
          last_webhook_at?: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          public_config?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          environment?: Database["public"]["Enums"]["billing_environment"]
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_payment_at?: string | null
          last_webhook_at?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"]
          public_config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      billing_subscriptions: {
        Row: {
          access_until: string | null
          amount_cents: number
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          environment: Database["public"]["Enums"]["billing_environment"]
          external_customer_id: string | null
          external_subscription_id: string
          grace_until: string | null
          id: string
          last_event_at: string | null
          manual_assigned_at: string | null
          manual_assigned_by: string | null
          manual_note: string | null
          manual_override: boolean
          pending_effective_at: string | null
          pending_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          pending_plan_id: string | null
          plan_id: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          status: Database["public"]["Enums"]["billing_sub_status"]
          trial_ends_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_until?: string | null
          amount_cents?: number
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment: Database["public"]["Enums"]["billing_environment"]
          external_customer_id?: string | null
          external_subscription_id: string
          grace_until?: string | null
          id?: string
          last_event_at?: string | null
          manual_assigned_at?: string | null
          manual_assigned_by?: string | null
          manual_note?: string | null
          manual_override?: boolean
          pending_effective_at?: string | null
          pending_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          pending_plan_id?: string | null
          plan_id?: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          status?: Database["public"]["Enums"]["billing_sub_status"]
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_until?: string | null
          amount_cents?: number
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: Database["public"]["Enums"]["billing_environment"]
          external_customer_id?: string | null
          external_subscription_id?: string
          grace_until?: string | null
          id?: string
          last_event_at?: string | null
          manual_assigned_at?: string | null
          manual_assigned_by?: string | null
          manual_note?: string | null
          manual_override?: boolean
          pending_effective_at?: string | null
          pending_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          pending_plan_id?: string | null
          plan_id?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"]
          status?: Database["public"]["Enums"]["billing_sub_status"]
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_pending_plan_id_fkey"
            columns: ["pending_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          description: string | null
          environment: Database["public"]["Enums"]["billing_environment"]
          external_transaction_id: string
          id: string
          kind: string
          occurred_at: string
          plan_id: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          provider_event_id: string | null
          status: string
          subscription_id: string | null
          workspace_id: string | null
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          description?: string | null
          environment: Database["public"]["Enums"]["billing_environment"]
          external_transaction_id: string
          id?: string
          kind?: string
          occurred_at?: string
          plan_id?: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          provider_event_id?: string | null
          status?: string
          subscription_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          description?: string | null
          environment?: Database["public"]["Enums"]["billing_environment"]
          external_transaction_id?: string
          id?: string
          kind?: string
          occurred_at?: string
          plan_id?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"]
          provider_event_id?: string | null
          status?: string
          subscription_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_transactions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "billing_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_webhook_events: {
        Row: {
          environment: Database["public"]["Enums"]["billing_environment"]
          error: string | null
          event_id: string
          event_type: string | null
          http_status: number | null
          id: string
          payload: Json | null
          processed_at: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          received_at: string
          retry_count: number
          signature_ok: boolean
          status: string
        }
        Insert: {
          environment: Database["public"]["Enums"]["billing_environment"]
          error?: string | null
          event_id: string
          event_type?: string | null
          http_status?: number | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          received_at?: string
          retry_count?: number
          signature_ok?: boolean
          status?: string
        }
        Update: {
          environment?: Database["public"]["Enums"]["billing_environment"]
          error?: string | null
          event_id?: string
          event_type?: string | null
          http_status?: number | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"]
          received_at?: string
          retry_count?: number
          signature_ok?: boolean
          status?: string
        }
        Relationships: []
      }
      birthday_gifts: {
        Row: {
          created_at: string
          email_status: string
          email_to: string | null
          gift_date: string
          gift_year: number
          grant_error: string | null
          grant_expires_at: string | null
          granted: boolean
          id: string
          plan_grant_id: string | null
          plan_id: string | null
          timezone: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          email_status?: string
          email_to?: string | null
          gift_date: string
          gift_year: number
          grant_error?: string | null
          grant_expires_at?: string | null
          granted?: boolean
          id?: string
          plan_grant_id?: string | null
          plan_id?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          email_status?: string
          email_to?: string | null
          gift_date?: string
          gift_year?: number
          grant_error?: string | null
          grant_expires_at?: string | null
          granted?: boolean
          id?: string
          plan_grant_id?: string | null
          plan_id?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birthday_gifts_plan_grant_id_fkey"
            columns: ["plan_grant_id"]
            isOneToOne: false
            referencedRelation: "plan_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthday_gifts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthday_gifts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_authors: {
        Row: {
          avatar_url: string | null
          bio: string
          canonical_url: string | null
          certifications: string
          company: string
          cover_image_url: string | null
          created_at: string
          experience: string
          expertise: string[]
          featured_quote: string
          full_bio: string
          id: string
          introduction: string
          languages: string
          linkedin_url: string
          location: string
          meta_description: string | null
          name: string
          noindex: boolean
          og_image_url: string | null
          public_email: string
          role: string
          seo_title: string | null
          show_email: boolean
          slug: string
          topics: string[]
          updated_at: string
          website_url: string
          x_url: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          canonical_url?: string | null
          certifications?: string
          company?: string
          cover_image_url?: string | null
          created_at?: string
          experience?: string
          expertise?: string[]
          featured_quote?: string
          full_bio?: string
          id?: string
          introduction?: string
          languages?: string
          linkedin_url?: string
          location?: string
          meta_description?: string | null
          name: string
          noindex?: boolean
          og_image_url?: string | null
          public_email?: string
          role?: string
          seo_title?: string | null
          show_email?: boolean
          slug: string
          topics?: string[]
          updated_at?: string
          website_url?: string
          x_url?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          canonical_url?: string | null
          certifications?: string
          company?: string
          cover_image_url?: string | null
          created_at?: string
          experience?: string
          expertise?: string[]
          featured_quote?: string
          full_bio?: string
          id?: string
          introduction?: string
          languages?: string
          linkedin_url?: string
          location?: string
          meta_description?: string | null
          name?: string
          noindex?: boolean
          og_image_url?: string | null
          public_email?: string
          role?: string
          seo_title?: string | null
          show_email?: boolean
          slug?: string
          topics?: string[]
          updated_at?: string
          website_url?: string
          x_url?: string
        }
        Relationships: []
      }
      blog_categories: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      blog_media: {
        Row: {
          alt_text: string
          caption: string
          created_at: string
          file_name: string
          folder: string
          id: string
          mime_type: string
          public_url: string
          size_bytes: number
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          alt_text?: string
          caption?: string
          created_at?: string
          file_name: string
          folder?: string
          id?: string
          mime_type?: string
          public_url: string
          size_bytes?: number
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          alt_text?: string
          caption?: string
          created_at?: string
          file_name?: string
          folder?: string
          id?: string
          mime_type?: string
          public_url?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      blog_post_slugs: {
        Row: {
          created_at: string
          id: string
          post_id: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_slugs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: string | null
          canonical_url: string | null
          category_id: string | null
          content: string
          content_format: string
          content_type: Database["public"]["Enums"]["blog_content_type"]
          cover_image_url: string | null
          created_at: string
          excerpt: string
          featured: boolean
          id: string
          meta_description: string | null
          og_image_url: string | null
          popular_guide: boolean
          published_at: string | null
          reading_minutes: number
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["blog_post_status"]
          subtitle: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content?: string
          content_format?: string
          content_type?: Database["public"]["Enums"]["blog_content_type"]
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string
          featured?: boolean
          id?: string
          meta_description?: string | null
          og_image_url?: string | null
          popular_guide?: boolean
          published_at?: string | null
          reading_minutes?: number
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["blog_post_status"]
          subtitle?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content?: string
          content_format?: string
          content_type?: Database["public"]["Enums"]["blog_content_type"]
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string
          featured?: boolean
          id?: string
          meta_description?: string | null
          og_image_url?: string | null
          popular_guide?: boolean
          published_at?: string | null
          reading_minutes?: number
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["blog_post_status"]
          subtitle?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "blog_authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          admin_note: string | null
          created_at: string
          details: string
          id: string
          screenshot_name: string | null
          screenshot_path: string | null
          screenshot_size: number | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          details: string
          id?: string
          screenshot_name?: string | null
          screenshot_path?: string | null
          screenshot_size?: number | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          details?: string
          id?: string
          screenshot_name?: string | null
          screenshot_path?: string | null
          screenshot_size?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      campaign_launch_events: {
        Row: {
          active_mailboxes: number
          actor_id: string | null
          already_queued: number
          audience: number
          campaign_id: string
          created_at: string
          eligible: number
          error_message: string | null
          first_send_at: string | null
          id: string
          issues: Json
          list_id: string | null
          list_name: string | null
          outcome: string
          queued_messages: number
          ready: boolean
          total_recipients: number
          workspace_id: string
        }
        Insert: {
          active_mailboxes?: number
          actor_id?: string | null
          already_queued?: number
          audience?: number
          campaign_id: string
          created_at?: string
          eligible?: number
          error_message?: string | null
          first_send_at?: string | null
          id?: string
          issues?: Json
          list_id?: string | null
          list_name?: string | null
          outcome?: string
          queued_messages?: number
          ready?: boolean
          total_recipients?: number
          workspace_id: string
        }
        Update: {
          active_mailboxes?: number
          actor_id?: string | null
          already_queued?: number
          audience?: number
          campaign_id?: string
          created_at?: string
          eligible?: number
          error_message?: string | null
          first_send_at?: string | null
          id?: string
          issues?: Json
          list_id?: string | null
          list_name?: string | null
          outcome?: string
          queued_messages?: number
          ready?: boolean
          total_recipients?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_launch_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_launch_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_messages: {
        Row: {
          attempts: number
          body: string
          bounce_reason: string | null
          bounced_at: string | null
          campaign_id: string
          cancelled_reason: string | null
          clicked_at: string | null
          complained_at: string | null
          created_at: string
          delayed_at: string | null
          delivered_at: string | null
          delivery_detail: string | null
          delivery_status: string
          failed_at: string | null
          final_body: string | null
          final_from_email: string | null
          final_from_name: string | null
          final_html: string | null
          final_subject: string | null
          final_to_email: string | null
          id: string
          last_error: string | null
          last_event_at: string | null
          lead_id: string | null
          message_id: string | null
          message_type: string
          open_count: number
          opened_at: string | null
          provider: string | null
          provider_message_id: string | null
          recipient_id: string | null
          reconciled_at: string | null
          rendered_at: string | null
          replied_at: string | null
          scheduled_at: string | null
          sending_account_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["message_status"]
          step_id: string | null
          step_order: number
          subject: string
          to_email: string
          unsubscribed_at: string | null
          updated_at: string
          variant_id: string | null
          workspace_id: string
        }
        Insert: {
          attempts?: number
          body?: string
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_id: string
          cancelled_reason?: string | null
          clicked_at?: string | null
          complained_at?: string | null
          created_at?: string
          delayed_at?: string | null
          delivered_at?: string | null
          delivery_detail?: string | null
          delivery_status?: string
          failed_at?: string | null
          final_body?: string | null
          final_from_email?: string | null
          final_from_name?: string | null
          final_html?: string | null
          final_subject?: string | null
          final_to_email?: string | null
          id?: string
          last_error?: string | null
          last_event_at?: string | null
          lead_id?: string | null
          message_id?: string | null
          message_type?: string
          open_count?: number
          opened_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient_id?: string | null
          reconciled_at?: string | null
          rendered_at?: string | null
          replied_at?: string | null
          scheduled_at?: string | null
          sending_account_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          step_id?: string | null
          step_order?: number
          subject?: string
          to_email: string
          unsubscribed_at?: string | null
          updated_at?: string
          variant_id?: string | null
          workspace_id: string
        }
        Update: {
          attempts?: number
          body?: string
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_id?: string
          cancelled_reason?: string | null
          clicked_at?: string | null
          complained_at?: string | null
          created_at?: string
          delayed_at?: string | null
          delivered_at?: string | null
          delivery_detail?: string | null
          delivery_status?: string
          failed_at?: string | null
          final_body?: string | null
          final_from_email?: string | null
          final_from_name?: string | null
          final_html?: string | null
          final_subject?: string | null
          final_to_email?: string | null
          id?: string
          last_error?: string | null
          last_event_at?: string | null
          lead_id?: string | null
          message_id?: string | null
          message_type?: string
          open_count?: number
          opened_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient_id?: string | null
          reconciled_at?: string | null
          rendered_at?: string | null
          replied_at?: string | null
          scheduled_at?: string | null
          sending_account_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          step_id?: string | null
          step_order?: number
          subject?: string
          to_email?: string
          unsubscribed_at?: string | null
          updated_at?: string
          variant_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "campaign_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "campaign_step_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          bounce_reason: string | null
          bounced_at: string | null
          campaign_id: string
          created_at: string
          current_step: number
          id: string
          last_error: string | null
          last_sent_at: string | null
          lead_id: string
          next_send_at: string | null
          sending_account_id: string | null
          status: Database["public"]["Enums"]["recipient_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_id: string
          created_at?: string
          current_step?: number
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          lead_id: string
          next_send_at?: string | null
          sending_account_id?: string | null
          status?: Database["public"]["Enums"]["recipient_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_id?: string
          created_at?: string
          current_step?: number
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          lead_id?: string
          next_send_at?: string | null
          sending_account_id?: string | null
          status?: Database["public"]["Enums"]["recipient_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_replies: {
        Row: {
          body: string | null
          campaign_id: string | null
          created_at: string
          created_by: string | null
          from_email: string
          id: string
          lead_id: string | null
          message_id: string | null
          received_at: string
          sending_account_id: string | null
          sentiment: string
          subject: string | null
          to_email: string | null
          workspace_id: string
        }
        Insert: {
          body?: string | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          from_email: string
          id?: string
          lead_id?: string | null
          message_id?: string | null
          received_at?: string
          sending_account_id?: string | null
          sentiment?: string
          subject?: string | null
          to_email?: string | null
          workspace_id: string
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          from_email?: string
          id?: string
          lead_id?: string | null
          message_id?: string | null
          received_at?: string
          sending_account_id?: string | null
          sentiment?: string
          subject?: string | null
          to_email?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_replies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_replies_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "campaign_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_replies_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_replies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_step_variants: {
        Row: {
          body: string
          campaign_id: string
          created_at: string
          id: string
          label: string
          step_id: string
          subject: string
          updated_at: string
          weight: number
          workspace_id: string
        }
        Insert: {
          body?: string
          campaign_id: string
          created_at?: string
          id?: string
          label?: string
          step_id: string
          subject?: string
          updated_at?: string
          weight?: number
          workspace_id: string
        }
        Update: {
          body?: string
          campaign_id?: string
          created_at?: string
          id?: string
          label?: string
          step_id?: string
          subject?: string
          updated_at?: string
          weight?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_step_variants_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_step_variants_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "campaign_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_step_variants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_steps: {
        Row: {
          body: string
          campaign_id: string
          config: Json
          created_at: string
          delay_minutes: number
          id: string
          name: string
          same_thread: boolean
          step_order: number
          step_type: string
          subject: string
          updated_at: string
          wait_days: number
          wait_hours: number
          workspace_id: string
        }
        Insert: {
          body?: string
          campaign_id: string
          config?: Json
          created_at?: string
          delay_minutes?: number
          id?: string
          name?: string
          same_thread?: boolean
          step_order: number
          step_type?: string
          subject?: string
          updated_at?: string
          wait_days?: number
          wait_hours?: number
          workspace_id: string
        }
        Update: {
          body?: string
          campaign_id?: string
          config?: Json
          created_at?: string
          delay_minutes?: number
          id?: string
          name?: string
          same_thread?: boolean
          step_order?: number
          step_type?: string
          subject?: string
          updated_at?: string
          wait_days?: number
          wait_hours?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_test_sends: {
        Row: {
          campaign_id: string
          created_at: string
          error: string | null
          id: string
          provider: string
          provider_message_id: string | null
          provider_response: string | null
          recipient_email: string
          request_id: string
          requested_by: string
          sending_account_id: string | null
          status: string
          updated_at: string
          webhook_event_id: string | null
          webhook_event_type: string | null
          webhook_received_at: string | null
          webhook_status: string | null
          workspace_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          error?: string | null
          id?: string
          provider: string
          provider_message_id?: string | null
          provider_response?: string | null
          recipient_email: string
          request_id?: string
          requested_by: string
          sending_account_id?: string | null
          status?: string
          updated_at?: string
          webhook_event_id?: string | null
          webhook_event_type?: string | null
          webhook_received_at?: string | null
          webhook_status?: string | null
          workspace_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          error?: string | null
          id?: string
          provider?: string
          provider_message_id?: string | null
          provider_response?: string | null
          recipient_email?: string
          request_id?: string
          requested_by?: string
          sending_account_id?: string | null
          status?: string
          updated_at?: string
          webhook_event_id?: string | null
          webhook_event_type?: string | null
          webhook_received_at?: string | null
          webhook_status?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_test_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_test_sends_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_test_sends_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: false
            referencedRelation: "email_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_test_sends_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_unsubscribes: {
        Row: {
          campaign_id: string | null
          created_at: string
          email: string
          id: string
          recipient_id: string | null
          source: string
          updated_at: string
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          email: string
          id?: string
          recipient_id?: string | null
          source?: string
          updated_at?: string
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          email?: string
          id?: string
          recipient_id?: string | null
          source?: string
          updated_at?: string
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_unsubscribes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_unsubscribes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ai_config: Json
          ai_enabled: boolean
          ai_writer_brief: Json
          audience_count: number
          business_days_only: boolean
          click_tracking: boolean
          created_at: string
          created_by: string
          custom_variables: Json
          daily_cap: number
          description: string | null
          eligible_count: number
          email_send_limit: number
          emails_sent_count: number
          end_at: string | null
          id: string
          inbox_rotation_enabled: boolean
          inbox_rotation_strategy: string
          launched_at: string | null
          limit_reached_at: string | null
          list_id: string | null
          max_contacts_per_company: number
          max_per_hour: number
          min_delay_minutes: number
          name: string
          open_tracking: boolean
          pause_reason: string | null
          paused_at: string | null
          random_delay_minutes: number
          readiness_checked_at: string | null
          readiness_issues: Json
          readiness_ready: boolean
          rotation_daily_cap_per_inbox: number
          send_days: number[]
          send_end_hour: number
          send_start_hour: number
          sending_account_ids: string[]
          start_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          stop_on_company_reply: boolean
          stop_on_reply: boolean
          tags: string[]
          text_only: boolean
          timezone: string
          unsubscribe_enabled: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_config?: Json
          ai_enabled?: boolean
          ai_writer_brief?: Json
          audience_count?: number
          business_days_only?: boolean
          click_tracking?: boolean
          created_at?: string
          created_by: string
          custom_variables?: Json
          daily_cap?: number
          description?: string | null
          eligible_count?: number
          email_send_limit?: number
          emails_sent_count?: number
          end_at?: string | null
          id?: string
          inbox_rotation_enabled?: boolean
          inbox_rotation_strategy?: string
          launched_at?: string | null
          limit_reached_at?: string | null
          list_id?: string | null
          max_contacts_per_company?: number
          max_per_hour?: number
          min_delay_minutes?: number
          name: string
          open_tracking?: boolean
          pause_reason?: string | null
          paused_at?: string | null
          random_delay_minutes?: number
          readiness_checked_at?: string | null
          readiness_issues?: Json
          readiness_ready?: boolean
          rotation_daily_cap_per_inbox?: number
          send_days?: number[]
          send_end_hour?: number
          send_start_hour?: number
          sending_account_ids?: string[]
          start_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          stop_on_company_reply?: boolean
          stop_on_reply?: boolean
          tags?: string[]
          text_only?: boolean
          timezone?: string
          unsubscribe_enabled?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_config?: Json
          ai_enabled?: boolean
          ai_writer_brief?: Json
          audience_count?: number
          business_days_only?: boolean
          click_tracking?: boolean
          created_at?: string
          created_by?: string
          custom_variables?: Json
          daily_cap?: number
          description?: string | null
          eligible_count?: number
          email_send_limit?: number
          emails_sent_count?: number
          end_at?: string | null
          id?: string
          inbox_rotation_enabled?: boolean
          inbox_rotation_strategy?: string
          launched_at?: string | null
          limit_reached_at?: string | null
          list_id?: string | null
          max_contacts_per_company?: number
          max_per_hour?: number
          min_delay_minutes?: number
          name?: string
          open_tracking?: boolean
          pause_reason?: string | null
          paused_at?: string | null
          random_delay_minutes?: number
          readiness_checked_at?: string | null
          readiness_issues?: Json
          readiness_ready?: boolean
          rotation_daily_cap_per_inbox?: number
          send_days?: number[]
          send_end_hour?: number
          send_start_hour?: number
          sending_account_ids?: string[]
          start_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          stop_on_company_reply?: boolean
          stop_on_reply?: boolean
          tags?: string[]
          text_only?: boolean
          timezone?: string
          unsubscribe_enabled?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lead_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_events: {
        Row: {
          actor_id: string | null
          conversation_id: string
          created_at: string
          dedupe_key: string | null
          detail: string | null
          id: string
          type: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          conversation_id: string
          created_at?: string
          dedupe_key?: string | null
          detail?: string | null
          id?: string
          type: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          conversation_id?: string
          created_at?: string
          dedupe_key?: string | null
          detail?: string | null
          id?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          attachments: Json
          bcc_emails: string[]
          body: string
          campaign_message_id: string | null
          cc_emails: string[]
          clicked_at: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          delivery_detail: string | null
          delivery_status: string
          direction: string
          first_opened_at: string | null
          from_email: string
          from_name: string | null
          html: string | null
          id: string
          in_reply_to: string | null
          message_id: string | null
          occurred_at: string
          open_count: number
          opened_at: string | null
          provider_message_id: string | null
          reference_ids: string[]
          sending_account_id: string | null
          subject: string
          to_email: string
          workspace_id: string
        }
        Insert: {
          attachments?: Json
          bcc_emails?: string[]
          body?: string
          campaign_message_id?: string | null
          cc_emails?: string[]
          clicked_at?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          delivery_detail?: string | null
          delivery_status?: string
          direction: string
          first_opened_at?: string | null
          from_email: string
          from_name?: string | null
          html?: string | null
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          occurred_at?: string
          open_count?: number
          opened_at?: string | null
          provider_message_id?: string | null
          reference_ids?: string[]
          sending_account_id?: string | null
          subject?: string
          to_email: string
          workspace_id: string
        }
        Update: {
          attachments?: Json
          bcc_emails?: string[]
          body?: string
          campaign_message_id?: string | null
          cc_emails?: string[]
          clicked_at?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          delivery_detail?: string | null
          delivery_status?: string
          direction?: string
          first_opened_at?: string | null
          from_email?: string
          from_name?: string | null
          html?: string | null
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          occurred_at?: string
          open_count?: number
          opened_at?: string | null
          provider_message_id?: string | null
          reference_ids?: string[]
          sending_account_id?: string | null
          subject?: string
          to_email?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_campaign_message_id_fkey"
            columns: ["campaign_message_id"]
            isOneToOne: false
            referencedRelation: "campaign_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_notes: {
        Row: {
          author_id: string
          body: string
          conversation_id: string
          created_at: string
          id: string
          mentions: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_id: string
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          mentions?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author_id?: string
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          mentions?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          archived: boolean
          assigned_to: string | null
          campaign_id: string | null
          created_at: string
          has_inbound: boolean
          has_outbound: boolean
          id: string
          last_direction: string
          last_inbound_at: string | null
          last_message_at: string
          last_preview: string | null
          lead_id: string | null
          message_count: number
          prospect_email: string
          sending_account_id: string | null
          snoozed_until: string | null
          starred: boolean
          status: string
          subject: string
          tags: string[]
          thread_key: string
          unread: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived?: boolean
          assigned_to?: string | null
          campaign_id?: string | null
          created_at?: string
          has_inbound?: boolean
          has_outbound?: boolean
          id?: string
          last_direction?: string
          last_inbound_at?: string | null
          last_message_at?: string
          last_preview?: string | null
          lead_id?: string | null
          message_count?: number
          prospect_email: string
          sending_account_id?: string | null
          snoozed_until?: string | null
          starred?: boolean
          status?: string
          subject?: string
          tags?: string[]
          thread_key: string
          unread?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived?: boolean
          assigned_to?: string | null
          campaign_id?: string | null
          created_at?: string
          has_inbound?: boolean
          has_outbound?: boolean
          id?: string
          last_direction?: string
          last_inbound_at?: string | null
          last_message_at?: string
          last_preview?: string | null
          lead_id?: string | null
          message_count?: number
          prospect_email?: string
          sending_account_id?: string | null
          snoozed_until?: string | null
          starred?: boolean
          status?: string
          subject?: string
          tags?: string[]
          thread_key?: string
          unread?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          actor: string
          actor_user_id: string | null
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          entry_type: string
          id: string
          metadata: Json
          reason: string | null
          reference: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          actor?: string
          actor_user_id?: string | null
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          entry_type: string
          id?: string
          metadata?: Json
          reason?: string | null
          reference?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          actor?: string
          actor_user_id?: string | null
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          entry_type?: string
          id?: string
          metadata?: Json
          reason?: string | null
          reference?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          key: string
          name: string
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          key: string
          name: string
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          key?: string
          name?: string
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_stages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_alerts: {
        Row: {
          created_at: string
          detail: string | null
          domain_id: string
          id: string
          kind: string
          records: string[]
          resolved_at: string | null
          severity: string
          title: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          domain_id: string
          id?: string
          kind: string
          records?: string[]
          resolved_at?: string | null
          severity?: string
          title: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          domain_id?: string
          id?: string
          kind?: string
          records?: string[]
          resolved_at?: string | null
          severity?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_alerts_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "sending_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_alerts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_click_events: {
        Row: {
          campaign_id: string | null
          client_ip: string | null
          created_at: string
          id: string
          lead_id: string | null
          message_id: string | null
          message_kind: string
          occurred_at: string
          recipient_email: string | null
          url: string
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          client_ip?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          message_id?: string | null
          message_kind?: string
          occurred_at?: string
          recipient_email?: string | null
          url: string
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          campaign_id?: string | null
          client_ip?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          message_id?: string | null
          message_kind?: string
          occurred_at?: string
          recipient_email?: string | null
          url?: string
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      email_drafts: {
        Row: {
          attachments: Json
          bcc_emails: string[]
          body: string
          cc_emails: string[]
          conversation_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          sending_account_id: string | null
          subject: string
          to_email: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          attachments?: Json
          bcc_emails?: string[]
          body?: string
          cc_emails?: string[]
          conversation_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          sending_account_id?: string | null
          subject?: string
          to_email?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          attachments?: Json
          bcc_emails?: string[]
          body?: string
          cc_emails?: string[]
          conversation_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          sending_account_id?: string | null
          subject?: string
          to_email?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_drafts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_engagement_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          detail: string | null
          event_type: string
          external_id: string | null
          id: string
          lead_id: string | null
          message_id: string | null
          occurred_at: string
          provider: string | null
          provider_message_id: string | null
          recipient_email: string | null
          sending_account_id: string | null
          url: string | null
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          detail?: string | null
          event_type: string
          external_id?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          occurred_at?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          sending_account_id?: string | null
          url?: string | null
          workspace_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          detail?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          occurred_at?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          sending_account_id?: string | null
          url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_engagement_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_engagement_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_engagement_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "campaign_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_engagement_events_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_engagement_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          attempts: number
          conversation_id: string | null
          created_at: string
          duplicate_count: number
          error: string | null
          event_type: string
          external_id: string | null
          failure_code: string | null
          from_email: string | null
          id: string
          last_retry_at: string | null
          lead_id: string | null
          message_id: string | null
          message_type: string | null
          payload: Json
          processed_at: string | null
          provider: string
          routing_token: string | null
          sending_account_id: string | null
          signature_detail: string | null
          signature_status: string
          status: string
          subject: string | null
          to_email: string | null
          token_status: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          conversation_id?: string | null
          created_at?: string
          duplicate_count?: number
          error?: string | null
          event_type?: string
          external_id?: string | null
          failure_code?: string | null
          from_email?: string | null
          id?: string
          last_retry_at?: string | null
          lead_id?: string | null
          message_id?: string | null
          message_type?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          routing_token?: string | null
          sending_account_id?: string | null
          signature_detail?: string | null
          signature_status?: string
          status?: string
          subject?: string | null
          to_email?: string | null
          token_status?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          conversation_id?: string | null
          created_at?: string
          duplicate_count?: number
          error?: string | null
          event_type?: string
          external_id?: string | null
          failure_code?: string | null
          from_email?: string | null
          id?: string
          last_retry_at?: string | null
          lead_id?: string | null
          message_id?: string | null
          message_type?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          routing_token?: string | null
          sending_account_id?: string | null
          signature_detail?: string | null
          signature_status?: string
          status?: string
          subject?: string | null
          to_email?: string | null
          token_status?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_open_events: {
        Row: {
          campaign_id: string | null
          client_ip: string | null
          created_at: string
          id: string
          is_prefetch: boolean
          lead_id: string | null
          message_id: string | null
          message_kind: string
          occurred_at: string
          prefetch_source: string | null
          recipient_email: string | null
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          client_ip?: string | null
          created_at?: string
          id?: string
          is_prefetch?: boolean
          lead_id?: string | null
          message_id?: string | null
          message_kind?: string
          occurred_at?: string
          prefetch_source?: string | null
          recipient_email?: string | null
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          campaign_id?: string | null
          client_ip?: string | null
          created_at?: string
          id?: string
          is_prefetch?: boolean
          lead_id?: string | null
          message_id?: string | null
          message_kind?: string
          occurred_at?: string
          prefetch_source?: string | null
          recipient_email?: string | null
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      email_provider_secrets: {
        Row: {
          created_at: string
          credentials_ciphertext: string
          provider_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials_ciphertext: string
          provider_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials_ciphertext?: string
          provider_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_provider_secrets_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "email_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_providers: {
        Row: {
          cost_per_1k_cents: number
          created_at: string
          customer_enabled: boolean
          daily_capacity: number
          failure_count: number
          health_checked_at: string | null
          health_detail: string | null
          health_reason: string | null
          health_status: string
          hourly_capacity: number
          id: string
          is_enabled: boolean
          last_error: string | null
          last_failure_at: string | null
          last_http_status: number | null
          last_success_at: string | null
          last_tested_at: string | null
          mode: string
          name: string
          notes: string | null
          priority: number
          provider: Database["public"]["Enums"]["sending_provider"]
          region: string | null
          reply_to_email: string | null
          sent_day: number
          sent_hour: number
          status: Database["public"]["Enums"]["connection_status"]
          success_count: number
          system_enabled: boolean
          updated_at: string
          usage_day: string | null
          usage_hour: string | null
        }
        Insert: {
          cost_per_1k_cents?: number
          created_at?: string
          customer_enabled?: boolean
          daily_capacity?: number
          failure_count?: number
          health_checked_at?: string | null
          health_detail?: string | null
          health_reason?: string | null
          health_status?: string
          hourly_capacity?: number
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_failure_at?: string | null
          last_http_status?: number | null
          last_success_at?: string | null
          last_tested_at?: string | null
          mode?: string
          name: string
          notes?: string | null
          priority?: number
          provider: Database["public"]["Enums"]["sending_provider"]
          region?: string | null
          reply_to_email?: string | null
          sent_day?: number
          sent_hour?: number
          status?: Database["public"]["Enums"]["connection_status"]
          success_count?: number
          system_enabled?: boolean
          updated_at?: string
          usage_day?: string | null
          usage_hour?: string | null
        }
        Update: {
          cost_per_1k_cents?: number
          created_at?: string
          customer_enabled?: boolean
          daily_capacity?: number
          failure_count?: number
          health_checked_at?: string | null
          health_detail?: string | null
          health_reason?: string | null
          health_status?: string
          hourly_capacity?: number
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_failure_at?: string | null
          last_http_status?: number | null
          last_success_at?: string | null
          last_tested_at?: string | null
          mode?: string
          name?: string
          notes?: string | null
          priority?: number
          provider?: Database["public"]["Enums"]["sending_provider"]
          region?: string | null
          reply_to_email?: string | null
          sent_day?: number
          sent_hour?: number
          status?: Database["public"]["Enums"]["connection_status"]
          success_count?: number
          system_enabled?: boolean
          updated_at?: string
          usage_day?: string | null
          usage_hour?: string | null
        }
        Relationships: []
      }
      email_signatures: {
        Row: {
          created_at: string
          enabled: boolean
          html_signature: string
          id: string
          mailbox_id: string
          metadata: Json
          name: string
          plain_text_signature: string
          sender_fields: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          html_signature?: string
          id?: string
          mailbox_id: string
          metadata?: Json
          name?: string
          plain_text_signature?: string
          sender_fields?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          html_signature?: string
          id?: string
          mailbox_id?: string
          metadata?: Json
          name?: string
          plain_text_signature?: string
          sender_fields?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_signatures_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: true
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_signatures_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          created_at: string
          detail: string | null
          email: string
          id: string
          reason: string
          source: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          email: string
          id?: string
          reason?: string
          source?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          email?: string
          id?: string
          reason?: string
          source?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_suppressions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number
          featured: boolean
          id: string
          is_official: boolean
          name: string
          published: boolean
          subject: string
          updated_at: string
          variables: string[]
          workspace_id: string | null
        }
        Insert: {
          body?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          featured?: boolean
          id?: string
          is_official?: boolean
          name: string
          published?: boolean
          subject?: string
          updated_at?: string
          variables?: string[]
          workspace_id?: string | null
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          featured?: boolean
          id?: string
          is_official?: boolean
          name?: string
          published?: boolean
          subject?: string
          updated_at?: string
          variables?: string[]
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          expires_at: string | null
          file_name: string | null
          id: string
          mime_type: string
          r2_key: string
          size: number
          status: string
          type: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          file_name?: string | null
          id?: string
          mime_type?: string
          r2_key: string
          size?: number
          status?: string
          type: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          file_name?: string | null
          id?: string
          mime_type?: string
          r2_key?: string
          size?: number
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      guide_articles: {
        Row: {
          body: string
          category: string
          created_at: string
          deleted_at: string | null
          help_center: boolean
          help_metadata: Json
          id: string
          published: boolean
          slug: string
          sort_order: number
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          category?: string
          created_at?: string
          deleted_at?: string | null
          help_center?: boolean
          help_metadata?: Json
          id?: string
          published?: boolean
          slug: string
          sort_order?: number
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          deleted_at?: string | null
          help_center?: boolean
          help_metadata?: Json
          id?: string
          published?: boolean
          slug?: string
          sort_order?: number
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbound_event_actions: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          conversation_id: string | null
          created_at: string
          detail: string | null
          event_id: string
          id: string
          outcome: string
          previous_status: string | null
          result_status: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          conversation_id?: string | null
          created_at?: string
          detail?: string | null
          event_id: string
          id?: string
          outcome: string
          previous_status?: string | null
          result_status: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          conversation_id?: string | null
          created_at?: string
          detail?: string | null
          event_id?: string
          id?: string
          outcome?: string
          previous_status?: string | null
          result_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_event_actions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "email_events"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_routes: {
        Row: {
          campaign_id: string | null
          conversation_id: string | null
          created_at: string
          id: string
          last_used_at: string | null
          lead_id: string | null
          purpose: string
          sending_account_id: string | null
          token: string
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          last_used_at?: string | null
          lead_id?: string | null
          purpose?: string
          sending_account_id?: string | null
          token: string
          workspace_id: string
        }
        Update: {
          campaign_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          last_used_at?: string | null
          lead_id?: string | null
          purpose?: string
          sending_account_id?: string | null
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_routes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_routes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_routes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_routes_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_routes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_tests: {
        Row: {
          conversation_id: string | null
          created_by: string
          error: string | null
          id: string
          provider_message_id: string | null
          replied_at: string | null
          reply_to: string
          sending_account_id: string | null
          sent_at: string
          status: string
          to_email: string
          token: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_by: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          replied_at?: string | null
          reply_to: string
          sending_account_id?: string | null
          sent_at?: string
          status?: string
          to_email: string
          token?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_by?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          replied_at?: string | null
          reply_to?: string
          sending_account_id?: string | null
          sent_at?: string
          status?: string
          to_email?: string
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_tests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_tests_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          account_label: string | null
          config: Json
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          last_event_at: string | null
          last_synced_at: string | null
          slug: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_label?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          last_event_at?: string | null
          last_synced_at?: string | null
          slug: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_label?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          last_event_at?: string | null
          last_synced_at?: string | null
          slug?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_slug_fkey"
            columns: ["slug"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "integration_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          connection_id: string | null
          created_at: string
          direction: string
          event_type: string
          id: string
          idempotency_key: string | null
          message: string | null
          payload: Json
          slug: string
          status: string
          workspace_id: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          direction?: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          message?: string | null
          payload?: Json
          slug: string
          status?: string
          workspace_id: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          direction?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          message?: string | null
          payload?: Json
          slug?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          connection_id: string
          credentials_ciphertext: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          credentials_ciphertext: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          credentials_ciphertext?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_logs: {
        Row: {
          action: string
          connection_id: string | null
          error: string | null
          finished_at: string | null
          id: string
          records: number
          slug: string
          started_at: string
          status: string
          workspace_id: string
        }
        Insert: {
          action: string
          connection_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          records?: number
          slug: string
          started_at?: string
          status?: string
          workspace_id: string
        }
        Update: {
          action?: string
          connection_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          records?: number
          slug?: string
          started_at?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          category: string
          created_at: string
          is_enabled: boolean
          name: string
          requires_paid_plan: boolean
          slug: string
          sort_order: number
          tagline: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          is_enabled?: boolean
          name: string
          requires_paid_plan?: boolean
          slug: string
          sort_order?: number
          tagline?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          is_enabled?: boolean
          name?: string
          requires_paid_plan?: boolean
          slug?: string
          sort_order?: number
          tagline?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_activities: {
        Row: {
          actor_id: string | null
          campaign_id: string | null
          created_at: string
          detail: string | null
          id: string
          lead_id: string
          type: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          campaign_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          lead_id: string
          type: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          campaign_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          lead_id?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_import_jobs: {
        Row: {
          attempts: number
          byte_offset: number
          created_at: string
          created_by: string
          duplicate_rows: number
          error_message: string | null
          errors: Json
          failed_rows: number
          file_id: string | null
          file_name: string | null
          file_size: number
          finished_at: string | null
          headers: Json
          id: string
          imported_rows: number
          invalid_rows: number
          lease_until: string | null
          list_id: string | null
          list_verified: boolean
          mapping: Json
          processed_rows: number
          r2_key: string
          skipped_rows: number
          started_at: string | null
          status: string
          tags: string[]
          total_rows: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          byte_offset?: number
          created_at?: string
          created_by: string
          duplicate_rows?: number
          error_message?: string | null
          errors?: Json
          failed_rows?: number
          file_id?: string | null
          file_name?: string | null
          file_size?: number
          finished_at?: string | null
          headers?: Json
          id?: string
          imported_rows?: number
          invalid_rows?: number
          lease_until?: string | null
          list_id?: string | null
          list_verified?: boolean
          mapping?: Json
          processed_rows?: number
          r2_key: string
          skipped_rows?: number
          started_at?: string | null
          status?: string
          tags?: string[]
          total_rows?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          byte_offset?: number
          created_at?: string
          created_by?: string
          duplicate_rows?: number
          error_message?: string | null
          errors?: Json
          failed_rows?: number
          file_id?: string | null
          file_name?: string | null
          file_size?: number
          finished_at?: string | null
          headers?: Json
          id?: string
          imported_rows?: number
          invalid_rows?: number
          lease_until?: string | null
          list_id?: string | null
          list_verified?: boolean
          mapping?: Json
          processed_rows?: number
          r2_key?: string
          skipped_rows?: number
          started_at?: string | null
          status?: string
          tags?: string[]
          total_rows?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_import_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_lists: {
        Row: {
          color: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_lists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          lead_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          lead_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          lead_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_retention_runs: {
        Row: {
          batches: number
          deleted_count: number
          error: string | null
          finished_at: string
          id: string
          started_at: string
          status: string
          workspace_id: string | null
        }
        Insert: {
          batches?: number
          deleted_count?: number
          error?: string | null
          finished_at?: string
          id?: string
          started_at?: string
          status?: string
          workspace_id?: string | null
        }
        Update: {
          batches?: number
          deleted_count?: number
          error?: string | null
          finished_at?: string
          id?: string
          started_at?: string
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_retention_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tasks: {
        Row: {
          completed: boolean
          created_at: string
          created_by: string
          due_at: string | null
          id: string
          lead_id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          created_by: string
          due_at?: string | null
          id?: string
          lead_id: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          created_by?: string
          due_at?: string | null
          id?: string
          lead_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          archived: boolean
          city: string | null
          company: string | null
          country: string | null
          created_at: string
          crm_stage: string
          custom_fields: Json
          deal_value: number | null
          email: string
          first_name: string | null
          id: string
          job_title: string | null
          last_activity_at: string | null
          last_name: string | null
          lead_source: string | null
          linkedin_url: string | null
          list_id: string | null
          owner_id: string | null
          phone: string | null
          retention_expires_at: string
          stage_id: string | null
          state: string | null
          status: string
          tags: string[]
          updated_at: string
          website: string | null
          workspace_id: string
        }
        Insert: {
          archived?: boolean
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          crm_stage?: string
          custom_fields?: Json
          deal_value?: number | null
          email: string
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_activity_at?: string | null
          last_name?: string | null
          lead_source?: string | null
          linkedin_url?: string | null
          list_id?: string | null
          owner_id?: string | null
          phone?: string | null
          retention_expires_at?: string
          stage_id?: string | null
          state?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
          workspace_id: string
        }
        Update: {
          archived?: boolean
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          crm_stage?: string
          custom_fields?: Json
          deal_value?: number | null
          email?: string
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_activity_at?: string | null
          last_name?: string | null
          lead_source?: string | null
          linkedin_url?: string | null
          list_id?: string | null
          owner_id?: string | null
          phone?: string | null
          retention_expires_at?: string
          stage_id?: string | null
          state?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lead_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_actions: {
        Row: {
          attempts: number
          completed_at: string | null
          coupon_code: string | null
          coupon_expires_at: string | null
          coupon_percent: number | null
          created_at: string
          email_id: string | null
          enrollment_id: string
          error: string | null
          event_key: string | null
          id: string
          kind: string
          status: string
          step_key: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          coupon_code?: string | null
          coupon_expires_at?: string | null
          coupon_percent?: number | null
          created_at?: string
          email_id?: string | null
          enrollment_id: string
          error?: string | null
          event_key?: string | null
          id?: string
          kind?: string
          status?: string
          step_key: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          coupon_code?: string | null
          coupon_expires_at?: string | null
          coupon_percent?: number | null
          created_at?: string
          email_id?: string | null
          enrollment_id?: string
          error?: string | null
          event_key?: string | null
          id?: string
          kind?: string
          status?: string
          step_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_actions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_enrollments: {
        Row: {
          baseline_at: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          email: string | null
          entered_at: string
          id: string
          last_step_at: string | null
          next_action_at: string | null
          reactivated_at: string | null
          state: string
          terminated_at: string | null
          track: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          baseline_at?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          email?: string | null
          entered_at?: string
          id?: string
          last_step_at?: string | null
          next_action_at?: string | null
          reactivated_at?: string | null
          state?: string
          terminated_at?: string | null
          track: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          baseline_at?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          email?: string | null
          entered_at?: string
          id?: string
          last_step_at?: string | null
          next_action_at?: string | null
          reactivated_at?: string | null
          state?: string
          terminated_at?: string | null
          track?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_enrollments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mailboxes: {
        Row: {
          auth_checked_at: string | null
          auth_detail: Json
          auth_reason: string | null
          auth_status: string | null
          created_at: string
          daily_send_limit: number
          display_name: string | null
          dkim_selector_found: string | null
          dkim_status: string | null
          dmarc_policy: string | null
          dmarc_status: string | null
          email_address: string
          id: string
          imap_host: string
          imap_password: string | null
          imap_port: number
          imap_secure: boolean
          imap_username: string
          is_active: boolean
          last_imap_uid: number | null
          last_spam_imap_uid: number | null
          last_tested_at: string | null
          mail_host: string | null
          provider_daily_ceiling: number | null
          smtp_host: string
          smtp_password: string | null
          smtp_port: number
          smtp_secure: boolean
          smtp_username: string
          spf_status: string | null
          status: string
          updated_at: string
          warmup_enabled: boolean
          workspace_id: string
        }
        Insert: {
          auth_checked_at?: string | null
          auth_detail?: Json
          auth_reason?: string | null
          auth_status?: string | null
          created_at?: string
          daily_send_limit?: number
          display_name?: string | null
          dkim_selector_found?: string | null
          dkim_status?: string | null
          dmarc_policy?: string | null
          dmarc_status?: string | null
          email_address: string
          id?: string
          imap_host: string
          imap_password?: string | null
          imap_port: number
          imap_secure?: boolean
          imap_username: string
          is_active?: boolean
          last_imap_uid?: number | null
          last_spam_imap_uid?: number | null
          last_tested_at?: string | null
          mail_host?: string | null
          provider_daily_ceiling?: number | null
          smtp_host: string
          smtp_password?: string | null
          smtp_port: number
          smtp_secure?: boolean
          smtp_username: string
          spf_status?: string | null
          status?: string
          updated_at?: string
          warmup_enabled?: boolean
          workspace_id: string
        }
        Update: {
          auth_checked_at?: string | null
          auth_detail?: Json
          auth_reason?: string | null
          auth_status?: string | null
          created_at?: string
          daily_send_limit?: number
          display_name?: string | null
          dkim_selector_found?: string | null
          dkim_status?: string | null
          dmarc_policy?: string | null
          dmarc_status?: string | null
          email_address?: string
          id?: string
          imap_host?: string
          imap_password?: string | null
          imap_port?: number
          imap_secure?: boolean
          imap_username?: string
          is_active?: boolean
          last_imap_uid?: number | null
          last_spam_imap_uid?: number | null
          last_tested_at?: string | null
          mail_host?: string | null
          provider_daily_ceiling?: number | null
          smtp_host?: string
          smtp_password?: string | null
          smtp_port?: number
          smtp_secure?: boolean
          smtp_username?: string
          spf_status?: string | null
          status?: string
          updated_at?: string
          warmup_enabled?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailboxes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_send_claims: {
        Row: {
          created_at: string
          id: string
          kind: string
          result: Json | null
          send_key: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          result?: Json | null
          send_key: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          result?: Json | null
          send_key?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      marketing_automation_enrollments: {
        Row: {
          automation_id: string
          completed_at: string | null
          context: Json
          created_at: string
          current_step: number
          id: string
          last_error: string | null
          next_run_at: string
          status: string
          subscriber_id: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          automation_id: string
          completed_at?: string | null
          context?: Json
          created_at?: string
          current_step?: number
          id?: string
          last_error?: string | null
          next_run_at?: string
          status?: string
          subscriber_id: string
          trigger_event?: string
          updated_at?: string
        }
        Update: {
          automation_id?: string
          completed_at?: string | null
          context?: Json
          created_at?: string
          current_step?: number
          id?: string
          last_error?: string | null
          next_run_at?: string
          status?: string
          subscriber_id?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_automation_enrollments_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "marketing_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_automation_enrollments_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "marketing_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_automation_steps: {
        Row: {
          automation_id: string
          config: Json
          created_at: string
          id: string
          position: number
          step_type: string
          updated_at: string
        }
        Insert: {
          automation_id: string
          config?: Json
          created_at?: string
          id?: string
          position?: number
          step_type: string
          updated_at?: string
        }
        Update: {
          automation_id?: string
          config?: Json
          created_at?: string
          id?: string
          position?: number
          step_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_automation_steps_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "marketing_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_automations: {
        Row: {
          blueprint_key: string | null
          created_at: string
          created_by: string | null
          description: string
          from_email: string
          from_name: string
          id: string
          name: string
          provider_id: string | null
          reply_to: string | null
          segment_id: string | null
          segment_key: string | null
          sending_domain_id: string | null
          stats: Json
          status: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          blueprint_key?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          from_email?: string
          from_name?: string
          id?: string
          name: string
          provider_id?: string | null
          reply_to?: string | null
          segment_id?: string | null
          segment_key?: string | null
          sending_domain_id?: string | null
          stats?: Json
          status?: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          blueprint_key?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          from_email?: string
          from_name?: string
          id?: string
          name?: string
          provider_id?: string | null
          reply_to?: string | null
          segment_id?: string | null
          segment_key?: string | null
          sending_domain_id?: string | null
          stats?: Json
          status?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_automations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "marketing_email_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_automations_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "marketing_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_automations_sending_domain_id_fkey"
            columns: ["sending_domain_id"]
            isOneToOne: false
            referencedRelation: "marketing_sending_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaign_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          email: string
          error_message: string | null
          id: string
          provider_message_id: string | null
          sent_at: string | null
          skip_reason: string | null
          status: string
          subscriber_id: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          skip_reason?: string | null
          status?: string
          subscriber_id: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          skip_reason?: string | null
          status?: string
          subscriber_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_recipients_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "marketing_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          builtin_template_key: string | null
          campaign_type: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          failure_reason: string | null
          from_email: string
          from_name: string
          id: string
          name: string
          provider_id: string | null
          reply_to: string | null
          scheduled_at: string | null
          segment_id: string | null
          segment_key: string | null
          sending_domain_id: string | null
          started_at: string | null
          stats: Json
          status: string
          subject_override: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          builtin_template_key?: string | null
          campaign_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          from_email?: string
          from_name?: string
          id?: string
          name: string
          provider_id?: string | null
          reply_to?: string | null
          scheduled_at?: string | null
          segment_id?: string | null
          segment_key?: string | null
          sending_domain_id?: string | null
          started_at?: string | null
          stats?: Json
          status?: string
          subject_override?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          builtin_template_key?: string | null
          campaign_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          from_email?: string
          from_name?: string
          id?: string
          name?: string
          provider_id?: string | null
          reply_to?: string | null
          scheduled_at?: string | null
          segment_id?: string | null
          segment_key?: string | null
          sending_domain_id?: string | null
          started_at?: string | null
          stats?: Json
          status?: string
          subject_override?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "marketing_email_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "marketing_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_sending_domain_id_fkey"
            columns: ["sending_domain_id"]
            isOneToOne: false
            referencedRelation: "marketing_sending_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "marketing_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_email_events: {
        Row: {
          automation_id: string | null
          campaign_id: string | null
          created_at: string
          detail: string | null
          email: string
          event_type: string
          id: string
          metadata: Json
          provider_id: string | null
          provider_message_id: string | null
          sending_domain_id: string | null
          subscriber_id: string | null
        }
        Insert: {
          automation_id?: string | null
          campaign_id?: string | null
          created_at?: string
          detail?: string | null
          email: string
          event_type: string
          id?: string
          metadata?: Json
          provider_id?: string | null
          provider_message_id?: string | null
          sending_domain_id?: string | null
          subscriber_id?: string | null
        }
        Update: {
          automation_id?: string | null
          campaign_id?: string | null
          created_at?: string
          detail?: string | null
          email?: string
          event_type?: string
          id?: string
          metadata?: Json
          provider_id?: string | null
          provider_message_id?: string | null
          sending_domain_id?: string | null
          subscriber_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_email_events_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "marketing_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_email_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_email_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "marketing_email_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_email_events_sending_domain_id_fkey"
            columns: ["sending_domain_id"]
            isOneToOne: false
            referencedRelation: "marketing_sending_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_email_events_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "marketing_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_email_providers: {
        Row: {
          config: Json
          connection_status: string
          created_at: string
          daily_send_limit: number | null
          health: string
          id: string
          last_test_message: string | null
          last_tested_at: string | null
          name: string
          provider_type: string
          rate_per_second: number | null
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          connection_status?: string
          created_at?: string
          daily_send_limit?: number | null
          health?: string
          id?: string
          last_test_message?: string | null
          last_tested_at?: string | null
          name: string
          provider_type: string
          rate_per_second?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          connection_status?: string
          created_at?: string
          daily_send_limit?: number | null
          health?: string
          id?: string
          last_test_message?: string | null
          last_tested_at?: string | null
          name?: string
          provider_type?: string
          rate_per_second?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_form_submissions: {
        Row: {
          consent: boolean
          created_at: string
          email: string
          first_name: string | null
          form_id: string
          id: string
          metadata: Json
        }
        Insert: {
          consent?: boolean
          created_at?: string
          email: string
          first_name?: string | null
          form_id: string
          id?: string
          metadata?: Json
        }
        Update: {
          consent?: boolean
          created_at?: string
          email?: string
          first_name?: string | null
          form_id?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "marketing_form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "marketing_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_forms: {
        Row: {
          collect_first_name: boolean
          consent_text: string
          created_at: string
          enabled: boolean
          form_type: string
          id: string
          name: string
          segment_id: string | null
          slug: string
          source: string
          submissions_count: number
          success_message: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          collect_first_name?: boolean
          consent_text?: string
          created_at?: string
          enabled?: boolean
          form_type?: string
          id?: string
          name: string
          segment_id?: string | null
          slug: string
          source?: string
          submissions_count?: number
          success_message?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          collect_first_name?: boolean
          consent_text?: string
          created_at?: string
          enabled?: boolean
          form_type?: string
          id?: string
          name?: string
          segment_id?: string | null
          slug?: string
          source?: string
          submissions_count?: number
          success_message?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_forms_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "marketing_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_provider_secrets: {
        Row: {
          created_at: string
          encrypted_credentials: string
          provider_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_credentials: string
          provider_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_credentials?: string
          provider_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_provider_secrets_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "marketing_email_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_segment_members: {
        Row: {
          created_at: string
          id: string
          segment_id: string
          subscriber_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          segment_id: string
          subscriber_id: string
        }
        Update: {
          created_at?: string
          id?: string
          segment_id?: string
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_segment_members_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "marketing_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_segment_members_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "marketing_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_segments: {
        Row: {
          conditions: Json
          created_at: string
          created_by: string | null
          description: string
          id: string
          key: string | null
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          key?: string | null
          kind?: string
          name: string
          updated_at?: string
        }
        Update: {
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          key?: string | null
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_sending_domains: {
        Row: {
          allowed_provider_ids: string[]
          created_at: string
          dkim_status: string
          dmarc_status: string
          dns_records: Json
          domain: string
          enabled: boolean
          id: string
          last_checked_at: string | null
          provider_id: string | null
          spf_status: string
          updated_at: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          allowed_provider_ids?: string[]
          created_at?: string
          dkim_status?: string
          dmarc_status?: string
          dns_records?: Json
          domain: string
          enabled?: boolean
          id?: string
          last_checked_at?: string | null
          provider_id?: string | null
          spf_status?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          allowed_provider_ids?: string[]
          created_at?: string
          dkim_status?: string
          dmarc_status?: string
          dns_records?: Json
          domain?: string
          enabled?: boolean
          id?: string
          last_checked_at?: string | null
          provider_id?: string | null
          spf_status?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_sending_domains_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "marketing_email_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_settings: {
        Row: {
          default_provider_id: string | null
          default_sending_domain_id: string | null
          id: boolean
          max_emails_per_day: number
          max_emails_per_week: number
          updated_at: string
        }
        Insert: {
          default_provider_id?: string | null
          default_sending_domain_id?: string | null
          id?: boolean
          max_emails_per_day?: number
          max_emails_per_week?: number
          updated_at?: string
        }
        Update: {
          default_provider_id?: string | null
          default_sending_domain_id?: string | null
          id?: boolean
          max_emails_per_day?: number
          max_emails_per_week?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_settings_default_provider_id_fkey"
            columns: ["default_provider_id"]
            isOneToOne: false
            referencedRelation: "marketing_email_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_settings_default_sending_domain_id_fkey"
            columns: ["default_sending_domain_id"]
            isOneToOne: false
            referencedRelation: "marketing_sending_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_subscribers: {
        Row: {
          attributes: Json
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_clicked_at: string | null
          last_name: string | null
          last_opened_at: string | null
          last_sent_at: string | null
          source: string
          status: string
          subscribed_at: string | null
          tags: string[]
          unsubscribed_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attributes?: Json
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_clicked_at?: string | null
          last_name?: string | null
          last_opened_at?: string | null
          last_sent_at?: string | null
          source?: string
          status?: string
          subscribed_at?: string | null
          tags?: string[]
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attributes?: Json
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_clicked_at?: string | null
          last_name?: string | null
          last_opened_at?: string | null
          last_sent_at?: string | null
          source?: string
          status?: string
          subscribed_at?: string | null
          tags?: string[]
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      marketing_suppression: {
        Row: {
          created_at: string
          detail: string | null
          email: string
          id: string
          reason: string
          source: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          email: string
          id?: string
          reason: string
          source?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          email?: string
          id?: string
          reason?: string
          source?: string
        }
        Relationships: []
      }
      marketing_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          created_by: string | null
          duplicated_from: string | null
          from_email: string | null
          from_name: string | null
          id: string
          metadata: Json
          name: string
          preview_text: string
          reply_to: string | null
          status: string
          subject: string
          type: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body?: string
          category?: string
          created_at?: string
          created_by?: string | null
          duplicated_from?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          metadata?: Json
          name: string
          preview_text?: string
          reply_to?: string | null
          status?: string
          subject?: string
          type?: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          created_by?: string | null
          duplicated_from?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          metadata?: Json
          name?: string
          preview_text?: string
          reply_to?: string | null
          status?: string
          subject?: string
          type?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      munchmate_knowledge: {
        Row: {
          content: string
          created_at: string
          enabled: boolean
          id: string
          source: string
          source_key: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          content: string
          created_at?: string
          enabled?: boolean
          id?: string
          source: string
          source_key: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          enabled?: boolean
          id?: string
          source?: string
          source_key?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          bounce_alerts: boolean
          campaign_completed: boolean
          created_at: string
          deliverability_alerts: boolean
          email_enabled: boolean
          in_app_enabled: boolean
          new_replies: boolean
          positive_reply_notifications: boolean
          referral_updates: boolean
          support_updates: boolean
          team_activity: boolean
          updated_at: string
          user_id: string
          warmup_alerts: boolean
        }
        Insert: {
          bounce_alerts?: boolean
          campaign_completed?: boolean
          created_at?: string
          deliverability_alerts?: boolean
          email_enabled?: boolean
          in_app_enabled?: boolean
          new_replies?: boolean
          positive_reply_notifications?: boolean
          referral_updates?: boolean
          support_updates?: boolean
          team_activity?: boolean
          updated_at?: string
          user_id: string
          warmup_alerts?: boolean
        }
        Update: {
          bounce_alerts?: boolean
          campaign_completed?: boolean
          created_at?: string
          deliverability_alerts?: boolean
          email_enabled?: boolean
          in_app_enabled?: boolean
          new_replies?: boolean
          positive_reply_notifications?: boolean
          referral_updates?: boolean
          support_updates?: boolean
          team_activity?: boolean
          updated_at?: string
          user_id?: string
          warmup_alerts?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string | null
          read: boolean
          title: string
          type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_messages: {
        Row: {
          created_at: string
          id: string
          message_type: string
          provider: string | null
          provider_message_id: string
          ref_id: string | null
          ref_table: string | null
          sending_account_id: string | null
          to_email: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_type: string
          provider?: string | null
          provider_message_id: string
          ref_id?: string | null
          ref_table?: string | null
          sending_account_id?: string | null
          to_email?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_type?: string
          provider?: string | null
          provider_message_id?: string
          ref_id?: string | null
          ref_table?: string | null
          sending_account_id?: string | null
          to_email?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      plan_features: {
        Row: {
          category: string
          created_at: string
          feature_key: string | null
          id: string
          included: boolean
          name: string
          plan_id: string
          sort_order: number
          value: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          feature_key?: string | null
          id?: string
          included?: boolean
          name: string
          plan_id: string
          sort_order?: number
          value?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          feature_key?: string | null
          id?: string
          included?: boolean
          name?: string
          plan_id?: string
          sort_order?: number
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_grants: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          plan_id: string
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          starts_at: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          plan_id: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          plan_id?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_grants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_grants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          analytics_enabled: boolean
          api_access: boolean
          billing_type: string
          compare_at_price: number | null
          created_at: string
          custom_branding: boolean
          description: string | null
          id: string
          is_active: boolean
          is_enterprise: boolean
          is_popular: boolean
          max_active_campaigns: number | null
          max_ai_monthly: number | null
          max_automations: number | null
          max_campaigns: number | null
          max_domains: number | null
          max_emails_daily: number | null
          max_emails_monthly: number | null
          max_leads: number | null
          max_sending_accounts: number | null
          max_users: number | null
          max_warmup_daily: number | null
          max_workspaces: number | null
          monthly_credits: number
          monthly_price: number
          name: string
          one_time_price: number | null
          priority_support: boolean
          public_on_pricing_page: boolean
          slug: string
          sort_order: number
          sso_enabled: boolean
          tagline: string | null
          trial_days: number
          unified_inbox_enabled: boolean
          updated_at: string
          warmup_enabled: boolean
          yearly_price: number
        }
        Insert: {
          analytics_enabled?: boolean
          api_access?: boolean
          billing_type?: string
          compare_at_price?: number | null
          created_at?: string
          custom_branding?: boolean
          description?: string | null
          id?: string
          is_active?: boolean
          is_enterprise?: boolean
          is_popular?: boolean
          max_active_campaigns?: number | null
          max_ai_monthly?: number | null
          max_automations?: number | null
          max_campaigns?: number | null
          max_domains?: number | null
          max_emails_daily?: number | null
          max_emails_monthly?: number | null
          max_leads?: number | null
          max_sending_accounts?: number | null
          max_users?: number | null
          max_warmup_daily?: number | null
          max_workspaces?: number | null
          monthly_credits?: number
          monthly_price?: number
          name: string
          one_time_price?: number | null
          priority_support?: boolean
          public_on_pricing_page?: boolean
          slug: string
          sort_order?: number
          sso_enabled?: boolean
          tagline?: string | null
          trial_days?: number
          unified_inbox_enabled?: boolean
          updated_at?: string
          warmup_enabled?: boolean
          yearly_price?: number
        }
        Update: {
          analytics_enabled?: boolean
          api_access?: boolean
          billing_type?: string
          compare_at_price?: number | null
          created_at?: string
          custom_branding?: boolean
          description?: string | null
          id?: string
          is_active?: boolean
          is_enterprise?: boolean
          is_popular?: boolean
          max_active_campaigns?: number | null
          max_ai_monthly?: number | null
          max_automations?: number | null
          max_campaigns?: number | null
          max_domains?: number | null
          max_emails_daily?: number | null
          max_emails_monthly?: number | null
          max_leads?: number | null
          max_sending_accounts?: number | null
          max_users?: number | null
          max_warmup_daily?: number | null
          max_workspaces?: number | null
          monthly_credits?: number
          monthly_price?: number
          name?: string
          one_time_price?: number | null
          priority_support?: boolean
          public_on_pricing_page?: boolean
          slug?: string
          sort_order?: number
          sso_enabled?: boolean
          tagline?: string | null
          trial_days?: number
          unified_inbox_enabled?: boolean
          updated_at?: string
          warmup_enabled?: boolean
          yearly_price?: number
        }
        Relationships: []
      }
      platform_announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "platform_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_announcements: {
        Row: {
          audience: string
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          dismissible: boolean
          enabled: boolean
          ends_at: string | null
          id: string
          level: string
          message: string
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          dismissible?: boolean
          enabled?: boolean
          ends_at?: string | null
          id?: string
          level?: string
          message: string
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          dismissible?: boolean
          enabled?: boolean
          ends_at?: string | null
          id?: string
          level?: string
          message?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_feature_flags: {
        Row: {
          audience: string
          created_at: string
          description: string
          enabled: boolean
          environment: string
          key: string
          name: string
          rollout_percentage: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: string
          created_at?: string
          description?: string
          enabled?: boolean
          environment?: string
          key: string
          name: string
          rollout_percentage?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string
          created_at?: string
          description?: string
          enabled?: boolean
          environment?: string
          key?: string
          name?: string
          rollout_percentage?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      privacy_requests: {
        Row: {
          admin_notes: string | null
          company: string | null
          created_at: string
          details: string
          email: string
          handled_at: string | null
          id: string
          name: string
          request_type: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          company?: string | null
          created_at?: string
          details?: string
          email: string
          handled_at?: string | null
          id?: string
          name: string
          request_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          company?: string | null
          created_at?: string
          details?: string
          email?: string
          handled_at?: string | null
          id?: string
          name?: string
          request_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birthday: string | null
          created_at: string
          display_name: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          onboarding_completed: boolean
          theme: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          onboarding_completed?: boolean
          theme?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          onboarding_completed?: boolean
          theme?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_health_events: {
        Row: {
          domain: string | null
          error_code: string | null
          http_status: number | null
          id: string
          message: string | null
          occurred_at: string
          ok: boolean
          operation: string
          provider_id: string
        }
        Insert: {
          domain?: string | null
          error_code?: string | null
          http_status?: number | null
          id?: string
          message?: string | null
          occurred_at?: string
          ok: boolean
          operation: string
          provider_id: string
        }
        Update: {
          domain?: string | null
          error_code?: string | null
          http_status?: number | null
          id?: string
          message?: string | null
          occurred_at?: string
          ok?: boolean
          operation?: string
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_health_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "email_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_routing_events: {
        Row: {
          created_at: string
          detail: string | null
          domain: string | null
          domain_id: string | null
          event: string
          id: string
          previous_provider_id: string | null
          provider_id: string | null
          reason: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          domain?: string | null
          domain_id?: string | null
          event: string
          id?: string
          previous_provider_id?: string | null
          provider_id?: string | null
          reason?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          domain?: string | null
          domain_id?: string | null
          event?: string
          id?: string
          previous_provider_id?: string | null
          provider_id?: string | null
          reason?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_routing_events_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "sending_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_routing_events_previous_provider_id_fkey"
            columns: ["previous_provider_id"]
            isOneToOne: false
            referencedRelation: "email_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_routing_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "email_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_routing_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reclass_550_no_mailbox_backup: {
        Row: {
          backed_up_at: string | null
          bounce_reason: string | null
          bounced_at: string | null
          delivery_status: string | null
          id: string | null
        }
        Insert: {
          backed_up_at?: string | null
          bounce_reason?: string | null
          bounced_at?: string | null
          delivery_status?: string | null
          id?: string | null
        }
        Update: {
          backed_up_at?: string | null
          bounce_reason?: string | null
          bounced_at?: string | null
          delivery_status?: string | null
          id?: string | null
        }
        Relationships: []
      }
      reclass_bounce_backup_2026_10_19: {
        Row: {
          backed_up_at: string | null
          bounce_reason: string | null
          bounced_at: string | null
          delivery_status: string | null
          id: string | null
        }
        Insert: {
          backed_up_at?: string | null
          bounce_reason?: string | null
          bounced_at?: string | null
          delivery_status?: string | null
          id?: string | null
        }
        Update: {
          backed_up_at?: string | null
          bounce_reason?: string | null
          bounced_at?: string | null
          delivery_status?: string | null
          id?: string | null
        }
        Relationships: []
      }
      reclass_permanent_smtp_backup_2026_11: {
        Row: {
          backed_up_at: string | null
          bounce_reason: string | null
          bounced_at: string | null
          delivery_status: string | null
          id: string
          status: string | null
        }
        Insert: {
          backed_up_at?: string | null
          bounce_reason?: string | null
          bounced_at?: string | null
          delivery_status?: string | null
          id: string
          status?: string | null
        }
        Update: {
          backed_up_at?: string | null
          bounce_reason?: string | null
          bounced_at?: string | null
          delivery_status?: string | null
          id?: string
          status?: string | null
        }
        Relationships: []
      }
      referral_attributions: {
        Row: {
          code: string
          converted_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          program_snapshot: Json
          referral_profile_id: string
          referred_user_id: string
          referred_workspace_id: string | null
          referrer_user_id: string
          signed_up_at: string
          status: string
        }
        Insert: {
          code: string
          converted_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          program_snapshot?: Json
          referral_profile_id: string
          referred_user_id: string
          referred_workspace_id?: string | null
          referrer_user_id: string
          signed_up_at?: string
          status?: string
        }
        Update: {
          code?: string
          converted_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          program_snapshot?: Json
          referral_profile_id?: string
          referred_user_id?: string
          referred_workspace_id?: string | null
          referrer_user_id?: string
          signed_up_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_attributions_referral_profile_id_fkey"
            columns: ["referral_profile_id"]
            isOneToOne: false
            referencedRelation: "referral_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_attributions_referred_workspace_id_fkey"
            columns: ["referred_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          created_at: string
          detail: string | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          referral_profile_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          referral_profile_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          referral_profile_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_audit_logs_referral_profile_id_fkey"
            columns: ["referral_profile_id"]
            isOneToOne: false
            referencedRelation: "referral_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_billing_events: {
        Row: {
          error: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed_at: string
          provider: string
          result: string | null
        }
        Insert: {
          error?: string | null
          event_id: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string
          provider: string
          result?: string | null
        }
        Update: {
          error?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string
          provider?: string
          result?: string | null
        }
        Relationships: []
      }
      referral_clicks: {
        Row: {
          code: string
          created_at: string
          id: string
          ip_hash: string | null
          landing_path: string | null
          referer: string | null
          referral_profile_id: string | null
          user_agent: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          landing_path?: string | null
          referer?: string | null
          referral_profile_id?: string | null
          user_agent?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          landing_path?: string | null
          referer?: string | null
          referral_profile_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_clicks_referral_profile_id_fkey"
            columns: ["referral_profile_id"]
            isOneToOne: false
            referencedRelation: "referral_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_commissions: {
        Row: {
          affiliate_environment: string | null
          affiliate_payment_key: string | null
          amount_cents: number
          approved_at: string | null
          attribution_id: string
          commission_amount_cents: number
          commission_rate: number
          commission_type: string
          created_at: string
          currency: string
          id: string
          notes: string | null
          paid_at: string | null
          payable_at: string | null
          payment_id: string | null
          payout_id: string | null
          plan_name: string | null
          provider: string
          provider_event_id: string
          referral_profile_id: string
          referred_user_id: string
          referred_workspace_id: string | null
          referrer_user_id: string
          rejected_at: string | null
          reversal_of: string | null
          reversed_at: string | null
          reversed_cents: number
          settled_cents: number
          status: string
          subscription_id: string | null
        }
        Insert: {
          affiliate_environment?: string | null
          affiliate_payment_key?: string | null
          amount_cents?: number
          approved_at?: string | null
          attribution_id: string
          commission_amount_cents?: number
          commission_rate?: number
          commission_type: string
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payable_at?: string | null
          payment_id?: string | null
          payout_id?: string | null
          plan_name?: string | null
          provider: string
          provider_event_id: string
          referral_profile_id: string
          referred_user_id: string
          referred_workspace_id?: string | null
          referrer_user_id: string
          rejected_at?: string | null
          reversal_of?: string | null
          reversed_at?: string | null
          reversed_cents?: number
          settled_cents?: number
          status?: string
          subscription_id?: string | null
        }
        Update: {
          affiliate_environment?: string | null
          affiliate_payment_key?: string | null
          amount_cents?: number
          approved_at?: string | null
          attribution_id?: string
          commission_amount_cents?: number
          commission_rate?: number
          commission_type?: string
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payable_at?: string | null
          payment_id?: string | null
          payout_id?: string | null
          plan_name?: string | null
          provider?: string
          provider_event_id?: string
          referral_profile_id?: string
          referred_user_id?: string
          referred_workspace_id?: string | null
          referrer_user_id?: string
          rejected_at?: string | null
          reversal_of?: string | null
          reversed_at?: string | null
          reversed_cents?: number
          settled_cents?: number
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_commissions_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "referral_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "referral_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_referral_profile_id_fkey"
            columns: ["referral_profile_id"]
            isOneToOne: false
            referencedRelation: "referral_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_referred_workspace_id_fkey"
            columns: ["referred_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "referral_commissions"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_fraud_flags: {
        Row: {
          attribution_id: string | null
          created_at: string
          detail: string | null
          id: string
          reason: string
          referral_profile_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          status: string
        }
        Insert: {
          attribution_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          reason: string
          referral_profile_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          status?: string
        }
        Update: {
          attribution_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          reason?: string
          referral_profile_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_fraud_flags_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "referral_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_fraud_flags_referral_profile_id_fkey"
            columns: ["referral_profile_id"]
            isOneToOne: false
            referencedRelation: "referral_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_payouts: {
        Row: {
          actual_paid_cents: number | null
          adjustment_allocated_cents: number
          admin_notes: string | null
          amount_cents: number
          created_at: string
          crypto_network: string | null
          currency: string
          decided_at: string | null
          destination_hint: string | null
          id: string
          method: string | null
          paid_at: string | null
          payout_environment: string | null
          processing_due_at: string | null
          reference: string | null
          referral_profile_id: string
          request_key: string | null
          requested_at: string
          status: string
          updated_at: string
          user_id: string
          wallet_address: string | null
        }
        Insert: {
          actual_paid_cents?: number | null
          adjustment_allocated_cents?: number
          admin_notes?: string | null
          amount_cents: number
          created_at?: string
          crypto_network?: string | null
          currency?: string
          decided_at?: string | null
          destination_hint?: string | null
          id?: string
          method?: string | null
          paid_at?: string | null
          payout_environment?: string | null
          processing_due_at?: string | null
          reference?: string | null
          referral_profile_id: string
          request_key?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id: string
          wallet_address?: string | null
        }
        Update: {
          actual_paid_cents?: number | null
          adjustment_allocated_cents?: number
          admin_notes?: string | null
          amount_cents?: number
          created_at?: string
          crypto_network?: string | null
          currency?: string
          decided_at?: string | null
          destination_hint?: string | null
          id?: string
          method?: string | null
          paid_at?: string | null
          payout_environment?: string | null
          processing_due_at?: string | null
          reference?: string | null
          referral_profile_id?: string
          request_key?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_payouts_referral_profile_id_fkey"
            columns: ["referral_profile_id"]
            isOneToOne: false
            referencedRelation: "referral_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_profiles: {
        Row: {
          code: string
          created_at: string
          id: string
          payout_destination_hint: string | null
          payout_method: string | null
          status: string
          suspended_reason: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          payout_destination_hint?: string | null
          payout_method?: string | null
          status?: string
          suspended_reason?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          payout_destination_hint?: string | null
          payout_method?: string | null
          status?: string
          suspended_reason?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_programs: {
        Row: {
          affiliate_approval_required: boolean
          annual_commission_percent: number
          approval_delay_days: number
          approval_mode: string
          attribution_window_days: number
          commission_duration_months: number
          commission_fixed_cents: number
          commission_percent: number
          commission_type: string
          cookie_duration_days: number
          created_at: string
          eligibility: string
          enabled: boolean
          id: string
          lifetime_commission_percent: number
          minimum_payout_cents: number
          monthly_commission_percent: number
          monthly_paid_periods: number
          operational_verified_at: string | null
          payout_methods: string[]
          payout_provider_configured: boolean
          payout_schedule: string
          recurring: boolean
          refund_policy: string
          singleton: boolean
          terms: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          affiliate_approval_required?: boolean
          annual_commission_percent?: number
          approval_delay_days?: number
          approval_mode?: string
          attribution_window_days?: number
          commission_duration_months?: number
          commission_fixed_cents?: number
          commission_percent?: number
          commission_type?: string
          cookie_duration_days?: number
          created_at?: string
          eligibility?: string
          enabled?: boolean
          id?: string
          lifetime_commission_percent?: number
          minimum_payout_cents?: number
          monthly_commission_percent?: number
          monthly_paid_periods?: number
          operational_verified_at?: string | null
          payout_methods?: string[]
          payout_provider_configured?: boolean
          payout_schedule?: string
          recurring?: boolean
          refund_policy?: string
          singleton?: boolean
          terms?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          affiliate_approval_required?: boolean
          annual_commission_percent?: number
          approval_delay_days?: number
          approval_mode?: string
          attribution_window_days?: number
          commission_duration_months?: number
          commission_fixed_cents?: number
          commission_percent?: number
          commission_type?: string
          cookie_duration_days?: number
          created_at?: string
          eligibility?: string
          enabled?: boolean
          id?: string
          lifetime_commission_percent?: number
          minimum_payout_cents?: number
          monthly_commission_percent?: number
          monthly_paid_periods?: number
          operational_verified_at?: string | null
          payout_methods?: string[]
          payout_provider_configured?: boolean
          payout_schedule?: string
          recurring?: boolean
          refund_policy?: string
          singleton?: boolean
          terms?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      referral_webhook_events: {
        Row: {
          error: string | null
          event_id: string | null
          event_type: string | null
          id: string
          provider: string
          received_at: string
          result: string | null
          signature_ok: boolean
          source_ip_hash: string | null
          status_code: number
        }
        Insert: {
          error?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          provider?: string
          received_at?: string
          result?: string | null
          signature_ok?: boolean
          source_ip_hash?: string | null
          status_code?: number
        }
        Update: {
          error?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          provider?: string
          received_at?: string
          result?: string | null
          signature_ok?: boolean
          source_ip_hash?: string | null
          status_code?: number
        }
        Relationships: []
      }
      sending_account_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: string | null
          id: string
          sending_account_id: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          sending_account_id?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          sending_account_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sending_account_audit_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sending_account_audit_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sending_account_checks: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          duration_ms: number | null
          id: string
          kind: string
          message: string | null
          ok: boolean
          provider: string | null
          sending_account_id: string
          status_code: number | null
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          duration_ms?: number | null
          id?: string
          kind: string
          message?: string | null
          ok: boolean
          provider?: string | null
          sending_account_id: string
          status_code?: number | null
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          duration_ms?: number | null
          id?: string
          kind?: string
          message?: string | null
          ok?: boolean
          provider?: string | null
          sending_account_id?: string
          status_code?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sending_account_checks_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sending_account_checks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sending_account_secrets: {
        Row: {
          created_at: string
          credentials_ciphertext: string
          sending_account_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials_ciphertext: string
          sending_account_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials_ciphertext?: string
          sending_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sending_account_secrets_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: true
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sending_accounts: {
        Row: {
          admin_notes: string | null
          assigned_at: string | null
          auth_status: string
          connection_method: string | null
          created_at: string
          created_by: string | null
          customer_enabled: boolean
          daily_limit: number
          dkim_status: string
          dmarc_status: string
          domain_id: string | null
          from_email: string
          from_name: string
          health_score: number
          hourly_limit: number
          id: string
          label: string
          last_error: string | null
          last_reply_at: string | null
          last_sent_at: string | null
          last_tested_at: string | null
          mx_status: string
          pause_reason: string | null
          paused: boolean
          paused_at: string | null
          provider: Database["public"]["Enums"]["sending_provider"]
          provider_id: string | null
          reply_to: string | null
          sent_today: number
          spf_status: string
          status: Database["public"]["Enums"]["connection_status"]
          updated_at: string
          warmup_daily_target: number
          warmup_started_at: string | null
          warmup_status: string
          warmup_target_days: number
          workspace_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          assigned_at?: string | null
          auth_status?: string
          connection_method?: string | null
          created_at?: string
          created_by?: string | null
          customer_enabled?: boolean
          daily_limit?: number
          dkim_status?: string
          dmarc_status?: string
          domain_id?: string | null
          from_email: string
          from_name: string
          health_score?: number
          hourly_limit?: number
          id?: string
          label: string
          last_error?: string | null
          last_reply_at?: string | null
          last_sent_at?: string | null
          last_tested_at?: string | null
          mx_status?: string
          pause_reason?: string | null
          paused?: boolean
          paused_at?: string | null
          provider: Database["public"]["Enums"]["sending_provider"]
          provider_id?: string | null
          reply_to?: string | null
          sent_today?: number
          spf_status?: string
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
          warmup_daily_target?: number
          warmup_started_at?: string | null
          warmup_status?: string
          warmup_target_days?: number
          workspace_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          assigned_at?: string | null
          auth_status?: string
          connection_method?: string | null
          created_at?: string
          created_by?: string | null
          customer_enabled?: boolean
          daily_limit?: number
          dkim_status?: string
          dmarc_status?: string
          domain_id?: string | null
          from_email?: string
          from_name?: string
          health_score?: number
          hourly_limit?: number
          id?: string
          label?: string
          last_error?: string | null
          last_reply_at?: string | null
          last_sent_at?: string | null
          last_tested_at?: string | null
          mx_status?: string
          pause_reason?: string | null
          paused?: boolean
          paused_at?: string | null
          provider?: Database["public"]["Enums"]["sending_provider"]
          provider_id?: string | null
          reply_to?: string | null
          sent_today?: number
          spf_status?: string
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
          warmup_daily_target?: number
          warmup_started_at?: string | null
          warmup_status?: string
          warmup_target_days?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sending_accounts_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "sending_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sending_accounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "email_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sending_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sending_domain_tracking: {
        Row: {
          created_at: string
          custom_tracking_enabled: boolean
          domain_id: string
          fingerprint: string
          id: string
          last_error: string | null
          provider_id: string | null
          provider_region: string | null
          provider_tracking_identifier: string | null
          provider_type: string | null
          records: Json
          tracking_enabled: boolean
          tracking_hostname: string | null
          tracking_status: string
          updated_at: string
          verified_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          custom_tracking_enabled?: boolean
          domain_id: string
          fingerprint?: string
          id?: string
          last_error?: string | null
          provider_id?: string | null
          provider_region?: string | null
          provider_tracking_identifier?: string | null
          provider_type?: string | null
          records?: Json
          tracking_enabled?: boolean
          tracking_hostname?: string | null
          tracking_status?: string
          updated_at?: string
          verified_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          custom_tracking_enabled?: boolean
          domain_id?: string
          fingerprint?: string
          id?: string
          last_error?: string | null
          provider_id?: string | null
          provider_region?: string | null
          provider_tracking_identifier?: string | null
          provider_type?: string | null
          records?: Json
          tracking_enabled?: boolean
          tracking_hostname?: string | null
          tracking_status?: string
          updated_at?: string
          verified_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sending_domain_tracking_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: true
            referencedRelation: "sending_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sending_domain_tracking_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sending_domains: {
        Row: {
          created_at: string
          created_by: string | null
          disabled_at: string | null
          dkim_selector: string
          dkim_status: string
          dmarc_status: string
          dns_status: string
          domain: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          mx_status: string
          provider: string | null
          provider_assigned_at: string | null
          provider_checked_at: string | null
          provider_domain_id: string | null
          provider_error: string | null
          provider_id: string | null
          provider_locked_until: string | null
          provider_records: Json
          provider_status: string
          ready_at: string | null
          record_checks: Json
          registrar: string | null
          spf_status: string
          stage: string
          tracking_host: string | null
          tracking_status: string
          updated_at: string
          verified_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          dkim_selector: string
          dkim_status?: string
          dmarc_status?: string
          dns_status?: string
          domain: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          mx_status?: string
          provider?: string | null
          provider_assigned_at?: string | null
          provider_checked_at?: string | null
          provider_domain_id?: string | null
          provider_error?: string | null
          provider_id?: string | null
          provider_locked_until?: string | null
          provider_records?: Json
          provider_status?: string
          ready_at?: string | null
          record_checks?: Json
          registrar?: string | null
          spf_status?: string
          stage?: string
          tracking_host?: string | null
          tracking_status?: string
          updated_at?: string
          verified_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          dkim_selector?: string
          dkim_status?: string
          dmarc_status?: string
          dns_status?: string
          domain?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          mx_status?: string
          provider?: string | null
          provider_assigned_at?: string | null
          provider_checked_at?: string | null
          provider_domain_id?: string | null
          provider_error?: string | null
          provider_id?: string | null
          provider_locked_until?: string | null
          provider_records?: Json
          provider_status?: string
          ready_at?: string | null
          record_checks?: Json
          registrar?: string | null
          spf_status?: string
          stage?: string
          tracking_host?: string | null
          tracking_status?: string
          updated_at?: string
          verified_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sending_domains_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      service_alerts: {
        Row: {
          alert_type: string
          created_at: string
          ends_at: string | null
          id: string
          message: string
          published: boolean
          resolved_at: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          alert_type?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          message?: string
          published?: boolean
          resolved_at?: string | null
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          message?: string
          published?: boolean
          resolved_at?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_faqs: {
        Row: {
          answer: string
          category: string
          created_at: string
          id: string
          page_slug: string
          published: boolean
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string
          created_at?: string
          id?: string
          page_slug: string
          published?: boolean
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string
          created_at?: string
          id?: string
          page_slug?: string
          published?: boolean
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      site_nav_items: {
        Row: {
          created_at: string
          description: string | null
          group_label: string | null
          href: string
          icon: string | null
          id: string
          is_external: boolean
          is_visible: boolean
          label: string
          location: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          group_label?: string | null
          href: string
          icon?: string | null
          id?: string
          is_external?: boolean
          is_visible?: boolean
          label: string
          location: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          group_label?: string | null
          href?: string
          icon?: string | null
          id?: string
          is_external?: boolean
          is_visible?: boolean
          label?: string
          location?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_nav_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "site_nav_items"
            referencedColumns: ["id"]
          },
        ]
      }
      site_pages: {
        Row: {
          canonical_url: string | null
          changefreq: string
          created_at: string
          id: string
          include_in_sitemap: boolean
          meta_description: string | null
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          path: string
          priority: number
          robots_follow: boolean
          robots_index: boolean
          section: string
          seo_title: string | null
          status: string
          structured_data: Json | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          canonical_url?: string | null
          changefreq?: string
          created_at?: string
          id?: string
          include_in_sitemap?: boolean
          meta_description?: string | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          path: string
          priority?: number
          robots_follow?: boolean
          robots_index?: boolean
          section?: string
          seo_title?: string | null
          status?: string
          structured_data?: Json | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          canonical_url?: string | null
          changefreq?: string
          created_at?: string
          id?: string
          include_in_sitemap?: boolean
          meta_description?: string | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          path?: string
          priority?: number
          robots_follow?: boolean
          robots_index?: boolean
          section?: string
          seo_title?: string | null
          status?: string
          structured_data?: Json | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      site_redirects: {
        Row: {
          created_at: string
          created_by: string | null
          destination_path: string
          id: string
          is_active: boolean
          note: string | null
          source_path: string
          status_code: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destination_path: string
          id?: string
          is_active?: boolean
          note?: string | null
          source_path: string
          status_code?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destination_path?: string
          id?: string
          is_active?: boolean
          note?: string | null
          source_path?: string
          status_code?: number
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      subprocessors: {
        Row: {
          created_at: string
          data_processed: string
          id: string
          location: string
          provider: string
          published: boolean
          purpose: string
          service: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_processed?: string
          id?: string
          location?: string
          provider: string
          published?: boolean
          purpose?: string
          service?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_processed?: string
          id?: string
          location?: string
          provider?: string
          published?: boolean
          purpose?: string
          service?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_ticket_messages: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          author_id: string | null
          author_role: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          author_id?: string | null
          author_role?: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          author_id?: string | null
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_ratings: {
        Row: {
          created_at: string
          feedback: string | null
          id: string
          rating: number
          ticket_id: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          id?: string
          rating: number
          ticket_id: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          feedback?: string | null
          id?: string
          rating?: number
          ticket_id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_ratings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_ratings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          ai_conversation: Json | null
          assigned_to: string | null
          category: string
          closed_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_workspace: string | null
          created_at: string
          created_by: string | null
          customer_last_read_at: string | null
          id: string
          last_message_at: string
          priority: string
          source: string
          staff_last_read_at: string | null
          status: string
          subject: string
          ticket_ref: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          ai_conversation?: Json | null
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_workspace?: string | null
          created_at?: string
          created_by?: string | null
          customer_last_read_at?: string | null
          id?: string
          last_message_at?: string
          priority?: string
          source?: string
          staff_last_read_at?: string | null
          status?: string
          subject: string
          ticket_ref?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          ai_conversation?: Json | null
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_workspace?: string | null
          created_at?: string
          created_by?: string | null
          customer_last_read_at?: string | null
          id?: string
          last_message_at?: string
          priority?: string
          source?: string
          staff_last_read_at?: string | null
          status?: string
          subject?: string
          ticket_ref?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      template_uses: {
        Row: {
          id: string
          template_id: string
          used_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          template_id: string
          used_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          template_id?: string
          used_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_uses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_uses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          active: boolean
          avatar_url: string | null
          bio: string | null
          category: string
          company: string
          company_logo_url: string | null
          created_at: string
          display_order: number
          featured: boolean
          id: string
          name: string
          pages: string[]
          rating: number
          result: string | null
          reviewed_on: string
          role: string
          testimonial: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          bio?: string | null
          category?: string
          company?: string
          company_logo_url?: string | null
          created_at?: string
          display_order?: number
          featured?: boolean
          id?: string
          name: string
          pages?: string[]
          rating?: number
          result?: string | null
          reviewed_on?: string
          role?: string
          testimonial: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          bio?: string | null
          category?: string
          company?: string
          company_logo_url?: string | null
          created_at?: string
          display_order?: number
          featured?: boolean
          id?: string
          name?: string
          pages?: string[]
          rating?: number
          result?: string | null
          reviewed_on?: string
          role?: string
          testimonial?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: []
      }
      transactional_emails: {
        Row: {
          attempts: number
          bounce_reason: string | null
          created_at: string
          delivered_at: string | null
          error: string | null
          event_key: string
          failed_at: string | null
          from_email: string | null
          html: string | null
          id: string
          idempotency_key: string | null
          max_attempts: number
          next_attempt_at: string
          provider: string | null
          provider_message_id: string | null
          provider_status_code: number | null
          queued_at: string
          reply_to: string | null
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
          template_version: number | null
          test_mode: boolean
          text_body: string | null
          to_email: string
          updated_at: string
          user_id: string | null
          variables: Json
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          bounce_reason?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event_key: string
          failed_at?: string | null
          from_email?: string | null
          html?: string | null
          id?: string
          idempotency_key?: string | null
          max_attempts?: number
          next_attempt_at?: string
          provider?: string | null
          provider_message_id?: string | null
          provider_status_code?: number | null
          queued_at?: string
          reply_to?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template_id?: string | null
          template_version?: number | null
          test_mode?: boolean
          text_body?: string | null
          to_email: string
          updated_at?: string
          user_id?: string | null
          variables?: Json
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          bounce_reason?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event_key?: string
          failed_at?: string | null
          from_email?: string | null
          html?: string | null
          id?: string
          idempotency_key?: string | null
          max_attempts?: number
          next_attempt_at?: string
          provider?: string | null
          provider_message_id?: string | null
          provider_status_code?: number | null
          queued_at?: string
          reply_to?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          template_version?: number | null
          test_mode?: boolean
          text_body?: string | null
          to_email?: string
          updated_at?: string
          user_id?: string | null
          variables?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactional_emails_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "transactional_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      transactional_template_versions: {
        Row: {
          from_email: string | null
          from_name: string | null
          html: string
          id: string
          preheader: string | null
          published_at: string
          published_by: string | null
          reply_to: string | null
          subject: string
          template_id: string
          text_body: string | null
          version: number
        }
        Insert: {
          from_email?: string | null
          from_name?: string | null
          html: string
          id?: string
          preheader?: string | null
          published_at?: string
          published_by?: string | null
          reply_to?: string | null
          subject: string
          template_id: string
          text_body?: string | null
          version: number
        }
        Update: {
          from_email?: string | null
          from_name?: string | null
          html?: string
          id?: string
          preheader?: string | null
          published_at?: string
          published_by?: string | null
          reply_to?: string | null
          subject?: string
          template_id?: string
          text_body?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactional_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "transactional_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      transactional_templates: {
        Row: {
          category: string
          created_at: string
          draft: Json | null
          enabled: boolean
          event_key: string
          from_email: string | null
          from_name: string | null
          html: string
          id: string
          is_default: boolean
          name: string
          preheader: string | null
          reply_to: string | null
          status: string
          subject: string
          text_body: string | null
          updated_at: string
          updated_by: string | null
          variables: string[]
          version: number
        }
        Insert: {
          category: string
          created_at?: string
          draft?: Json | null
          enabled?: boolean
          event_key: string
          from_email?: string | null
          from_name?: string | null
          html: string
          id?: string
          is_default?: boolean
          name: string
          preheader?: string | null
          reply_to?: string | null
          status?: string
          subject: string
          text_body?: string | null
          updated_at?: string
          updated_by?: string | null
          variables?: string[]
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          draft?: Json | null
          enabled?: boolean
          event_key?: string
          from_email?: string | null
          from_name?: string | null
          html?: string
          id?: string
          is_default?: boolean
          name?: string
          preheader?: string | null
          reply_to?: string | null
          status?: string
          subject?: string
          text_body?: string | null
          updated_at?: string
          updated_by?: string | null
          variables?: string[]
          version?: number
        }
        Relationships: []
      }
      unmatched_inbound_emails: {
        Row: {
          body: string | null
          created_at: string
          from_email: string
          from_name: string | null
          html: string | null
          id: string
          in_reply_to: string | null
          message_id: string | null
          reason: string | null
          received_at: string
          reference_ids: string[]
          resolved_at: string | null
          resolved_conversation_id: string | null
          subject: string | null
          to_email: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          from_email: string
          from_name?: string | null
          html?: string | null
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          reason?: string | null
          received_at?: string
          reference_ids?: string[]
          resolved_at?: string | null
          resolved_conversation_id?: string | null
          subject?: string | null
          to_email: string
        }
        Update: {
          body?: string | null
          created_at?: string
          from_email?: string
          from_name?: string | null
          html?: string | null
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          reason?: string | null
          received_at?: string
          reference_ids?: string[]
          resolved_at?: string | null
          resolved_conversation_id?: string | null
          subject?: string | null
          to_email?: string
        }
        Relationships: []
      }
      usage_audit_log: {
        Row: {
          action: string
          allowed: boolean
          amount: number
          created_at: string
          id: string
          limit_value: number | null
          period_start: string | null
          plan_id: string | null
          plan_name: string | null
          reason: string | null
          resource: string
          used_after: number | null
          workspace_id: string
        }
        Insert: {
          action: string
          allowed?: boolean
          amount?: number
          created_at?: string
          id?: string
          limit_value?: number | null
          period_start?: string | null
          plan_id?: string | null
          plan_name?: string | null
          reason?: string | null
          resource: string
          used_after?: number | null
          workspace_id: string
        }
        Update: {
          action?: string
          allowed?: boolean
          amount?: number
          created_at?: string
          id?: string
          limit_value?: number | null
          period_start?: string | null
          plan_id?: string | null
          plan_name?: string | null
          reason?: string | null
          resource?: string
          used_after?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warmup_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          message_count: number
          recipient_account_id: string
          sender_account_id: string
          status: string
          subject: string
          thread_key: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          recipient_account_id: string
          sender_account_id: string
          status?: string
          subject: string
          thread_key: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          recipient_account_id?: string
          sender_account_id?: string
          status?: string
          subject?: string
          thread_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_conversations_recipient_account_id_fkey"
            columns: ["recipient_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_conversations_sender_account_id_fkey"
            columns: ["sender_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_daily_stats: {
        Row: {
          bounced: number
          complained: number
          created_at: string
          day: string
          deferred: number
          delivered: number
          failed: number
          health_score: number | null
          id: string
          inbox: number
          not_received: number
          planned_target: number | null
          rejected: number
          replied: number
          scheduled: number
          sending_account_id: string
          sent: number
          spam: number
          stage: string | null
          stage_action: string | null
          target: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bounced?: number
          complained?: number
          created_at?: string
          day: string
          deferred?: number
          delivered?: number
          failed?: number
          health_score?: number | null
          id?: string
          inbox?: number
          not_received?: number
          planned_target?: number | null
          rejected?: number
          replied?: number
          scheduled?: number
          sending_account_id: string
          sent?: number
          spam?: number
          stage?: string | null
          stage_action?: string | null
          target?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bounced?: number
          complained?: number
          created_at?: string
          day?: string
          deferred?: number
          delivered?: number
          failed?: number
          health_score?: number | null
          id?: string
          inbox?: number
          not_received?: number
          planned_target?: number | null
          rejected?: number
          replied?: number
          scheduled?: number
          sending_account_id?: string
          sent?: number
          spam?: number
          stage?: string | null
          stage_action?: string | null
          target?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_daily_stats_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_daily_stats_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_events: {
        Row: {
          detail: string | null
          external_id: string | null
          id: string
          job_id: string | null
          occurred_at: string
          payload: Json
          provider: string | null
          provider_message_id: string | null
          sending_account_id: string
          type: string
          workspace_id: string
        }
        Insert: {
          detail?: string | null
          external_id?: string | null
          id?: string
          job_id?: string | null
          occurred_at?: string
          payload?: Json
          provider?: string | null
          provider_message_id?: string | null
          sending_account_id: string
          type: string
          workspace_id: string
        }
        Update: {
          detail?: string | null
          external_id?: string | null
          id?: string
          job_id?: string | null
          occurred_at?: string
          payload?: Json
          provider?: string | null
          provider_message_id?: string | null
          sending_account_id?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "warmup_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_events_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_health: {
        Row: {
          computed_at: string
          factors: Json
          id: string
          recommendation: string | null
          score: number
          sending_account_id: string
          status: string
          workspace_id: string
        }
        Insert: {
          computed_at?: string
          factors?: Json
          id?: string
          recommendation?: string | null
          score: number
          sending_account_id: string
          status: string
          workspace_id: string
        }
        Update: {
          computed_at?: string
          factors?: Json
          id?: string
          recommendation?: string | null
          score?: number
          sending_account_id?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_health_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_health_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_jobs: {
        Row: {
          attempts: number
          body: string
          conversation_id: string | null
          created_at: string
          delivered_at: string | null
          delivered_source: string | null
          delivery_state: string
          error: string | null
          from_email: string
          id: string
          idempotency_key: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string | null
          placement: string
          placement_checked_at: string | null
          pool_recipient_id: string | null
          processed_at: string | null
          provider: string | null
          provider_message_id: string | null
          received_at: string | null
          recipient_account_id: string | null
          role: string
          scheduled_at: string
          send_reserved_at: string | null
          sending_account_id: string
          status: string
          subject: string
          to_email: string
          warmup_token: string | null
          workspace_id: string
        }
        Insert: {
          attempts?: number
          body: string
          conversation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivered_source?: string | null
          delivery_state?: string
          error?: string | null
          from_email: string
          id?: string
          idempotency_key: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          placement?: string
          placement_checked_at?: string | null
          pool_recipient_id?: string | null
          processed_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          received_at?: string | null
          recipient_account_id?: string | null
          role?: string
          scheduled_at?: string
          send_reserved_at?: string | null
          sending_account_id: string
          status?: string
          subject: string
          to_email: string
          warmup_token?: string | null
          workspace_id: string
        }
        Update: {
          attempts?: number
          body?: string
          conversation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivered_source?: string | null
          delivery_state?: string
          error?: string | null
          from_email?: string
          id?: string
          idempotency_key?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          placement?: string
          placement_checked_at?: string | null
          pool_recipient_id?: string | null
          processed_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          received_at?: string | null
          recipient_account_id?: string | null
          role?: string
          scheduled_at?: string
          send_reserved_at?: string | null
          sending_account_id?: string
          status?: string
          subject?: string
          to_email?: string
          warmup_token?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_jobs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "warmup_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_jobs_pool_recipient_id_fkey"
            columns: ["pool_recipient_id"]
            isOneToOne: false
            referencedRelation: "warmup_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_jobs_recipient_account_id_fkey"
            columns: ["recipient_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_jobs_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_recipients: {
        Row: {
          bounce_count: number
          created_at: string
          created_by: string | null
          email: string
          enabled: boolean
          id: string
          last_bounce_at: string | null
          last_error: string | null
          last_received_at: string | null
          last_sent_at: string | null
          mailbox_provider: string | null
          name: string | null
          notes: string | null
          received_count: number
          reply_count: number
          sent_count: number
          status: string
          updated_at: string
        }
        Insert: {
          bounce_count?: number
          created_at?: string
          created_by?: string | null
          email: string
          enabled?: boolean
          id?: string
          last_bounce_at?: string | null
          last_error?: string | null
          last_received_at?: string | null
          last_sent_at?: string | null
          mailbox_provider?: string | null
          name?: string | null
          notes?: string | null
          received_count?: number
          reply_count?: number
          sent_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          bounce_count?: number
          created_at?: string
          created_by?: string | null
          email?: string
          enabled?: boolean
          id?: string
          last_bounce_at?: string | null
          last_error?: string | null
          last_received_at?: string | null
          last_sent_at?: string | null
          mailbox_provider?: string | null
          name?: string | null
          notes?: string | null
          received_count?: number
          reply_count?: number
          sent_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      warmup_runner_state: {
        Row: {
          id: string
          last_result: Json
          last_run_at: string | null
          lease_owner: string | null
          lease_until: string | null
          pause_reason: string | null
          paused: boolean
          updated_at: string
        }
        Insert: {
          id: string
          last_result?: Json
          last_run_at?: string | null
          lease_owner?: string | null
          lease_until?: string | null
          pause_reason?: string | null
          paused?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          last_result?: Json
          last_run_at?: string | null
          lease_owner?: string | null
          lease_until?: string | null
          pause_reason?: string | null
          paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      warmup_settings: {
        Row: {
          auto_pause: boolean
          created_at: string
          current_volume: number | null
          daily_increase: number
          enabled: boolean
          hold_failure_rate: number
          id: string
          last_run_at: string | null
          last_run_reason: string | null
          manual_daily_limit: number | null
          max_bounce_rate: number
          max_volume: number
          min_health_score: number
          mode: string
          pause_reason: string | null
          paused_at: string | null
          paused_by_system: boolean
          progression_date: string | null
          progression_day: number | null
          progression_limit: number | null
          progression_mode: string
          progression_review_required: boolean
          progression_stages: Json
          ramp_days: number
          ramp_stage: string
          recovery_bounce_rate: number
          recovery_days: number
          reply_rate: number
          send_days: number[]
          send_end_hour: number
          send_start_hour: number
          sending_account_id: string
          solo_mode: boolean
          stage_reason: string | null
          stage_since: string | null
          start_volume: number
          started_at: string | null
          timezone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_pause?: boolean
          created_at?: string
          current_volume?: number | null
          daily_increase?: number
          enabled?: boolean
          hold_failure_rate?: number
          id?: string
          last_run_at?: string | null
          last_run_reason?: string | null
          manual_daily_limit?: number | null
          max_bounce_rate?: number
          max_volume?: number
          min_health_score?: number
          mode?: string
          pause_reason?: string | null
          paused_at?: string | null
          paused_by_system?: boolean
          progression_date?: string | null
          progression_day?: number | null
          progression_limit?: number | null
          progression_mode?: string
          progression_review_required?: boolean
          progression_stages?: Json
          ramp_days?: number
          ramp_stage?: string
          recovery_bounce_rate?: number
          recovery_days?: number
          reply_rate?: number
          send_days?: number[]
          send_end_hour?: number
          send_start_hour?: number
          sending_account_id: string
          solo_mode?: boolean
          stage_reason?: string | null
          stage_since?: string | null
          start_volume?: number
          started_at?: string | null
          timezone?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_pause?: boolean
          created_at?: string
          current_volume?: number | null
          daily_increase?: number
          enabled?: boolean
          hold_failure_rate?: number
          id?: string
          last_run_at?: string | null
          last_run_reason?: string | null
          manual_daily_limit?: number | null
          max_bounce_rate?: number
          max_volume?: number
          min_health_score?: number
          mode?: string
          pause_reason?: string | null
          paused_at?: string | null
          paused_by_system?: boolean
          progression_date?: string | null
          progression_day?: number | null
          progression_limit?: number | null
          progression_mode?: string
          progression_review_required?: boolean
          progression_stages?: Json
          ramp_days?: number
          ramp_stage?: string
          recovery_bounce_rate?: number
          recovery_days?: number
          reply_rate?: number
          send_days?: number[]
          send_end_hour?: number
          send_start_hour?: number
          sending_account_id?: string
          solo_mode?: boolean
          stage_reason?: string | null
          stage_since?: string | null
          start_volume?: number
          started_at?: string | null
          timezone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_settings_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: true
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          endpoint_id: string
          event_id: string
          event_type: string
          failure_reason: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          response_status: number | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          endpoint_id: string
          event_id: string
          event_type: string
          failure_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          response_status?: number | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          endpoint_id?: string
          event_id?: string
          event_type?: string
          failure_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          response_status?: number | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          consecutive_failures: number
          created_at: string
          created_by: string | null
          description: string | null
          events: string[]
          id: string
          last_delivery_at: string | null
          last_delivery_status: string | null
          secret_ciphertext: string | null
          secret_hash: string
          status: string
          updated_at: string
          url: string
          workspace_id: string
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          events?: string[]
          id?: string
          last_delivery_at?: string | null
          last_delivery_status?: string | null
          secret_ciphertext?: string | null
          secret_hash: string
          status?: string
          updated_at?: string
          url: string
          workspace_id: string
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          events?: string[]
          id?: string
          last_delivery_at?: string | null
          last_delivery_status?: string | null
          secret_ciphertext?: string | null
          secret_hash?: string
          status?: string
          updated_at?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_health: {
        Row: {
          current_jobs: number
          failure_count: number
          last_duration_ms: number | null
          last_error: string | null
          last_failed_at: string | null
          last_started_at: string | null
          last_succeeded_at: string | null
          lease_until: string | null
          status: string
          updated_at: string
          worker: string
        }
        Insert: {
          current_jobs?: number
          failure_count?: number
          last_duration_ms?: number | null
          last_error?: string | null
          last_failed_at?: string | null
          last_started_at?: string | null
          last_succeeded_at?: string | null
          lease_until?: string | null
          status?: string
          updated_at?: string
          worker: string
        }
        Update: {
          current_jobs?: number
          failure_count?: number
          last_duration_ms?: number | null
          last_error?: string | null
          last_failed_at?: string | null
          last_started_at?: string | null
          last_succeeded_at?: string | null
          lease_until?: string | null
          status?: string
          updated_at?: string
          worker?: string
        }
        Relationships: []
      }
      workspace_activity: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: string | null
          id: string
          target_email: string | null
          target_user_id: string | null
          type: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          target_email?: string | null
          target_user_id?: string | null
          type: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          target_email?: string | null
          target_user_id?: string | null
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_activity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_ai_keys: {
        Row: {
          created_at: string
          created_by: string | null
          key_ciphertext: string
          key_last4: string | null
          last_error: string | null
          model: string
          provider: string
          status: string
          updated_at: string
          verified_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          key_ciphertext: string
          key_last4?: string | null
          last_error?: string | null
          model?: string
          provider?: string
          status?: string
          updated_at?: string
          verified_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          key_ciphertext?: string
          key_last4?: string | null
          last_error?: string | null
          model?: string
          provider?: string
          status?: string
          updated_at?: string
          verified_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_ai_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_credits: {
        Row: {
          allocated_total: number
          balance: number
          consumed_total: number
          last_allocated_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          allocated_total?: number
          balance?: number
          consumed_total?: number
          last_allocated_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          allocated_total?: number
          balance?: number
          consumed_total?: number
          last_allocated_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_credits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          message: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          status: string
          token: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          message?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          token: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          message?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          token?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          last_active_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_active_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_active_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          billing_interval: string
          created_at: string
          current_period_end: string | null
          external_customer_id: string | null
          external_subscription_id: string | null
          id: string
          payment_status: string
          plan_id: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          current_period_end?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          payment_status?: string
          plan_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          current_period_end?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          payment_status?: string
          plan_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_usage_counters: {
        Row: {
          period_start: string
          resource: string
          updated_at: string
          used: number
          workspace_id: string
        }
        Insert: {
          period_start: string
          resource: string
          updated_at?: string
          used?: number
          workspace_id: string
        }
        Update: {
          period_start?: string
          resource?: string
          updated_at?: string
          used?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_usage_counters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          checklist_dismissed: boolean
          company_name: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          onboarding_completed: boolean
          outreach_goal: string | null
          outreach_type: string | null
          owner_id: string
          persona: string | null
          send_days: number[]
          send_end_hour: number
          send_start_hour: number
          sending_timezone: string | null
          slug: string
          status: string
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          team_size: string | null
          timezone: string
          trial_consumed_at: string | null
          updated_at: string
        }
        Insert: {
          checklist_dismissed?: boolean
          company_name?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          onboarding_completed?: boolean
          outreach_goal?: string | null
          outreach_type?: string | null
          owner_id: string
          persona?: string | null
          send_days?: number[]
          send_end_hour?: number
          send_start_hour?: number
          sending_timezone?: string | null
          slug: string
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          team_size?: string | null
          timezone?: string
          trial_consumed_at?: string | null
          updated_at?: string
        }
        Update: {
          checklist_dismissed?: boolean
          company_name?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          onboarding_completed?: boolean
          outreach_goal?: string | null
          outreach_type?: string | null
          owner_id?: string
          persona?: string | null
          send_days?: number[]
          send_end_hour?: number
          send_start_hour?: number
          sending_timezone?: string | null
          slug?: string
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          team_size?: string | null
          timezone?: string
          trial_consumed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invitation: { Args: { _token: string }; Returns: string }
      adjust_affiliate_balance: {
        Args: {
          _delta: number
          _environment?: string
          _profile: string
          _reason: string
          _request_key: string
        }
        Returns: string
      }
      admin_rate_limit_hit: {
        Args: { _bucket: string; _limit: number; _window_seconds: number }
        Returns: Json
      }
      affiliate_admin_earnings: {
        Args: { _environment?: string }
        Returns: Json
      }
      affiliate_dashboard_stats: { Args: never; Returns: Json }
      affiliate_private_preferences: {
        Args: { _details: string; _method: string; _user_id: string }
        Returns: undefined
      }
      affiliate_private_summary: { Args: { _user_id: string }; Returns: Json }
      affiliate_program_public: { Args: never; Returns: Json }
      affiliate_reserved: {
        Args: { _environment: string; _profile: string }
        Returns: number
      }
      affiliate_spendable: {
        Args: { _environment: string; _profile: string }
        Returns: number
      }
      analytics_by_account: {
        Args: { _from: string; _to: string; _workspace_id: string }
        Returns: {
          account_id: string
          bounced: number
          clicks: number
          delivered: number
          from_email: string
          opens: number
          replies: number
          sent: number
          unsubscribed: number
        }[]
      }
      analytics_by_campaign: {
        Args: { _from: string; _to: string; _workspace_id: string }
        Returns: {
          bounced: number
          campaign_id: string
          campaign_name: string
          clicks: number
          delivered: number
          opens: number
          replies: number
          sent: number
          status: string
          unsubscribed: number
        }[]
      }
      analytics_summary: {
        Args: { _from: string; _to: string; _workspace_id: string }
        Returns: {
          bounced: number
          clicks: number
          complained: number
          delivered: number
          failed: number
          opens: number
          replies: number
          sent: number
          unsubscribed: number
        }[]
      }
      analytics_timeseries: {
        Args: {
          _bucket?: string
          _from: string
          _to: string
          _workspace_id: string
        }
        Returns: {
          bounced: number
          bucket: string
          clicks: number
          delivered: number
          opens: number
          replies: number
          sent: number
          unsubscribed: number
        }[]
      }
      api_rate_limit_hit: {
        Args: { _api_key_id: string; _limit: number; _window_start: string }
        Returns: number
      }
      apply_credit_change: {
        Args: {
          _actor?: string
          _actor_user_id?: string
          _amount: number
          _entry_type: string
          _reason?: string
          _reference?: string
          _user_id?: string
          _workspace_id: string
        }
        Returns: {
          actor: string
          actor_user_id: string | null
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          entry_type: string
          id: string
          metadata: Json
          reason: string | null
          reference: string | null
          user_id: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      campaign_ai_missing_count: {
        Args: { _campaign_id: string }
        Returns: number
      }
      campaign_eligible_lead_count: {
        Args: { _campaign_id: string }
        Returns: number
      }
      campaign_eligible_leads: {
        Args: { _after?: string; _campaign_id: string; _limit?: number }
        Returns: {
          city: string
          company: string
          country: string
          custom_fields: Json
          email: string
          first_name: string
          id: string
          job_title: string
          last_name: string
          linkedin_url: string
          phone: string
          state: string
          website: string
        }[]
      }
      campaign_overview_rollup: {
        Args: { _workspace_id: string }
        Returns: {
          bounced: number
          campaign_id: string
          contacted: number
          failed: number
          leads: number
          meetings: number
          positive_replies: number
          replies: number
          sent: number
          sent_today: number
        }[]
      }
      campaign_page_summary: {
        Args: { _campaign_id: string; _day_start: string }
        Returns: Json
      }
      campaign_recipients_missing_first_message: {
        Args: { _after?: string; _campaign_id: string; _limit?: number }
        Returns: {
          city: string
          company: string
          country: string
          custom_fields: Json
          email: string
          first_name: string
          job_title: string
          last_name: string
          lead_id: string
          linkedin_url: string
          phone: string
          recipient_id: string
          sending_account_id: string
          state: string
          website: string
        }[]
      }
      campaign_stats: {
        Args: {
          _campaign_ids?: string[]
          _from?: string
          _to?: string
          _workspace_id: string
        }
        Returns: {
          bounced: number
          campaign_id: string
          campaign_name: string
          clicked: number
          complained: number
          delivered: number
          failed: number
          leads: number
          opened: number
          positive_replied: number
          queued: number
          remaining: number
          replied: number
          sending: number
          sent: number
          status: string
          unsubscribed: number
        }[]
      }
      claim_ai_personalization_jobs: {
        Args: { _limit: number; _worker: string }
        Returns: {
          accepted: boolean
          attempts: number
          campaign_id: string
          completed_at: string | null
          content: string | null
          created_at: string
          data_used: string[]
          edited: boolean
          error: string | null
          id: string
          instructions: string
          lead_id: string
          locked_by: string | null
          locked_until: string | null
          model: string | null
          pain_points: Json
          prompt_hash: string
          quality: string
          started_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_personalizations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_automation_runs: {
        Args: { _limit: number; _worker: string }
        Returns: {
          attempts: number
          automation_id: string
          automation_version: number
          branch: string | null
          campaign_id: string | null
          completed_at: string | null
          created_at: string
          current_step: number
          definition: Json
          error: string | null
          event_id: string | null
          id: string
          lead_id: string | null
          locked_at: string | null
          locked_by: string | null
          metadata: Json
          result: string | null
          resume_at: string | null
          started_at: string | null
          status: string
          trigger_type: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "automation_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_background_jobs: {
        Args: { _lease_seconds: number; _limit: number; _worker: string }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          job_type: string
          last_error: string | null
          lease_owner: string | null
          lease_until: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          started_at: string | null
          status: string
          updated_at: string
          worker: string
        }[]
        SetofOptions: {
          from: "*"
          to: "background_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_warmup_jobs: {
        Args: { _limit: number; _worker: string }
        Returns: {
          attempts: number
          body: string
          conversation_id: string | null
          created_at: string
          delivered_at: string | null
          delivered_source: string | null
          delivery_state: string
          error: string | null
          from_email: string
          id: string
          idempotency_key: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string | null
          placement: string
          placement_checked_at: string | null
          pool_recipient_id: string | null
          processed_at: string | null
          provider: string | null
          provider_message_id: string | null
          received_at: string | null
          recipient_account_id: string | null
          role: string
          scheduled_at: string
          send_reserved_at: string | null
          sending_account_id: string
          status: string
          subject: string
          to_email: string
          warmup_token: string | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "warmup_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_warmup_jobs_for_account: {
        Args: { _account: string; _limit: number; _worker: string }
        Returns: {
          attempts: number
          body: string
          conversation_id: string | null
          created_at: string
          delivered_at: string | null
          delivered_source: string | null
          delivery_state: string
          error: string | null
          from_email: string
          id: string
          idempotency_key: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string | null
          placement: string
          placement_checked_at: string | null
          pool_recipient_id: string | null
          processed_at: string | null
          provider: string | null
          provider_message_id: string | null
          received_at: string | null
          recipient_account_id: string | null
          role: string
          scheduled_at: string
          send_reserved_at: string | null
          sending_account_id: string
          status: string
          subject: string
          to_email: string
          warmup_token: string | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "warmup_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      consume_workspace_usage: {
        Args: {
          _amount: number
          _limit?: number
          _period_start: string
          _resource: string
          _workspace_id: string
        }
        Returns: Json
      }
      consume_workspace_usage_v2: {
        Args: {
          _amount?: number
          _dry_run?: boolean
          _environment?: string
          _reason?: string
          _resource: string
          _workspace_id: string
        }
        Returns: Json
      }
      delete_crm_stage: {
        Args: { _move_to: string; _stage_id: string }
        Returns: undefined
      }
      delete_workspace: {
        Args: { _confirm: string; _workspace_id: string }
        Returns: undefined
      }
      ensure_crm_stages: { Args: { _workspace_id: string }; Returns: undefined }
      ensure_referral_profile: {
        Args: never
        Returns: {
          code: string
          created_at: string
          id: string
          payout_destination_hint: string | null
          payout_method: string | null
          status: string
          suspended_reason: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "referral_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finish_background_job: {
        Args: { _error?: string; _id: string; _ok: boolean }
        Returns: undefined
      }
      generate_appsumo_codes: {
        Args: { _batch?: string; _count: number }
        Returns: number
      }
      has_admin_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_role: {
        Args: {
          _roles: Database["public"]["Enums"]["workspace_role"][]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      help_center_override_slugs: {
        Args: never
        Returns: {
          slug: string
        }[]
      }
      invite_workspace_member: {
        Args: {
          _email: string
          _message?: string
          _role: Database["public"]["Enums"]["workspace_role"]
          _workspace_id: string
        }
        Returns: {
          id: string
          token: string
        }[]
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      mailbox_read_secret: { Args: { _id: string }; Returns: string }
      mailbox_store_secret: {
        Args: { _label?: string; _value: string }
        Returns: string
      }
      move_crm_contacts: {
        Args: { _lead_ids: string[]; _stage_id: string }
        Returns: number
      }
      process_affiliate_payment: { Args: { _input: Json }; Returns: Json }
      provider_record_usage: {
        Args: { _failed?: number; _provider_id: string; _sent?: number }
        Returns: undefined
      }
      public_auth_settings: {
        Args: never
        Returns: {
          google_enabled: boolean
        }[]
      }
      public_platform_config: { Args: never; Returns: Json }
      public_platform_flags: {
        Args: never
        Returns: {
          google_enabled: boolean
          maintenance_message: string
          maintenance_mode: boolean
          registration_enabled: boolean
        }[]
      }
      public_review_stats: {
        Args: never
        Returns: {
          average_rating: number
          campaigns: number
          customers: number
          emails_sent: number
          reviews: number
        }[]
      }
      publish_due_blog_posts: { Args: never; Returns: number }
      record_affiliate_payout_proof: {
        Args: {
          _id: string
          _key: string
          _mime: string
          _name: string
          _payout: string
          _size: number
        }
        Returns: undefined
      }
      redeem_appsumo_code: {
        Args: {
          _code: string
          _email: string
          _environment: Database["public"]["Enums"]["billing_environment"]
          _ip: string
          _user_agent: string
          _user_id: string
          _workspace_id: string
        }
        Returns: Json
      }
      referral_dashboard_stats: {
        Args: never
        Returns: {
          active_customers: number
          approved_cents: number
          available_cents: number
          clicks: number
          customers: number
          paid_cents: number
          pending_cents: number
          requested_cents: number
          reversed_cents: number
          signups: number
        }[]
      }
      referral_program_public: {
        Args: never
        Returns: {
          approval_delay_days: number
          approval_mode: string
          attribution_window_days: number
          commission_duration_months: number
          commission_fixed_cents: number
          commission_percent: number
          commission_type: string
          eligibility: string
          enabled: boolean
          minimum_payout_cents: number
          payout_methods: string[]
          payout_provider_configured: boolean
          payout_schedule: string
          recurring: boolean
          terms: string
        }[]
      }
      release_campaign_send: {
        Args: { _campaign_id: string }
        Returns: undefined
      }
      release_workspace_usage: {
        Args: {
          _amount: number
          _period_start: string
          _resource: string
          _workspace_id: string
        }
        Returns: undefined
      }
      release_workspace_usage_v2: {
        Args: {
          _amount?: number
          _environment?: string
          _reason?: string
          _resource: string
          _workspace_id: string
        }
        Returns: undefined
      }
      remove_workspace_member: {
        Args: { _member_id: string }
        Returns: undefined
      }
      repair_delivery_state: {
        Args: { _since?: string; _workspace_id?: string }
        Returns: number
      }
      request_affiliate_crypto_payout: {
        Args: { _amount: number; _request_key: string }
        Returns: {
          actual_paid_cents: number | null
          adjustment_allocated_cents: number
          admin_notes: string | null
          amount_cents: number
          created_at: string
          crypto_network: string | null
          currency: string
          decided_at: string | null
          destination_hint: string | null
          id: string
          method: string | null
          paid_at: string | null
          payout_environment: string | null
          processing_due_at: string | null
          reference: string | null
          referral_profile_id: string
          request_key: string | null
          requested_at: string
          status: string
          updated_at: string
          user_id: string
          wallet_address: string | null
        }
        SetofOptions: {
          from: "*"
          to: "referral_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_referral_payout: {
        Args: {
          _amount_cents: number
          _destination_hint: string
          _method: string
        }
        Returns: {
          actual_paid_cents: number | null
          adjustment_allocated_cents: number
          admin_notes: string | null
          amount_cents: number
          created_at: string
          crypto_network: string | null
          currency: string
          decided_at: string | null
          destination_hint: string | null
          id: string
          method: string | null
          paid_at: string | null
          payout_environment: string | null
          processing_due_at: string | null
          reference: string | null
          referral_profile_id: string
          request_key: string | null
          requested_at: string
          status: string
          updated_at: string
          user_id: string
          wallet_address: string | null
        }
        SetofOptions: {
          from: "*"
          to: "referral_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resend_workspace_invitation: {
        Args: { _invitation_id: string }
        Returns: {
          id: string
          token: string
        }[]
      }
      reserve_campaign_send: { Args: { _campaign_id: string }; Returns: Json }
      reserve_mailbox_warmup_send: {
        Args: { _job: string; _limit: number }
        Returns: boolean
      }
      review_affiliate_commission: {
        Args: { _action: string; _id: string; _notes: string }
        Returns: undefined
      }
      review_affiliate_crypto_payout: {
        Args: {
          _actual: number
          _id: string
          _notes: string
          _reference: string
          _status: string
        }
        Returns: undefined
      }
      review_affiliate_payout: {
        Args: {
          _id: string
          _notes: string
          _reference: string
          _status: string
        }
        Returns: undefined
      }
      revoke_appsumo_code: {
        Args: { _actor: string; _code_id: string }
        Returns: Json
      }
      revoke_workspace_invitation: {
        Args: { _invitation_id: string }
        Returns: undefined
      }
      run_ai_personalization_runner: { Args: never; Returns: undefined }
      run_automation_runner: { Args: never; Returns: undefined }
      run_campaign_scheduler: { Args: never; Returns: undefined }
      run_delivery_reconcile_runner: { Args: never; Returns: undefined }
      run_domain_recheck_runner: { Args: never; Returns: undefined }
      run_inbound_retry: { Args: never; Returns: undefined }
      run_lead_retention_cleanup: {
        Args: { _batch_size?: number; _max_batches?: number }
        Returns: {
          out_deleted_count: number
          out_workspace_id: string
        }[]
      }
      run_mailbox_poll: { Args: never; Returns: undefined }
      run_provider_health_runner: { Args: never; Returns: undefined }
      run_transactional_email_runner: { Args: never; Returns: undefined }
      run_warmup_runner: { Args: never; Returns: undefined }
      save_affiliate_crypto_wallet: {
        Args: { _address: string; _network: string; _user: string }
        Returns: undefined
      }
      save_affiliate_payout_details: {
        Args: { _details: string; _method: string }
        Returns: undefined
      }
      sending_account_stats: {
        Args: { _account_ids: string[] }
        Returns: {
          account_id: string
          bounced: number
          complained: number
          delivered: number
          last_reply_at: string
          last_sent_at: string
          replies: number
          sent: number
        }[]
      }
      set_sending_account_enabled: {
        Args: { _account_id: string; _enabled: boolean }
        Returns: undefined
      }
      set_sending_accounts_paused: {
        Args: { _account_ids: string[]; _paused: boolean }
        Returns: number
      }
      touch_workspace_activity: {
        Args: { _workspace_id: string }
        Returns: undefined
      }
      update_workspace_member_role: {
        Args: {
          _member_id: string
          _role: Database["public"]["Enums"]["workspace_role"]
        }
        Returns: undefined
      }
      update_workspace_settings: {
        Args: {
          _logo_url: string
          _name: string
          _send_days: number[]
          _send_end_hour: number
          _send_start_hour: number
          _sending_timezone: string
          _slug: string
          _timezone: string
          _workspace_id: string
        }
        Returns: undefined
      }
      workspace_team: {
        Args: { _workspace_id: string }
        Returns: {
          avatar_url: string
          email: string
          expires_at: string
          full_name: string
          invited_by_email: string
          joined_at: string
          kind: string
          last_active_at: string
          message: string
          role: string
          row_id: string
          status: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "support" | "user"
      billing_environment: "test" | "live"
      billing_interval: "monthly" | "yearly" | "lifetime"
      billing_provider:
        | "stripe"
        | "paddle"
        | "lemonsqueezy"
        | "manual"
        | "appsumo"
      billing_sub_status:
        | "trialing"
        | "active"
        | "past_due"
        | "payment_failed"
        | "paused"
        | "cancelled"
        | "expired"
      blog_content_type:
        | "article"
        | "guide"
        | "case_study"
        | "template"
        | "tutorial"
        | "product_update"
      blog_post_status: "draft" | "scheduled" | "published" | "archived"
      campaign_status:
        | "draft"
        | "scheduled"
        | "active"
        | "paused"
        | "completed"
        | "archived"
      connection_status: "untested" | "verified" | "failed" | "disabled"
      message_status:
        | "pending"
        | "scheduled"
        | "processing"
        | "sent"
        | "failed"
        | "cancelled"
      recipient_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "replied"
        | "bounced"
        | "unsubscribed"
        | "failed"
        | "stopped"
      sending_provider:
        | "smtp"
        | "ses"
        | "sendgrid"
        | "mailgun"
        | "postmark"
        | "resend"
        | "zeptomail"
        | "brevo"
        | "emailit"
        | "nuntly"
        | "elasticemail"
        | "maileroo"
        | "courier"
        | "uspeedo"
      workspace_role:
        | "owner"
        | "admin"
        | "campaign_manager"
        | "inbox_manager"
        | "analyst"
        | "client_viewer"
        | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "support", "user"],
      billing_environment: ["test", "live"],
      billing_interval: ["monthly", "yearly", "lifetime"],
      billing_provider: [
        "stripe",
        "paddle",
        "lemonsqueezy",
        "manual",
        "appsumo",
      ],
      billing_sub_status: [
        "trialing",
        "active",
        "past_due",
        "payment_failed",
        "paused",
        "cancelled",
        "expired",
      ],
      blog_content_type: [
        "article",
        "guide",
        "case_study",
        "template",
        "tutorial",
        "product_update",
      ],
      blog_post_status: ["draft", "scheduled", "published", "archived"],
      campaign_status: [
        "draft",
        "scheduled",
        "active",
        "paused",
        "completed",
        "archived",
      ],
      connection_status: ["untested", "verified", "failed", "disabled"],
      message_status: [
        "pending",
        "scheduled",
        "processing",
        "sent",
        "failed",
        "cancelled",
      ],
      recipient_status: [
        "pending",
        "in_progress",
        "completed",
        "replied",
        "bounced",
        "unsubscribed",
        "failed",
        "stopped",
      ],
      sending_provider: [
        "smtp",
        "ses",
        "sendgrid",
        "mailgun",
        "postmark",
        "resend",
        "zeptomail",
        "brevo",
        "emailit",
        "nuntly",
        "elasticemail",
        "maileroo",
        "courier",
        "uspeedo",
      ],
      workspace_role: [
        "owner",
        "admin",
        "campaign_manager",
        "inbox_manager",
        "analyst",
        "client_viewer",
        "member",
      ],
    },
  },
} as const
