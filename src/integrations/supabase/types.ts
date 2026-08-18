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
      blog_authors: {
        Row: {
          avatar_url: string | null
          bio: string
          created_at: string
          id: string
          name: string
          role: string
          slug: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          id?: string
          name: string
          role?: string
          slug: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          id?: string
          name?: string
          role?: string
          slug?: string
          updated_at?: string
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
      blog_posts: {
        Row: {
          author_id: string | null
          canonical_url: string | null
          category_id: string | null
          content: string
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
      campaign_messages: {
        Row: {
          attempts: number
          body: string
          campaign_id: string
          created_at: string
          id: string
          last_error: string | null
          lead_id: string
          provider: string | null
          provider_message_id: string | null
          recipient_id: string | null
          scheduled_at: string | null
          sending_account_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["message_status"]
          step_id: string | null
          step_order: number
          subject: string
          to_email: string
          updated_at: string
          variant_id: string | null
          workspace_id: string
        }
        Insert: {
          attempts?: number
          body?: string
          campaign_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          lead_id: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_id?: string | null
          scheduled_at?: string | null
          sending_account_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          step_id?: string | null
          step_order?: number
          subject?: string
          to_email: string
          updated_at?: string
          variant_id?: string | null
          workspace_id: string
        }
        Update: {
          attempts?: number
          body?: string
          campaign_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          lead_id?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_id?: string | null
          scheduled_at?: string | null
          sending_account_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          step_id?: string | null
          step_order?: number
          subject?: string
          to_email?: string
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
          lead_id: string
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
          lead_id: string
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
          lead_id?: string
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
      campaigns: {
        Row: {
          business_days_only: boolean
          click_tracking: boolean
          created_at: string
          created_by: string
          custom_variables: Json
          daily_cap: number
          description: string | null
          end_at: string | null
          id: string
          inbox_rotation_enabled: boolean
          inbox_rotation_strategy: string
          launched_at: string | null
          list_id: string | null
          max_contacts_per_company: number
          max_per_hour: number
          min_delay_minutes: number
          name: string
          open_tracking: boolean
          random_delay_minutes: number
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
          business_days_only?: boolean
          click_tracking?: boolean
          created_at?: string
          created_by: string
          custom_variables?: Json
          daily_cap?: number
          description?: string | null
          end_at?: string | null
          id?: string
          inbox_rotation_enabled?: boolean
          inbox_rotation_strategy?: string
          launched_at?: string | null
          list_id?: string | null
          max_contacts_per_company?: number
          max_per_hour?: number
          min_delay_minutes?: number
          name: string
          open_tracking?: boolean
          random_delay_minutes?: number
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
          business_days_only?: boolean
          click_tracking?: boolean
          created_at?: string
          created_by?: string
          custom_variables?: Json
          daily_cap?: number
          description?: string | null
          end_at?: string | null
          id?: string
          inbox_rotation_enabled?: boolean
          inbox_rotation_strategy?: string
          launched_at?: string | null
          list_id?: string | null
          max_contacts_per_company?: number
          max_per_hour?: number
          min_delay_minutes?: number
          name?: string
          open_tracking?: boolean
          random_delay_minutes?: number
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
          from_email: string
          from_name: string | null
          html: string | null
          id: string
          in_reply_to: string | null
          message_id: string | null
          occurred_at: string
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
          from_email: string
          from_name?: string | null
          html?: string | null
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          occurred_at?: string
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
          from_email?: string
          from_name?: string | null
          html?: string | null
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          occurred_at?: string
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
          has_outbound: boolean
          id: string
          last_direction: string
          last_message_at: string
          last_preview: string | null
          lead_id: string | null
          message_count: number
          prospect_email: string
          sending_account_id: string | null
          snoozed_until: string | null
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
          has_outbound?: boolean
          id?: string
          last_direction?: string
          last_message_at?: string
          last_preview?: string | null
          lead_id?: string | null
          message_count?: number
          prospect_email: string
          sending_account_id?: string | null
          snoozed_until?: string | null
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
          has_outbound?: boolean
          id?: string
          last_direction?: string
          last_message_at?: string
          last_preview?: string | null
          lead_id?: string | null
          message_count?: number
          prospect_email?: string
          sending_account_id?: string | null
          snoozed_until?: string | null
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
          daily_capacity: number
          hourly_capacity: number
          id: string
          is_enabled: boolean
          last_error: string | null
          last_tested_at: string | null
          name: string
          notes: string | null
          priority: number
          provider: Database["public"]["Enums"]["sending_provider"]
          reply_to_email: string | null
          status: Database["public"]["Enums"]["connection_status"]
          updated_at: string
        }
        Insert: {
          cost_per_1k_cents?: number
          created_at?: string
          daily_capacity?: number
          hourly_capacity?: number
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_tested_at?: string | null
          name: string
          notes?: string | null
          priority?: number
          provider: Database["public"]["Enums"]["sending_provider"]
          reply_to_email?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
        }
        Update: {
          cost_per_1k_cents?: number
          created_at?: string
          daily_capacity?: number
          hourly_capacity?: number
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_tested_at?: string | null
          name?: string
          notes?: string | null
          priority?: number
          provider?: Database["public"]["Enums"]["sending_provider"]
          reply_to_email?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
        }
        Relationships: []
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
      lead_activities: {
        Row: {
          campaign_id: string | null
          created_at: string
          detail: string | null
          id: string
          lead_id: string
          type: string
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          lead_id: string
          type: string
          workspace_id: string
        }
        Update: {
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
      lead_lists: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
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
          city: string | null
          company: string | null
          country: string | null
          created_at: string
          crm_stage: string
          custom_fields: Json
          email: string
          first_name: string | null
          id: string
          job_title: string | null
          last_activity_at: string | null
          last_name: string | null
          linkedin_url: string | null
          list_id: string | null
          phone: string | null
          state: string | null
          status: string
          tags: string[]
          updated_at: string
          website: string | null
          workspace_id: string
        }
        Insert: {
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          crm_stage?: string
          custom_fields?: Json
          email: string
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_activity_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          list_id?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
          workspace_id: string
        }
        Update: {
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          crm_stage?: string
          custom_fields?: Json
          email?: string
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_activity_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          list_id?: string | null
          phone?: string | null
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
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      plan_features: {
        Row: {
          category: string
          created_at: string
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
      plans: {
        Row: {
          analytics_enabled: boolean
          api_access: boolean
          created_at: string
          custom_branding: boolean
          description: string | null
          id: string
          is_enterprise: boolean
          is_popular: boolean
          max_campaigns: number | null
          max_emails_monthly: number | null
          max_leads: number | null
          max_sending_accounts: number | null
          max_users: number | null
          max_workspaces: number | null
          monthly_price: number
          name: string
          priority_support: boolean
          slug: string
          sort_order: number
          sso_enabled: boolean
          tagline: string | null
          unified_inbox_enabled: boolean
          updated_at: string
          warmup_enabled: boolean
          yearly_price: number
        }
        Insert: {
          analytics_enabled?: boolean
          api_access?: boolean
          created_at?: string
          custom_branding?: boolean
          description?: string | null
          id?: string
          is_enterprise?: boolean
          is_popular?: boolean
          max_campaigns?: number | null
          max_emails_monthly?: number | null
          max_leads?: number | null
          max_sending_accounts?: number | null
          max_users?: number | null
          max_workspaces?: number | null
          monthly_price?: number
          name: string
          priority_support?: boolean
          slug: string
          sort_order?: number
          sso_enabled?: boolean
          tagline?: string | null
          unified_inbox_enabled?: boolean
          updated_at?: string
          warmup_enabled?: boolean
          yearly_price?: number
        }
        Update: {
          analytics_enabled?: boolean
          api_access?: boolean
          created_at?: string
          custom_branding?: boolean
          description?: string | null
          id?: string
          is_enterprise?: boolean
          is_popular?: boolean
          max_campaigns?: number | null
          max_emails_monthly?: number | null
          max_leads?: number | null
          max_sending_accounts?: number | null
          max_users?: number | null
          max_workspaces?: number | null
          monthly_price?: number
          name?: string
          priority_support?: boolean
          slug?: string
          sort_order?: number
          sso_enabled?: boolean
          tagline?: string | null
          unified_inbox_enabled?: boolean
          updated_at?: string
          warmup_enabled?: boolean
          yearly_price?: number
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          onboarding_completed: boolean
          theme: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          onboarding_completed?: boolean
          theme?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          theme?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sending_account_requests: {
        Row: {
          account_ids: string[]
          admin_note: string | null
          created_at: string
          handled_at: string | null
          id: string
          kind: string
          note: string | null
          preferred_domain: string | null
          quantity: number
          requested_by: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_ids?: string[]
          admin_note?: string | null
          created_at?: string
          handled_at?: string | null
          id?: string
          kind?: string
          note?: string | null
          preferred_domain?: string | null
          quantity?: number
          requested_by: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_ids?: string[]
          admin_note?: string | null
          created_at?: string
          handled_at?: string | null
          id?: string
          kind?: string
          note?: string | null
          preferred_domain?: string | null
          quantity?: number
          requested_by?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sending_account_requests_workspace_id_fkey"
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
          created_at: string
          created_by: string | null
          customer_enabled: boolean
          daily_limit: number
          dkim_status: string
          dmarc_status: string
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
          paused: boolean
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
          created_at?: string
          created_by?: string | null
          customer_enabled?: boolean
          daily_limit?: number
          dkim_status?: string
          dmarc_status?: string
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
          paused?: boolean
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
          created_at?: string
          created_by?: string | null
          customer_enabled?: boolean
          daily_limit?: number
          dkim_status?: string
          dmarc_status?: string
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
          paused?: boolean
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
          company: string
          company_logo_url: string | null
          created_at: string
          display_order: number
          featured: boolean
          id: string
          name: string
          pages: string[]
          result: string | null
          role: string
          testimonial: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          company?: string
          company_logo_url?: string | null
          created_at?: string
          display_order?: number
          featured?: boolean
          id?: string
          name: string
          pages?: string[]
          result?: string | null
          role?: string
          testimonial: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          company?: string
          company_logo_url?: string | null
          created_at?: string
          display_order?: number
          featured?: boolean
          id?: string
          name?: string
          pages?: string[]
          result?: string | null
          role?: string
          testimonial?: string
          updated_at?: string
        }
        Relationships: []
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
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
          slug: string
          team_size: string | null
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
          slug: string
          team_size?: string | null
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
          slug?: string
          team_size?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      request_sending_account_release: {
        Args: { _account_ids: string[]; _note?: string }
        Returns: string
      }
      run_campaign_scheduler: { Args: never; Returns: undefined }
      run_inbound_retry: { Args: never; Returns: undefined }
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
    }
    Enums: {
      app_role: "admin" | "support" | "user"
      billing_interval: "monthly" | "yearly"
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
      workspace_role:
        | "owner"
        | "admin"
        | "campaign_manager"
        | "inbox_manager"
        | "analyst"
        | "client_viewer"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      billing_interval: ["monthly", "yearly"],
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
      ],
      workspace_role: [
        "owner",
        "admin",
        "campaign_manager",
        "inbox_manager",
        "analyst",
        "client_viewer",
      ],
    },
  },
} as const
