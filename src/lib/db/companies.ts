import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { LANE_RANK } from "@/lib/display";
import { TERMINAL_STAGES, type Company, type CompanyRow, type Lane } from "@/lib/types";

const COLUMNS = "*";

/**
 * The CRM companies table.
 *
 * A company row deliberately carries no lane: the scope keeps lane on the
 * role, because one employer can hold a Primary-lane PM req and a Peripheral
 * analyst seat at the same time. The mockup shows a lane chip on this table
 * anyway, so it is derived here — the strongest lane among the company's
 * live applications — and it is a read-time projection, never a stored column.
 */
export async function listCompanies(): Promise<CompanyRow[]> {
  const db = supabaseAdmin();

  const [companies, applications, contacts] = await Promise.all([
    db.from("companies").select(COLUMNS).eq("user_id", USER_ID).order("last_touched_at", { ascending: false }),
    db.from("applications").select("id, company_id, role_title, lane, stage").eq("user_id", USER_ID),
    db.from("contacts").select("id, company_id").eq("user_id", USER_ID).eq("status", "active"),
  ]);

  if (companies.error) throw companies.error;
  if (applications.error) throw applications.error;
  if (contacts.error) throw contacts.error;

  const apps = applications.data ?? [];
  const contactCounts = new Map<string, number>();
  for (const c of contacts.data ?? []) {
    if (!c.company_id) continue;
    contactCounts.set(c.company_id, (contactCounts.get(c.company_id) ?? 0) + 1);
  }

  return ((companies.data ?? []) as Company[]).map((company) => {
    const mine = apps.filter((a) => a.company_id === company.id);
    const live = mine.filter((a) => !TERMINAL_STAGES.includes(a.stage as never));

    // Strongest lane wins, and only live roles vote — a company whose only
    // Primary role was archived should not still read Primary.
    const derived_lane =
      (live.length > 0 ? live : mine)
        .map((a) => a.lane as Lane)
        .sort((x, y) => LANE_RANK[y] - LANE_RANK[x])[0] ?? null;

    return {
      ...company,
      derived_lane,
      open_roles: live.map((a) => a.role_title),
      contact_count: contactCounts.get(company.id) ?? 0,
      application_count: mine.length,
    };
  });
}

/** Just id + name, for the classifier's entity list and for form pickers. */
export async function listCompanyNames(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabaseAdmin()
    .from("companies")
    .select("id, name")
    .eq("user_id", USER_ID)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getCompany(id: string): Promise<Company | null> {
  const { data, error } = await supabaseAdmin()
    .from("companies")
    .select(COLUMNS)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Company) ?? null;
}

/** Does this id actually exist? The guard every AI-returned id passes through. */
export async function companyExists(id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  const { data, error } = await supabaseAdmin()
    .from("companies")
    .select("id")
    .eq("user_id", USER_ID)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`[db:companies] existence check failed for ${id}: ${error.message}`);
    return false;
  }
  return Boolean(data);
}

/** Case-insensitive name lookup — how a capture's company name finds its row. */
export async function findCompanyByName(name: string): Promise<Company | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data, error } = await supabaseAdmin()
    .from("companies")
    .select(COLUMNS)
    .eq("user_id", USER_ID)
    .ilike("name", trimmed)
    .maybeSingle();
  if (error) throw error;
  return (data as Company) ?? null;
}

export interface CompanyInput {
  name: string;
  website?: string | null;
  sector?: string | null;
  notes?: string | null;
  source?: string | null;
}

export async function createCompany(input: CompanyInput): Promise<Company> {
  const { data, error } = await supabaseAdmin()
    .from("companies")
    .insert({
      user_id: USER_ID,
      name: input.name.trim(),
      website: input.website ?? null,
      sector: input.sector ?? null,
      notes: input.notes ?? null,
      source: input.source ?? "manual",
      last_touched_at: new Date().toISOString(),
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Company;
}

/** Create only if the name is new; otherwise hand back the existing row. */
export async function ensureCompany(input: CompanyInput): Promise<Company> {
  const existing = await findCompanyByName(input.name);
  if (existing) return existing;
  return createCompany(input);
}

export async function updateCompany(
  id: string,
  patch: Partial<CompanyInput> & { visibility?: "private" | "shareable" },
): Promise<Company> {
  const { data, error } = await supabaseAdmin()
    .from("companies")
    .update({ ...patch, last_touched_at: new Date().toISOString() })
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Company;
}

export async function deleteCompany(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("companies")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw error;
}

/** Bump last_touched_at. Called from anything that counts as activity. */
export async function touchCompany(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const { error } = await supabaseAdmin()
    .from("companies")
    .update({ last_touched_at: new Date().toISOString() })
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) console.error(`[db:companies] touch failed for ${id}: ${error.message}`);
}
