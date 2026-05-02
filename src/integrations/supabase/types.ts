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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      album_photos: {
        Row: {
          album_id: string
          caption: string | null
          created_at: string
          id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          album_id: string
          caption?: string | null
          created_at?: string
          id?: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          album_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_photos_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "event_albums"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          email: string
          event_date: string
          event_id: string | null
          full_name: string
          id: string
          number_of_guests: number
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string
          pr_code: string | null
          price_eur: number
          qr_code_data_url: string | null
          ticket_code: string | null
          tier: Database["public"]["Enums"]["booking_tier"]
          tier_id: string | null
          updated_at: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          event_date: string
          event_id?: string | null
          full_name: string
          id?: string
          number_of_guests: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone: string
          pr_code?: string | null
          price_eur: number
          qr_code_data_url?: string | null
          ticket_code?: string | null
          tier: Database["public"]["Enums"]["booking_tier"]
          tier_id?: string | null
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          event_date?: string
          event_id?: string | null
          full_name?: string
          id?: string
          number_of_guests?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string
          pr_code?: string | null
          price_eur?: number
          qr_code_data_url?: string | null
          ticket_code?: string | null
          tier?: Database["public"]["Enums"]["booking_tier"]
          tier_id?: string | null
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "event_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_verifications: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      event_albums: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string
          event_id: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string
          event_id?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string
          event_id?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_albums_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tiers: {
        Row: {
          capacity: number
          category: Database["public"]["Enums"]["tier_category"]
          created_at: string
          description: string
          event_id: string
          id: string
          is_active: boolean
          name: string
          perks: string
          price_eur: number
          remaining: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          capacity?: number
          category: Database["public"]["Enums"]["tier_category"]
          created_at?: string
          description?: string
          event_id: string
          id?: string
          is_active?: boolean
          name: string
          perks?: string
          price_eur?: number
          remaining?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          capacity?: number
          category?: Database["public"]["Enums"]["tier_category"]
          created_at?: string
          description?: string
          event_id?: string
          id?: string
          is_active?: boolean
          name?: string
          perks?: string
          price_eur?: number
          remaining?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          description: string
          event_date: string | null
          id: string
          is_active: boolean
          perks_entrance: string
          perks_standard: string
          perks_vip: string
          poster_url: string | null
          price_entrance: number
          price_standard: number
          price_vip: number
          reservation_limit: number
          reservations_remaining: number
          ticket_limit: number
          tickets_remaining: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          event_date?: string | null
          id?: string
          is_active?: boolean
          perks_entrance?: string
          perks_standard?: string
          perks_vip?: string
          poster_url?: string | null
          price_entrance?: number
          price_standard?: number
          price_vip?: number
          reservation_limit?: number
          reservations_remaining?: number
          ticket_limit?: number
          tickets_remaining?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          event_date?: string | null
          id?: string
          is_active?: boolean
          perks_entrance?: string
          perks_standard?: string
          perks_vip?: string
          poster_url?: string | null
          price_entrance?: number
          price_standard?: number
          price_vip?: number
          reservation_limit?: number
          reservations_remaining?: number
          ticket_limit?: number
          tickets_remaining?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          price_eur: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_eur?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_eur?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
        }
        Relationships: []
      }
      tickets: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          qr_code_data_url: string | null
          ticket_code: string
          used_at: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          qr_code_data_url?: string | null
          ticket_code: string
          used_at?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          qr_code_data_url?: string | null
          ticket_code?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_admin_role: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      validate_pr_code: { Args: { _code: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user" | "staff"
      booking_tier: "standard" | "vip" | "entrance"
      payment_status: "pending" | "paid" | "cancelled"
      tier_category: "entrance" | "reservation"
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
      app_role: ["admin", "user", "staff"],
      booking_tier: ["standard", "vip", "entrance"],
      payment_status: ["pending", "paid", "cancelled"],
      tier_category: ["entrance", "reservation"],
    },
  },
} as const
