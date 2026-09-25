#!/usr/bin/env node
/**
 * Creates (or updates) a staff user for local development and links it to a
 * tenant. Uses the service-role key, so it only runs from a trusted shell.
 *
 *   npm run dev:user -- --email owner@roasters.test --tenant roasters --role tenant_owner
 *   npm run dev:user -- --email admin@smartmanager.test --platform-admin
 *
 * Without --password a strong random password is generated and printed once.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    tenant: { type: "string" },
    role: { type: "string", default: "tenant_owner" },
    "platform-admin": { type: "boolean", default: false },
    name: { type: "string" },
  },
});

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
if (!values.email) throw new Error("--email is required.");
if (!values.tenant && !values["platform-admin"]) throw new Error("Pass --tenant <slug> and/or --platform-admin.");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const password = values.password ?? `${randomBytes(12).toString("base64url")}Aa1`;

async function findUserByEmail(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user || data.users.length < 200) return user ?? null;
  }
}

let user = await findUserByEmail(values.email);
if (user) {
  const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
  if (error) throw error;
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email: values.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: values.name ?? values.email.split("@")[0] },
  });
  if (error) throw error;
  user = data.user;
}

if (values.tenant) {
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", values.tenant)
    .single();
  if (tenantError) throw new Error(`Tenant "${values.tenant}" not found.`);
  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("key", values.role)
    .eq("is_system", true)
    .single();
  if (roleError) throw new Error(`Role "${values.role}" not found.`);
  const { error } = await supabase
    .from("tenant_members")
    .upsert({ tenant_id: tenant.id, user_id: user.id, role_id: role.id, status: "active" });
  if (error) throw error;
}

if (values["platform-admin"]) {
  const { error } = await supabase.from("platform_admins").upsert({ user_id: user.id });
  if (error) throw error;
}

console.log(`User ready: ${values.email}`);
if (!values.password) console.log(`Password (shown once): ${password}`);
