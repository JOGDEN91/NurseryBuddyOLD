// app/api/children/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import * as XLSX from "xlsx";

function supa() {
  const jar = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => jar.get(n)?.value,
        set: (n, v, o) => jar.set({ name: n, value: v, ...(o as any) }),
        remove: (n, o) => jar.set({ name: n, value: "", ...(o as any), maxAge: 0 }),
      },
    }
  );
}

const ymd = (s?: any) => {
  if (!s && s !== 0) return null;
  if (s instanceof Date && !isNaN(s.valueOf())) return s.toISOString().slice(0, 10);
  if (typeof s === "number") {
    const d = XLSX.SSF.parse_date_code(s as number);
    if (d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  const str = String(s).trim();
  if (!str) return null;
  const d2 = new Date(str);
  if (!isNaN(d2.valueOf())) return d2.toISOString().slice(0, 10);
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [_, dd, mm, yyyy] = m;
    const Y = String(yyyy).length === 2 ? `20${yyyy}` : yyyy;
    return `${Y}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return null;
};

const firstDef = (...vals: any[]) =>
  vals.find((v) => v !== undefined && v !== null && v !== "");

function resolveNurseryId(req: NextRequest, bodyNursery?: string | null) {
  const url = new URL(req.url);
  return (
    bodyNursery ??
    url.searchParams.get("nurseryId") ??
    url.searchParams.get("nursery_id") ??
    cookies().get("nb.nurseryId")?.value ??
    null
  );
}

function header(row: Record<string, any>, ...aliases: string[]) {
  for (const a of aliases) {
    if (row[a] !== undefined && row[a] !== "") return row[a];
    const key = Object.keys(row).find((k) => k.toLowerCase() === a.toLowerCase());
    if (key && row[key] !== undefined && row[key] !== "") return row[key];
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  const sb = supa();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const bodyNursery = (form.get("nursery_id") || form.get("nurseryId")) as string | null;
  const nursery_id = resolveNurseryId(req, bodyNursery);
  if (!nursery_id) return NextResponse.json({ error: "Missing nursery_id" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, any>[];

  if (!rows.length) return NextResponse.json({ imported: 0 });

  const mapped = rows
    .map((r) => {
      const first_name = header(r, "first_name", "firstname", "first name", "forename");
      const last_name = header(r, "last_name", "lastname", "last name", "surname", "family_name");
      const dobRaw = header(r, "dob", "date_of_birth", "date of birth", "birthdate", "birth date");
      const dob = ymd(dobRaw);
      if (!first_name || !last_name || !dob) return null;

      // NI/NIN → parent_nis
      const parent_nis =
        header(
          r,
          "parent_nis",
          "ni",
          "nin",
          "ni_number",
          "ni number",
          "national_insurance_number",
          "national insurance number"
        ) ?? null;

      return {
        nursery_id,
        first_name,
        last_name,
        dob,
        date_of_birth: dob,
        start_date: ymd(header(r, "start_date", "start date", "start")),
        end_date: ymd(header(r, "end_date", "end date", "leave date", "leaving")),
        gender: header(r, "gender", "sex") ?? null,
        ethnicity: header(r, "ethnicity") ?? null,
        address_line1: firstDef(
          header(r, "address_line1"),
          header(r, "address_line_1"),
          header(r, "line1"),
          header(r, "address1"),
          header(r, "address")
        ) ?? n
