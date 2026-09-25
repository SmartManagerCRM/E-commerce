export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: { Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          actor_role: string;
          actor_user_id: string | null;
          created_at: string;
          diff: NonNullable<Json>;
          entity_id: string | null;
          entity_type: string;
          id: number;
          ip: unknown;
          tenant_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_role?: string;
          actor_user_id?: string | null;
          created_at?: string;
          diff?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          ip?: unknown;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_role?: string;
          actor_user_id?: string | null;
          created_at?: string;
          diff?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          ip?: unknown;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      branches: {
        Row: {
          address: NonNullable<Json>;
          created_at: string;
          id: string;
          is_default: boolean;
          name: NonNullable<Json>;
          opening_hours: NonNullable<Json>;
          phone: string | null;
          slug: string;
          status: string;
          tenant_id: string;
          timezone: string | null;
          updated_at: string;
        };
        Insert: {
          address?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name: NonNullable<Json>;
          opening_hours?: NonNullable<Json>;
          phone?: string | null;
          slug: string;
          status?: string;
          tenant_id: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name?: NonNullable<Json>;
          opening_hours?: NonNullable<Json>;
          phone?: string | null;
          slug?: string;
          status?: string;
          tenant_id?: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      currencies: {
        Row: {
          code: string;
          exponent: number;
          is_active: boolean;
          name: NonNullable<Json>;
        };
        Insert: {
          code: string;
          exponent: number;
          is_active?: boolean;
          name: NonNullable<Json>;
        };
        Update: {
          code?: string;
          exponent?: number;
          is_active?: boolean;
          name?: NonNullable<Json>;
        };
        Relationships: [];
      };
      features: {
        Row: {
          description: NonNullable<Json>;
          key: string;
          kind: string;
          module: string;
          name: NonNullable<Json>;
          sort_order: number;
        };
        Insert: {
          description?: NonNullable<Json>;
          key: string;
          kind?: string;
          module: string;
          name: NonNullable<Json>;
          sort_order?: number;
        };
        Update: {
          description?: NonNullable<Json>;
          key?: string;
          kind?: string;
          module?: string;
          name?: NonNullable<Json>;
          sort_order?: number;
        };
        Relationships: [];
      };
      permissions: {
        Row: {
          description: string | null;
          key: string;
          module: string;
        };
        Insert: {
          description?: string | null;
          key: string;
          module: string;
        };
        Update: {
          description?: string | null;
          key?: string;
          module?: string;
        };
        Relationships: [];
      };
      plan_features: {
        Row: {
          enabled: boolean;
          feature_key: string;
          limit_value: number | null;
          plan_id: string;
        };
        Insert: {
          enabled?: boolean;
          feature_key: string;
          limit_value?: number | null;
          plan_id: string;
        };
        Update: {
          enabled?: boolean;
          feature_key?: string;
          limit_value?: number | null;
          plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_features_feature_key_fkey";
            columns: ["feature_key"];
            isOneToOne: false;
            referencedRelation: "features";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "plan_features_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          billing_interval: string;
          created_at: string;
          currency: string;
          description: NonNullable<Json>;
          id: string;
          is_active: boolean;
          is_public: boolean;
          key: string;
          name: NonNullable<Json>;
          price_minor: number;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          billing_interval?: string;
          created_at?: string;
          currency: string;
          description?: NonNullable<Json>;
          id?: string;
          is_active?: boolean;
          is_public?: boolean;
          key: string;
          name: NonNullable<Json>;
          price_minor?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          billing_interval?: string;
          created_at?: string;
          currency?: string;
          description?: NonNullable<Json>;
          id?: string;
          is_active?: boolean;
          is_public?: boolean;
          key?: string;
          name?: NonNullable<Json>;
          price_minor?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plans_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
      platform_admins: {
        Row: {
          created_at: string;
          level: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          level?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          level?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          preferred_language: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_path?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          preferred_language?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          preferred_language?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          permission_key: string;
          role_id: string;
        };
        Insert: {
          permission_key: string;
          role_id: string;
        };
        Update: {
          permission_key?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey";
            columns: ["permission_key"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string;
          id: string;
          is_system: boolean;
          key: string;
          name: NonNullable<Json>;
          rank: number;
          tenant_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_system?: boolean;
          key: string;
          name: NonNullable<Json>;
          rank?: number;
          tenant_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_system?: boolean;
          key?: string;
          name?: NonNullable<Json>;
          rank?: number;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      storefront_configs: {
        Row: {
          footer: NonNullable<Json>;
          header: NonNullable<Json>;
          homepage_sections: NonNullable<Json>;
          seo: NonNullable<Json>;
          tenant_id: string;
          theme_key: string;
          tokens: NonNullable<Json>;
          updated_at: string;
        };
        Insert: {
          footer?: NonNullable<Json>;
          header?: NonNullable<Json>;
          homepage_sections?: NonNullable<Json>;
          seo?: NonNullable<Json>;
          tenant_id: string;
          theme_key?: string;
          tokens?: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          footer?: NonNullable<Json>;
          header?: NonNullable<Json>;
          homepage_sections?: NonNullable<Json>;
          seo?: NonNullable<Json>;
          tenant_id?: string;
          theme_key?: string;
          tokens?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "storefront_configs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_domains: {
        Row: {
          created_at: string;
          hosting_connected_at: string | null;
          hostname: string;
          id: string;
          is_primary: boolean;
          last_check_error: string | null;
          last_checked_at: string | null;
          tenant_id: string;
          verification_token: string;
          verified_at: string | null;
        };
        Insert: {
          created_at?: string;
          hosting_connected_at?: string | null;
          hostname: string;
          id?: string;
          is_primary?: boolean;
          last_check_error?: string | null;
          last_checked_at?: string | null;
          tenant_id: string;
          verification_token?: string;
          verified_at?: string | null;
        };
        Update: {
          created_at?: string;
          hosting_connected_at?: string | null;
          hostname?: string;
          id?: string;
          is_primary?: boolean;
          last_check_error?: string | null;
          last_checked_at?: string | null;
          tenant_id?: string;
          verification_token?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_feature_overrides: {
        Row: {
          created_at: string;
          enabled: boolean;
          feature_key: string;
          limit_value: number | null;
          reason: string | null;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          enabled: boolean;
          feature_key: string;
          limit_value?: number | null;
          reason?: string | null;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          feature_key?: string;
          limit_value?: number | null;
          reason?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_feature_overrides_feature_key_fkey";
            columns: ["feature_key"];
            isOneToOne: false;
            referencedRelation: "features";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "tenant_feature_overrides_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          revoked_at: string | null;
          role_id: string;
          tenant_id: string;
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role_id: string;
          tenant_id: string;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role_id?: string;
          tenant_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_invitations_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_members: {
        Row: {
          branch_id: string | null;
          created_at: string;
          role_id: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          branch_id?: string | null;
          created_at?: string;
          role_id: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          branch_id?: string | null;
          created_at?: string;
          role_id?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_members_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_members_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "tenant_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_settings: {
        Row: {
          booking: NonNullable<Json>;
          checkout: NonNullable<Json>;
          consent: NonNullable<Json>;
          delivery: NonNullable<Json>;
          notifications: NonNullable<Json>;
          retention: NonNullable<Json>;
          tax: NonNullable<Json>;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          booking?: NonNullable<Json>;
          checkout?: NonNullable<Json>;
          consent?: NonNullable<Json>;
          delivery?: NonNullable<Json>;
          notifications?: NonNullable<Json>;
          retention?: NonNullable<Json>;
          tax?: NonNullable<Json>;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          booking?: NonNullable<Json>;
          checkout?: NonNullable<Json>;
          consent?: NonNullable<Json>;
          delivery?: NonNullable<Json>;
          notifications?: NonNullable<Json>;
          retention?: NonNullable<Json>;
          tax?: NonNullable<Json>;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_subscriptions: {
        Row: {
          cancel_at: string | null;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string;
          id: string;
          plan_id: string;
          status: string;
          tenant_id: string;
          trial_ends_at: string | null;
          updated_at: string;
        };
        Insert: {
          cancel_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string;
          id?: string;
          plan_id: string;
          status?: string;
          tenant_id: string;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          cancel_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string;
          id?: string;
          plan_id?: string;
          status?: string;
          tenant_id?: string;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          address: NonNullable<Json>;
          business_name: string;
          business_type: string;
          city: string | null;
          country: string | null;
          created_at: string;
          currency: string;
          default_language: string;
          description: NonNullable<Json>;
          email: string | null;
          enabled_languages: string[];
          favicon_path: string | null;
          id: string;
          logo_path: string | null;
          phone: string | null;
          slug: string;
          status: string;
          tagline: NonNullable<Json>;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          address?: NonNullable<Json>;
          business_name: string;
          business_type?: string;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          currency: string;
          default_language?: string;
          description?: NonNullable<Json>;
          email?: string | null;
          enabled_languages?: string[];
          favicon_path?: string | null;
          id?: string;
          logo_path?: string | null;
          phone?: string | null;
          slug: string;
          status?: string;
          tagline?: NonNullable<Json>;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          address?: NonNullable<Json>;
          business_name?: string;
          business_type?: string;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          currency?: string;
          default_language?: string;
          description?: NonNullable<Json>;
          email?: string | null;
          enabled_languages?: string[];
          favicon_path?: string | null;
          id?: string;
          logo_path?: string | null;
          phone?: string | null;
          slug?: string;
          status?: string;
          tagline?: NonNullable<Json>;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenants_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string };
      get_invitation: { Args: { p_token: string }; Returns: Json };
      invite_member: { Args: { p_email: string; p_role_key: string; p_tenant: string }; Returns: string };
      my_memberships: {
        Args: Record<PropertyKey, never>;
        Returns: {
          business_name: string;
          logo_path: string;
          role_key: string;
          role_name: Json;
          slug: string;
          tenant_id: string;
          tenant_status: string;
        }[];
      };
      platform_create_tenant: {
        Args: {
          p_business_name: string;
          p_business_type: string;
          p_city: string;
          p_country: string;
          p_currency: string;
          p_default_language: string;
          p_enabled_languages: string[];
          p_owner_email: string;
          p_plan_key: string;
          p_slug: string;
          p_timezone: string;
        };
        Returns: Json;
      };
      platform_invite_owner: { Args: { p_email: string; p_tenant: string }; Returns: string };
      platform_set_plan: { Args: { p_plan_key: string; p_status?: string; p_tenant: string }; Returns: undefined };
      record_domain_check: {
        Args: { p_actor: string; p_domain: string; p_error?: string; p_verified: boolean };
        Returns: undefined;
      };
      resolve_storefront: { Args: { p_hostname?: string; p_slug?: string }; Returns: Json };
      revoke_invitation: { Args: { p_invitation: string }; Returns: undefined };
      set_primary_domain: { Args: { p_domain: string }; Returns: undefined };
      tenant_admin_context: { Args: { p_tenant: string }; Returns: Json };
      tenant_staff: {
        Args: { p_tenant: string };
        Returns: {
          created_at: string;
          email: string;
          full_name: string;
          role_key: string;
          role_name: Json;
          status: string;
          user_id: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
