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
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
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
      cart_items: {
        Row: {
          added_at: string;
          cart_id: string;
          qty: number;
          tenant_id: string;
          variant_id: string;
        };
        Insert: {
          added_at?: string;
          cart_id: string;
          qty: number;
          tenant_id: string;
          variant_id: string;
        };
        Update: {
          added_at?: string;
          cart_id?: string;
          qty?: number;
          tenant_id?: string;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_tenant_id_cart_id_fkey";
            columns: ["tenant_id", "cart_id"];
            isOneToOne: false;
            referencedRelation: "carts";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "cart_items_tenant_id_variant_id_fkey";
            columns: ["tenant_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      carts: {
        Row: {
          created_at: string;
          customer_id: string | null;
          id: string;
          last_activity_at: string;
          order_id: string | null;
          status: string;
          tenant_id: string;
          token_hash: string;
        };
        Insert: {
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          last_activity_at?: string;
          order_id?: string | null;
          status?: string;
          tenant_id: string;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          last_activity_at?: string;
          order_id?: string | null;
          status?: string;
          tenant_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "carts_tenant_id_customer_id_fkey";
            columns: ["tenant_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "carts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          created_at: string;
          description: NonNullable<Json>;
          id: string;
          image_path: string | null;
          name: NonNullable<Json>;
          parent_id: string | null;
          position: number;
          slug: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: NonNullable<Json>;
          id?: string;
          image_path?: string | null;
          name: NonNullable<Json>;
          parent_id?: string | null;
          position?: number;
          slug: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: NonNullable<Json>;
          id?: string;
          image_path?: string | null;
          name?: NonNullable<Json>;
          parent_id?: string | null;
          position?: number;
          slug?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categories_tenant_id_parent_id_fkey";
            columns: ["tenant_id", "parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["tenant_id", "id"];
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
      customers: {
        Row: {
          auth_user_id: string | null;
          consent_at: string | null;
          created_at: string;
          email: string;
          first_order_at: string | null;
          full_name: string;
          id: string;
          last_order_at: string | null;
          lifetime_value_minor: number;
          locale: string | null;
          marketing_consent: boolean;
          orders_count: number;
          phone: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          auth_user_id?: string | null;
          consent_at?: string | null;
          created_at?: string;
          email: string;
          first_order_at?: string | null;
          full_name: string;
          id?: string;
          last_order_at?: string | null;
          lifetime_value_minor?: number;
          locale?: string | null;
          marketing_consent?: boolean;
          orders_count?: number;
          phone?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string | null;
          consent_at?: string | null;
          created_at?: string;
          email?: string;
          first_order_at?: string | null;
          full_name?: string;
          id?: string;
          last_order_at?: string | null;
          lifetime_value_minor?: number;
          locale?: string | null;
          marketing_consent?: boolean;
          orders_count?: number;
          phone?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_zones: {
        Row: {
          active: boolean;
          created_at: string;
          eta_minutes: number | null;
          fee_minor: number;
          free_over_minor: number | null;
          id: string;
          min_order_minor: number | null;
          name: NonNullable<Json>;
          position: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          eta_minutes?: number | null;
          fee_minor?: number;
          free_over_minor?: number | null;
          id?: string;
          min_order_minor?: number | null;
          name: NonNullable<Json>;
          position?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          eta_minutes?: number | null;
          fee_minor?: number;
          free_over_minor?: number | null;
          id?: string;
          min_order_minor?: number | null;
          name?: NonNullable<Json>;
          position?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_zones_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
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
      inventory_items: {
        Row: {
          allow_backorder: boolean;
          branch_id: string;
          cost_minor: number | null;
          id: string;
          min_stock: number;
          on_hand: number;
          reserved: number;
          tenant_id: string;
          track_stock: boolean;
          updated_at: string;
          variant_id: string;
        };
        Insert: {
          allow_backorder?: boolean;
          branch_id: string;
          cost_minor?: number | null;
          id?: string;
          min_stock?: number;
          on_hand?: number;
          reserved?: number;
          tenant_id: string;
          track_stock?: boolean;
          updated_at?: string;
          variant_id: string;
        };
        Update: {
          allow_backorder?: boolean;
          branch_id?: string;
          cost_minor?: number | null;
          id?: string;
          min_stock?: number;
          on_hand?: number;
          reserved?: number;
          tenant_id?: string;
          track_stock?: boolean;
          updated_at?: string;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_items_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "inventory_items_tenant_id_variant_id_fkey";
            columns: ["tenant_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      newsletter_subscribers: {
        Row: {
          consent_at: string;
          consent_source: string;
          created_at: string;
          email: string;
          id: string;
          locale: string;
          status: string;
          tenant_id: string;
          unsubscribed_at: string | null;
          updated_at: string;
        };
        Insert: {
          consent_at?: string;
          consent_source?: string;
          created_at?: string;
          email: string;
          id?: string;
          locale: string;
          status?: string;
          tenant_id: string;
          unsubscribed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          consent_at?: string;
          consent_source?: string;
          created_at?: string;
          email?: string;
          id?: string;
          locale?: string;
          status?: string;
          tenant_id?: string;
          unsubscribed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "newsletter_subscribers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_daily_briefs: {
        Row: {
          sent_at: string;
          sent_on: string;
          tenant_id: string;
        };
        Insert: {
          sent_at?: string;
          sent_on: string;
          tenant_id: string;
        };
        Update: {
          sent_at?: string;
          sent_on?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_daily_briefs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          channel: string;
          created_at: string;
          error: string | null;
          id: string;
          payload: NonNullable<Json>;
          provider_message_id: string | null;
          recipient_customer_id: string | null;
          recipient_email: string | null;
          recipient_user_id: string | null;
          status: string;
          subject: string;
          template: string;
          tenant_id: string;
        };
        Insert: {
          channel?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          payload?: NonNullable<Json>;
          provider_message_id?: string | null;
          recipient_customer_id?: string | null;
          recipient_email?: string | null;
          recipient_user_id?: string | null;
          status: string;
          subject: string;
          template: string;
          tenant_id: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          payload?: NonNullable<Json>;
          provider_message_id?: string | null;
          recipient_customer_id?: string | null;
          recipient_email?: string | null;
          recipient_user_id?: string | null;
          status?: string;
          subject?: string;
          template?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_tenant_id_recipient_customer_id_fkey";
            columns: ["tenant_id", "recipient_customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          inventory_item_id: string | null;
          order_id: string;
          position: number;
          product_id: string | null;
          qty: number;
          reserved_qty: number;
          snapshot: NonNullable<Json>;
          tenant_id: string;
          total_minor: number;
          unit_price_minor: number;
          variant_id: string | null;
        };
        Insert: {
          id?: string;
          inventory_item_id?: string | null;
          order_id: string;
          position?: number;
          product_id?: string | null;
          qty: number;
          reserved_qty?: number;
          snapshot: NonNullable<Json>;
          tenant_id: string;
          total_minor: number;
          unit_price_minor: number;
          variant_id?: string | null;
        };
        Update: {
          id?: string;
          inventory_item_id?: string | null;
          order_id?: string;
          position?: number;
          product_id?: string | null;
          qty?: number;
          reserved_qty?: number;
          snapshot?: NonNullable<Json>;
          tenant_id?: string;
          total_minor?: number;
          unit_price_minor?: number;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_tenant_id_inventory_item_id_fkey";
            columns: ["tenant_id", "inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "order_items_tenant_id_order_id_fkey";
            columns: ["tenant_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "order_items_tenant_id_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "order_items_tenant_id_variant_id_fkey";
            columns: ["tenant_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      order_status_history: {
        Row: {
          actor_id: string | null;
          at: string;
          from_status: string | null;
          id: number;
          note: string | null;
          order_id: string;
          tenant_id: string;
          to_status: string;
        };
        Insert: {
          actor_id?: string | null;
          at?: string;
          from_status?: string | null;
          id?: never;
          note?: string | null;
          order_id: string;
          tenant_id: string;
          to_status: string;
        };
        Update: {
          actor_id?: string | null;
          at?: string;
          from_status?: string | null;
          id?: never;
          note?: string | null;
          order_id?: string;
          tenant_id?: string;
          to_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_status_history_tenant_id_order_id_fkey";
            columns: ["tenant_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      orders: {
        Row: {
          access_token_hash: string;
          archived_at: string | null;
          branch_id: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          completed_at: string | null;
          confirmed_at: string | null;
          contact: Json | null;
          currency: string;
          customer_id: string | null;
          delivery_fee_minor: number;
          delivery_zone_id: string | null;
          delivery_zone_name: Json | null;
          discount_minor: number;
          expires_at: string | null;
          fulfillment_type: string;
          id: string;
          locale: string;
          notes: string | null;
          order_number: string;
          payment_intent_ref: string | null;
          payment_method: string;
          payment_status: string;
          placed_at: string;
          shipping_address: Json | null;
          status: string;
          subtotal_minor: number;
          table_session_id: string | null;
          tax_included: boolean;
          tax_minor: number;
          tax_rate_bps: number;
          tenant_id: string;
          total_minor: number;
          updated_at: string;
        };
        Insert: {
          access_token_hash: string;
          archived_at?: string | null;
          branch_id: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          confirmed_at?: string | null;
          contact?: Json | null;
          currency: string;
          customer_id?: string | null;
          delivery_fee_minor?: number;
          delivery_zone_id?: string | null;
          delivery_zone_name?: Json | null;
          discount_minor?: number;
          expires_at?: string | null;
          fulfillment_type: string;
          id?: string;
          locale?: string;
          notes?: string | null;
          order_number: string;
          payment_intent_ref?: string | null;
          payment_method?: string;
          payment_status?: string;
          placed_at?: string;
          shipping_address?: Json | null;
          status?: string;
          subtotal_minor: number;
          table_session_id?: string | null;
          tax_included?: boolean;
          tax_minor?: number;
          tax_rate_bps?: number;
          tenant_id: string;
          total_minor: number;
          updated_at?: string;
        };
        Update: {
          access_token_hash?: string;
          archived_at?: string | null;
          branch_id?: string;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          confirmed_at?: string | null;
          contact?: Json | null;
          currency?: string;
          customer_id?: string | null;
          delivery_fee_minor?: number;
          delivery_zone_id?: string | null;
          delivery_zone_name?: Json | null;
          discount_minor?: number;
          expires_at?: string | null;
          fulfillment_type?: string;
          id?: string;
          locale?: string;
          notes?: string | null;
          order_number?: string;
          payment_intent_ref?: string | null;
          payment_method?: string;
          payment_status?: string;
          placed_at?: string;
          shipping_address?: Json | null;
          status?: string;
          subtotal_minor?: number;
          table_session_id?: string | null;
          tax_included?: boolean;
          tax_minor?: number;
          tax_rate_bps?: number;
          tenant_id?: string;
          total_minor?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_table_session_fk";
            columns: ["tenant_id", "table_session_id"];
            isOneToOne: false;
            referencedRelation: "table_sessions";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "orders_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "orders_tenant_id_customer_id_fkey";
            columns: ["tenant_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "orders_tenant_id_delivery_zone_id_fkey";
            columns: ["tenant_id", "delivery_zone_id"];
            isOneToOne: false;
            referencedRelation: "delivery_zones";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_provider_configs: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          methods: string[];
          mode: string;
          provider: string;
          public_config: NonNullable<Json>;
          secret_vault_id: string | null;
          tenant_id: string;
          updated_at: string;
          webhook_secret_vault_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          methods?: string[];
          mode?: string;
          provider: string;
          public_config?: NonNullable<Json>;
          secret_vault_id?: string | null;
          tenant_id: string;
          updated_at?: string;
          webhook_secret_vault_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          methods?: string[];
          mode?: string;
          provider?: string;
          public_config?: NonNullable<Json>;
          secret_vault_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          webhook_secret_vault_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_provider_configs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount_minor: number;
          created_at: string;
          currency: string;
          id: string;
          method: string;
          note: string | null;
          order_id: string;
          paid_at: string;
          provider: string;
          provider_event_id: string | null;
          provider_ref: string | null;
          recorded_by: string | null;
          status: string;
          tenant_id: string;
        };
        Insert: {
          amount_minor: number;
          created_at?: string;
          currency: string;
          id?: string;
          method: string;
          note?: string | null;
          order_id: string;
          paid_at?: string;
          provider: string;
          provider_event_id?: string | null;
          provider_ref?: string | null;
          recorded_by?: string | null;
          status: string;
          tenant_id: string;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          method?: string;
          note?: string | null;
          order_id?: string;
          paid_at?: string;
          provider?: string;
          provider_event_id?: string | null;
          provider_ref?: string | null;
          recorded_by?: string | null;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_tenant_id_order_id_fkey";
            columns: ["tenant_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
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
      product_categories: {
        Row: {
          category_id: string;
          position: number;
          product_id: string;
          tenant_id: string;
        };
        Insert: {
          category_id: string;
          position?: number;
          product_id: string;
          tenant_id: string;
        };
        Update: {
          category_id?: string;
          position?: number;
          product_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_categories_tenant_id_category_id_fkey";
            columns: ["tenant_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "product_categories_tenant_id_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      product_images: {
        Row: {
          alt: NonNullable<Json>;
          created_at: string;
          height: number;
          id: string;
          position: number;
          product_id: string;
          storage_path: string;
          tenant_id: string;
          width: number;
        };
        Insert: {
          alt?: NonNullable<Json>;
          created_at?: string;
          height: number;
          id?: string;
          position?: number;
          product_id: string;
          storage_path: string;
          tenant_id: string;
          width: number;
        };
        Update: {
          alt?: NonNullable<Json>;
          created_at?: string;
          height?: number;
          id?: string;
          position?: number;
          product_id?: string;
          storage_path?: string;
          tenant_id?: string;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_tenant_id_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      product_option_values: {
        Row: {
          id: string;
          label: NonNullable<Json>;
          option_id: string;
          position: number;
          tenant_id: string;
        };
        Insert: {
          id?: string;
          label: NonNullable<Json>;
          option_id: string;
          position?: number;
          tenant_id: string;
        };
        Update: {
          id?: string;
          label?: NonNullable<Json>;
          option_id?: string;
          position?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_option_values_tenant_id_option_id_fkey";
            columns: ["tenant_id", "option_id"];
            isOneToOne: false;
            referencedRelation: "product_options";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      product_options: {
        Row: {
          id: string;
          name: NonNullable<Json>;
          position: number;
          product_id: string;
          tenant_id: string;
        };
        Insert: {
          id?: string;
          name: NonNullable<Json>;
          position?: number;
          product_id: string;
          tenant_id: string;
        };
        Update: {
          id?: string;
          name?: NonNullable<Json>;
          position?: number;
          product_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_options_tenant_id_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      product_variants: {
        Row: {
          compare_at_minor: number | null;
          created_at: string;
          id: string;
          image_id: string | null;
          option_value_ids: string[];
          position: number;
          price_minor: number;
          product_id: string;
          sku: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          weight_g: number | null;
        };
        Insert: {
          compare_at_minor?: number | null;
          created_at?: string;
          id?: string;
          image_id?: string | null;
          option_value_ids?: string[];
          position?: number;
          price_minor: number;
          product_id: string;
          sku?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          weight_g?: number | null;
        };
        Update: {
          compare_at_minor?: number | null;
          created_at?: string;
          id?: string;
          image_id?: string | null;
          option_value_ids?: string[];
          position?: number;
          price_minor?: number;
          product_id?: string;
          sku?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          weight_g?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_tenant_id_image_id_fkey";
            columns: ["tenant_id", "image_id"];
            isOneToOne: false;
            referencedRelation: "product_images";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "product_variants_tenant_id_product_id_fkey";
            columns: ["tenant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      products: {
        Row: {
          created_at: string;
          description: NonNullable<Json>;
          featured: boolean;
          id: string;
          name: NonNullable<Json>;
          position: number;
          price_max_minor: number | null;
          price_min_minor: number | null;
          published_at: string | null;
          search_text: string;
          slug: string;
          status: string;
          subtitle: NonNullable<Json>;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: NonNullable<Json>;
          featured?: boolean;
          id?: string;
          name: NonNullable<Json>;
          position?: number;
          price_max_minor?: number | null;
          price_min_minor?: number | null;
          published_at?: string | null;
          search_text?: string;
          slug: string;
          status?: string;
          subtitle?: NonNullable<Json>;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: NonNullable<Json>;
          featured?: boolean;
          id?: string;
          name?: NonNullable<Json>;
          position?: number;
          price_max_minor?: number | null;
          price_min_minor?: number | null;
          published_at?: string | null;
          search_text?: string;
          slug?: string;
          status?: string;
          subtitle?: NonNullable<Json>;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
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
      stock_movements: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          delta: number;
          id: number;
          inventory_item_id: string;
          note: string | null;
          on_hand_after: number;
          order_id: string | null;
          reason: string;
          tenant_id: string;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          delta: number;
          id?: never;
          inventory_item_id: string;
          note?: string | null;
          on_hand_after: number;
          order_id?: string | null;
          reason: string;
          tenant_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          delta?: number;
          id?: never;
          inventory_item_id?: string;
          note?: string | null;
          on_hand_after?: number;
          order_id?: string | null;
          reason?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_tenant_id_inventory_item_id_fkey";
            columns: ["tenant_id", "inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["tenant_id", "id"];
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
      table_sessions: {
        Row: {
          branch_id: string;
          closed_at: string | null;
          id: string;
          notes: string | null;
          opened_at: string;
          opened_by: string | null;
          party_size: number | null;
          status: string;
          table_id: string;
          tenant_id: string;
        };
        Insert: {
          branch_id: string;
          closed_at?: string | null;
          id?: string;
          notes?: string | null;
          opened_at?: string;
          opened_by?: string | null;
          party_size?: number | null;
          status?: string;
          table_id: string;
          tenant_id: string;
        };
        Update: {
          branch_id?: string;
          closed_at?: string | null;
          id?: string;
          notes?: string | null;
          opened_at?: string;
          opened_by?: string | null;
          party_size?: number | null;
          status?: string;
          table_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "table_sessions_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "table_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "table_sessions_tenant_id_table_id_fkey";
            columns: ["tenant_id", "table_id"];
            isOneToOne: false;
            referencedRelation: "tables";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      tables: {
        Row: {
          active: boolean;
          branch_id: string;
          capacity: number | null;
          created_at: string;
          id: string;
          label: string;
          position: number;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          branch_id: string;
          capacity?: number | null;
          created_at?: string;
          id?: string;
          label: string;
          position?: number;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          branch_id?: string;
          capacity?: number | null;
          created_at?: string;
          id?: string;
          label?: string;
          position?: number;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tables_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "tables_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_counters: {
        Row: {
          key: string;
          tenant_id: string;
          value: number;
        };
        Insert: {
          key: string;
          tenant_id: string;
          value: number;
        };
        Update: {
          key?: string;
          tenant_id?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_counters_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
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
      adjust_stock: {
        Args: { p_delta: number; p_item: string; p_note?: string; p_reason: string };
        Returns: number;
      };
      cart_update: {
        Args: {
          p_mode: string;
          p_qty: number;
          p_tenant: string;
          p_token_hash: string;
          p_variant: string;
        };
        Returns: Json;
      };
      cart_view: { Args: { p_tenant: string; p_token_hash: string }; Returns: Json };
      checkout_quote: {
        Args: { p_fulfillment: string; p_tenant: string; p_token_hash: string; p_zone: string };
        Returns: Json;
      };
      close_table_session: { Args: { p_session: string; p_tenant: string }; Returns: undefined };
      confirm_online_payment: {
        Args: {
          p_amount_minor: number;
          p_currency: string;
          p_event_id?: string;
          p_method?: string;
          p_paid: boolean;
          p_provider: string;
          p_provider_ref: string;
        };
        Returns: Json;
      };
      create_dine_in_order: {
        Args: { p_items: Json; p_notes?: string; p_session: string; p_tenant: string };
        Returns: Json;
      };
      create_order_from_cart: {
        Args: { p_checkout: Json; p_tenant: string; p_token_hash: string };
        Returns: Json;
      };
      create_table: {
        Args: { p_branch: string; p_capacity?: number; p_label: string; p_tenant: string };
        Returns: string;
      };
      daily_brief_summary: { Args: { p_tenant: string }; Returns: Json };
      get_invitation: { Args: { p_token: string }; Returns: Json };
      invite_member: {
        Args: { p_email: string; p_role_key: string; p_tenant: string };
        Returns: string;
      };
      low_stock_items: {
        Args: { p_limit?: number; p_tenant: string };
        Returns: {
          available: number;
          inventory_item_id: string;
          min_stock: number;
          option_labels: Json;
          product_id: string;
          product_name: Json;
          sku: string;
          variant_id: string;
        }[];
      };
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
      newsletter_subscribe: {
        Args: { p_email: string; p_locale: string; p_source?: string; p_tenant: string };
        Returns: undefined;
      };
      notification_settings: { Args: { p_tenant: string }; Returns: Json };
      open_table_session: {
        Args: { p_notes?: string; p_party_size?: number; p_table: string; p_tenant: string };
        Returns: string;
      };
      payment_provider_secret: { Args: { p_provider: string; p_tenant: string }; Returns: Json };
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
      platform_set_plan: {
        Args: { p_plan_key: string; p_status?: string; p_tenant: string };
        Returns: undefined;
      };
      record_domain_check: {
        Args: { p_actor: string; p_domain: string; p_error?: string; p_verified: boolean };
        Returns: undefined;
      };
      record_order_payment: {
        Args: { p_method: string; p_note?: string; p_order: string };
        Returns: undefined;
      };
      resolve_storefront: { Args: { p_hostname?: string; p_slug?: string }; Returns: Json };
      revoke_invitation: { Args: { p_invitation: string }; Returns: undefined };
      sales_summary: { Args: { p_tenant: string }; Returns: Json };
      save_payment_provider: {
        Args: {
          p_is_active: boolean;
          p_methods: string[];
          p_mode: string;
          p_provider: string;
          p_publishable_key: string;
          p_secret_key: string;
          p_tenant: string;
          p_webhook_secret: string;
        };
        Returns: undefined;
      };
      save_product_structure: {
        Args: { p_options: Json; p_product: string; p_variants: Json };
        Returns: undefined;
      };
      set_payment_intent_ref: { Args: { p_order: string; p_ref: string }; Returns: undefined };
      set_primary_domain: { Args: { p_domain: string }; Returns: undefined };
      storefront_best_sellers: { Args: { p_limit?: number; p_tenant: string }; Returns: Json };
      storefront_catalog: {
        Args: {
          p_available?: boolean;
          p_category?: string;
          p_exclude?: string;
          p_featured?: boolean;
          p_limit?: number;
          p_locale?: string;
          p_max_price?: number;
          p_min_price?: number;
          p_offset?: number;
          p_query?: string;
          p_sort?: string;
          p_tenant: string;
        };
        Returns: Json;
      };
      storefront_categories: { Args: { p_tenant: string }; Returns: Json };
      storefront_checkout_options: { Args: { p_tenant: string }; Returns: Json };
      storefront_order: {
        Args: { p_number: string; p_tenant: string; p_token_hash: string };
        Returns: Json;
      };
      storefront_payment_options: { Args: { p_tenant: string }; Returns: Json };
      storefront_product: { Args: { p_slug: string; p_tenant: string }; Returns: Json };
      storefront_sitemap: { Args: { p_tenant: string }; Returns: Json };
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
      tenants_due_daily_brief: {
        Args: Record<PropertyKey, never>;
        Returns: {
          business_name: string;
          currency: string;
          currency_exponent: number;
          locale: string;
          recipient_email: string;
          slug: string;
          tenant_id: string;
          today: string;
        }[];
      };
      update_order_status: {
        Args: { p_note?: string; p_order: string; p_status: string };
        Returns: string;
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
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
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
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
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
