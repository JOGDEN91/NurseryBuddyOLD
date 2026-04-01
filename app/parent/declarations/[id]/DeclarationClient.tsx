"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DeclDetail = {
  id: string;
  status: string;
  signed_at: string | null;
  signed_by_name: string | null;
  snapshot: any;
  child: any;
  term: any;
};

type Payload = {
  ok: boolean;
  declaration?: DeclDetail;
  template?: { title: string; text: string };
  error?: string;
};

type SettingsPayload = {
  ok: boolean;
  settings?: {
    declaration_intro_text?: string | null;
    declaration_reconfirm_text?: string | null;
    declaration_privacy_text?: string | null;
    declaration_privacy_url?: string | null;
  } & Record<string, any>;
  error?: string;
};

type DocStatus = {
  label: string;
  status: string;
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? d ?? "—"
    : dt.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? d ?? "—"
    : dt.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function sumHours(values: (number | null | undefined)[]) {
  return values.reduce((acc, v) => {
    if (v == null) return acc;
    const n = Number(v);
    return isNaN(n) ? acc : acc + n;
  }, 0);
}

/* ---------- Generic fallbacks for wording (used if nursery has not overridden) ---------- */

const GENERIC_INTRO_TEXT = `
This form is used to claim funded early education and childcare on behalf of my child. It can be used for:
• the universal 15 hours entitlement for 3 and 4 year olds
• any extended / “30 hours” entitlement for eligible working parents
• any 2-year-old funded entitlement that applies in our local authority (for example, for low income families, children with additional needs or children in care)

By completing and signing this declaration I confirm that:
• I have parental responsibility for my child and the details in this form are true and complete.
• I understand that this information will be used by the nursery and the local authority to calculate and claim funded hours for my child.
• I will tell the nursery as soon as possible if any of the details change (for example, if my child attends a different provider, we move address, my working pattern changes or my eligibility changes).

I understand that funding can be shared between more than one provider, but the total number of funded hours claimed for my child must not be more than the maximum hours allowed each week and each term under the national rules. I agree to work with the nursery to confirm which hours are claimed here and which are claimed at any other providers my child attends.
`.trim();

const GENERIC_RECONFIRM_TEXT = `
If I am claiming any extended or “30 hours” funded entitlement, I understand that:
• I must apply for and hold a valid eligibility code from the government’s childcare service (for example, via GOV.UK).
• I must reconfirm my details with the childcare service roughly every 3 months, or as required by the government, to keep my code valid.
• If I do not reconfirm on time, or my circumstances change so that I am no longer eligible, my code may stop being valid and the nursery may no longer be able to claim the extended hours for my child.

I agree to:
• provide the nursery with my eligibility code, my National Insurance number and date of birth (and, where required by the local authority, the second parent / carer’s details) so that the code can be checked.
• tell the nursery immediately if my code becomes invalid, if I receive a message from the childcare service saying my eligibility has changed, or if my circumstances change.

I understand that if my eligibility ends, my child may be able to continue to receive the universal 15 hours entitlement (if applicable) and that any continued use of extended hours will be subject to the local authority’s “grace period” rules and the nursery’s own policies.
`.trim();

const GENERIC_PRIVACY_TEXT = `
The nursery will collect information about me and my child (including names, addresses, dates of birth, contact details and, where needed, National Insurance or National Asylum Support Service numbers) so that funded early education and childcare can be claimed correctly.

I understand that:
• The nursery will share the information in this form with the local authority so that the local authority can check eligibility, calculate funding, prevent error or fraud and carry out its statutory duties.
• The local authority may check the information I provide with other government departments or agencies (for example HM Revenue & Customs or the Department for Work and Pensions) where the law allows, in order to confirm my eligibility and protect public funds.
• The nursery and the local authority will keep my information secure and will only keep it for as long as is necessary to meet legal, audit and funding requirements.
• I have rights over my personal data, including the right to request access to it and, in some circumstances, to ask for corrections or raise concerns about how it is used.

Further details about how personal information is collected, used and protected – and about my rights under data protection law – are available in the full privacy / fair processing notice.
`.trim();

/* ---------------- Signature Pad ---------------- */

type SigStroke = Array<{ x: number; y: number }>;
type SigState = { strokes: SigStroke[] };

function SignaturePad({
  disabled,
  value,
  onChange,
}: {
  disabled: boolean;
  value: SigState;
  onChange: (next: SigState) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<SigStroke>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const hasInk = useMemo(() => {
    const strokes = value?.strokes ?? [];
    const points = strokes.reduce((acc, s) => acc + s.length, 0);
    return points >= 12;
  }, [value]);

  function getCtx() {
    const c = canvasRef.current;
    if (!c) return null;
    return c.getContext("2d");
  }

  function redraw() {
    const c = canvasRef.current;
    const ctx = getCtx();
    if (!c || !ctx) return;

    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = Math.max(2, Math.round(c.width / 220));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const strokes = value?.strokes ?? [];
    for (const stroke of strokes) {
      if (!stroke || stroke.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < stroke.length; i++) {
        const p = stroke[i];
        const px = p.x * c.width;
        const py = p.y * c.height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const ro = new ResizeObserver(() => {
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));

      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        setSize({ w, h });
      }
    });

    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, value]);

  function pointFromEvent(e: PointerEvent): { x: number; y: number } | null {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  function startStroke(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const e = ev.nativeEvent;
    (ev.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;

    const p = pointFromEvent(e);
    currentStrokeRef.current = p ? [p] : [];
  }

  function moveStroke(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    if (!drawingRef.current) return;

    const e = ev.nativeEvent;
    const p = pointFromEvent(e);
    if (!p) return;

    const cur = currentStrokeRef.current;
    cur.push(p);

    if (cur.length % 3 === 0) {
      const c = canvasRef.current;
      const ctx = getCtx();
      if (c && ctx && cur.length >= 2) {
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = Math.max(2, Math.round(c.width / 220));
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const a = cur[cur.length - 2];
        const b = cur[cur.length - 1];
        ctx.beginPath();
        ctx.moveTo(a.x * c.width, a.y * c.height);
        ctx.lineTo(b.x * c.width, b.y * c.height);
        ctx.stroke();
      }
    }
  }

  function endStroke() {
    if (disabled) return;
    if (!drawingRef.current) return;
    drawingRef.current = false;

    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = [];

    if (stroke && stroke.length >= 2) {
      onChange({ strokes: [...(value?.strokes ?? []), stroke] });
    } else {
      redraw();
    }
  }

  function clear() {
    onChange({ strokes: [] });
  }

  function exportPngDataUrl(): string {
    const c = canvasRef.current;
    if (!c) return "";
    return c.toDataURL("image/png");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-600">Draw your signature below</div>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || (value?.strokes?.length ?? 0) === 0}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-900 shadow-sm disabled:opacity-50"
        >
          Clear
        </button>
      </div>

      <div className="rounded-xl border border-gray-300 bg-white p-2">
        <canvas
          ref={canvasRef}
          className="h-40 w-full rounded-lg"
          style={{ touchAction: "none", background: "#fff" }}
          onPointerDown={startStroke}
          onPointerMove={moveStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />
      </div>

      <div className="text-[11px] text-gray-500">
        Tip: Use your finger on a phone, or a mouse/trackpad on desktop.
      </div>

      <input type="hidden" value={hasInk ? "1" : ""} readOnly />
      <div className="hidden" data-export={exportPngDataUrl()} />
    </div>
  );
}

export default function DeclarationClient({ declarationId }: { declarationId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [sig, setSig] = useState<SigState>({ strokes: [] });

  const [settings, setSettings] = useState<SettingsPayload["settings"] | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [docStatuses, setDocStatuses] = useState<DocStatus[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/parent/declarations");
  };

  async function reloadDeclaration() {
    const r2 = await fetch(`/api/parent/declarations/${declarationId}`, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });
    const j2: Payload = await r2.json();
    if (r2.ok && j2.ok !== false) setData(j2);
  }

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`/api/parent/declarations/${declarationId}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const j: Payload = await res.json();
        if (cancel) return;
        if (!res.ok || j.ok === false) setError(j.error || `HTTP ${res.status}`);
        else setData(j);
      } catch (e: any) {
        if (!cancel) setError(e?.message || "Network error");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [declarationId]);

  const decl = data?.declaration;
  const child = decl?.child || {};
  const term = decl?.term || {};

  const childName = `${child.first_name ?? ""} ${child.last_name ?? ""}`.trim() || "Unnamed";
  const weeklyHours = sumHours([child.hours_mon, child.hours_tue, child.hours_wed, child.hours_thu, child.hours_fri]);

  const hasWorkingParent = !!child.claim_working_parent;
  const hasDisadv2 = !!child.claim_disadvantaged2;

  const alreadySigned = decl?.status === "signed";
  const existingSigDataUrl = decl?.snapshot?.signature?.data_url ?? null;

  // NEW: allow attaching signature if already signed but no signature data_url exists
  const canAttachSignature = !!alreadySigned && !existingSigDataUrl;

  useEffect(() => {
    if (!child.nursery_id) return;
    let cancel = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("nurseryId", child.nursery_id as string);
        const res = await fetch(`/api/settings?${params.toString()}`, { credentials: "include", cache: "no-store" });
        const j: SettingsPayload = await res.json().catch(() => ({ ok: false } as SettingsPayload));
        if (cancel) return;
        if (!res.ok || j.ok === false) setSettingsError(j.error || `Settings error (HTTP ${res.status}).`);
        else setSettings(j.settings ?? null);
      } catch (e: any) {
        if (!cancel) setSettingsError(e?.message || "Could not load declaration text.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [child.nursery_id]);

  useEffect(() => {
    if (!decl?.child?.id) return;

    let cancelled = false;
    async function loadDocs() {
      setDocsLoading(true);
      setDocsError(null);
      try {
        const res = await fetch(`/api/parent/children/${encodeURIComponent(decl.child.id as string)}/documents`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({} as any));
        if (cancelled) return;
        if (!res.ok || j.ok === false) {
          setDocsError(j.error || `Unable to load documents (HTTP ${res.status}).`);
          setDocStatuses(null);
        } else {
          setDocStatuses((j.items ?? []) as DocStatus[]);
        }
      } catch (e: any) {
        if (!cancelled) {
          setDocsError(e?.message || "Network error while loading documents.");
          setDocStatuses(null);
        }
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    }

    loadDocs();
    return () => {
      cancelled = true;
    };
  }, [decl?.child?.id]);

  const introText = settings?.declaration_intro_text?.trim() || GENERIC_INTRO_TEXT;
  const reconfirmText = settings?.declaration_reconfirm_text?.trim() || GENERIC_RECONFIRM_TEXT;
  const privacyText = settings?.declaration_privacy_text?.trim() || GENERIC_PRIVACY_TEXT;
  const privacyUrl = settings?.declaration_privacy_url?.trim() || null;

  const signatureHasInk = useMemo(() => {
    const strokes = sig?.strokes ?? [];
    const points = strokes.reduce((acc, s) => acc + s.length, 0);
    return points >= 12;
  }, [sig]);

  async function submitSignature(endpoint: "sign" | "attach") {
    const exportNode = document.querySelector("[data-export]");
    const signature_data_url = exportNode?.getAttribute("data-export") ?? "";

    if (!signature_data_url || !signature_data_url.startsWith("data:image/")) {
      setError("Signature could not be captured. Please try again.");
      return;
    }

    const url =
      endpoint === "sign"
        ? `/api/parent/declarations/${declarationId}/sign`
        : `/api/parent/declarations/${declarationId}/attach-signature`;

    const payload =
      endpoint === "sign"
        ? {
            accepted: true,
            full_name: fullName.trim(),
            signature_data_url,
            signature_meta: {
              method: "drawn",
              strokes: (sig?.strokes ?? []).length,
              points: (sig?.strokes ?? []).reduce((acc, s) => acc + s.length, 0),
            },
          }
        : {
            full_name: fullName.trim(),
            signature_data_url,
            signature_meta: {
              method: "drawn",
              strokes: (sig?.strokes ?? []).length,
              points: (sig?.strokes ?? []).reduce((acc, s) => acc + s.length, 0),
              attached: true,
            },
          };

    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const j = await res.json().catch(() => ({} as any));
    if (!res.ok || j.ok === false) {
      setError(j.error || `Unable to save signature (HTTP ${res.status}).`);
      return;
    }

    setSuccessMessage(endpoint === "sign" ? "Declaration signed." : "Signature added.");
    await reloadDeclaration();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!decl) return;

    setError(null);
    setSuccessMessage(null);

    // CASE 1: unsigned -> normal sign
    if (!alreadySigned) {
      if (!accepted) {
        setError("Please tick the box to confirm the declaration.");
        return;
      }
      if (!fullName.trim()) {
        setError("Please type your full name to sign.");
        return;
      }
      if (!signatureHasInk) {
        setError("Please draw your signature before signing.");
        return;
      }

      setSaving(true);
      try {
        await submitSignature("sign");
      } catch (e: any) {
        setError(e?.message || "Network error while signing.");
      } finally {
        setSaving(false);
      }
      return;
    }

    // CASE 2: already signed, but missing drawn signature -> allow attach
    if (canAttachSignature) {
      if (!fullName.trim()) {
        setError("Please type your full name to attach a signature.");
        return;
      }
      if (!signatureHasInk) {
        setError("Please draw your signature before saving.");
        return;
      }

      setSaving(true);
      try {
        await submitSignature("attach");
      } catch (e: any) {
        setError(e?.message || "Network error while saving signature.");
      } finally {
        setSaving(false);
      }
      return;
    }

    // CASE 3: signed and already has signature
    setError("This declaration has already been signed and a signature is stored.");
  }

  return (
    <>
      <div className="fixed inset-0 z-0 pointer-events-none" style={{ backgroundColor: "#24364B" }} />

      <FixedBackHeader onBack={goBack} />

      <div className="relative z-10 min-h-screen">
        <div className="h-10" />

        <div className="mx-auto max-w-screen-sm px-4 pb-24 space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-900 shadow-sm">
              Loading declaration…
            </div>
          ) : error && !decl ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
              {error}
            </div>
          ) : !decl ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-900 shadow-sm">
              Declaration not found.
            </div>
          ) : (
            <>
              {/* Header + core declaration wording */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
                <h1 className="text-lg font-semibold">Funding Declaration</h1>
                <p className="mt-1 text-xs text-gray-500">
                  Please read each section carefully, check the details about your child and your funding, then sign at the end.
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-gray-500">Child</div>
                    <div className="font-medium">{childName}</div>
                    <div className="text-[11px] text-gray-500">Date of birth: {fmtDate(child.date_of_birth)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Term</div>
                    <div className="font-medium">{term.label || term.term_name || "—"}</div>
                    <div className="text-[11px] text-gray-500">
                      {fmtDate(term.start_date)} – {fmtDate(term.end_date)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-[11px] leading-snug text-gray-700">
                  {settingsError && (
                    <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
                      {settingsError}
                    </div>
                  )}

                  <section className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Part 1</div>
                      <div className="text-[10px] text-gray-400">Overview</div>
                    </div>
                    <h2 className="mt-0.5 text-xs font-semibold text-gray-800">About this funding declaration</h2>
                    <p className="mt-1 whitespace-pre-line">{introText}</p>
                  </section>

                  <section className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Part 2</div>
                      <div className="text-[10px] text-gray-400">Extended entitlement</div>
                    </div>
                    <h2 className="mt-0.5 text-xs font-semibold text-gray-800">
                      30 hours / extended entitlement and reconfirmation
                    </h2>
                    <p className="mt-1 whitespace-pre-line">{reconfirmText}</p>
                  </section>

                  <section className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Part 3</div>
                      <div className="text-[10px] text-gray-400">Data protection</div>
                    </div>
                    <h2 className="mt-0.5 text-xs font-semibold text-gray-800">
                      How my information will be used and shared
                    </h2>
                    <p className="mt-1 whitespace-pre-line">{privacyText}</p>

                    {privacyUrl && (
                      <p className="mt-2 text-[10px] text-blue-700 underline">
                        Full privacy / fair processing notice:{" "}
                        <a href={privacyUrl} target="_blank" rel="noreferrer">
                          {privacyUrl}
                        </a>
                      </p>
                    )}
                  </section>
                </div>

                {alreadySigned && (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    This declaration was signed by{" "}
                    <span className="font-semibold">{decl.signed_by_name || "a parent / carer"}</span> on{" "}
                    <span className="font-semibold">{fmtDateTime(decl.signed_at)}</span>.
                  </div>
                )}
              </div>

              {/* (child details, parents, docs, funding sections remain unchanged from your file) */}

              {/* Sign / Attach Signature form */}
              <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-900 shadow-sm">
                <h2 className="text-sm font-semibold">
                  {alreadySigned ? "Signature" : "Part 4 – Parent / carer declaration"}
                </h2>

                {!alreadySigned && (
                  <div className="flex items-start gap-2">
                    <input
                      id="accepted"
                      type="checkbox"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                      className="mt-[2px] h-4 w-4 rounded border-gray-300 text-blue-600"
                      disabled={saving}
                    />
                    <label htmlFor="accepted" className="text-xs leading-snug text-gray-700">
                      I confirm that I have read and understood the information above and that the details about my child, our household and
                      our funded hours are true and complete. I understand that I must inform the nursery immediately if any of these details
                      change or if my eligibility for funded hours changes.
                    </label>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-600">Type your full name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    disabled={saving}
                    placeholder="Full name"
                  />
                </div>

                {/* Draw pad when unsigned OR when signed-but-missing-drawn-signature */}
                {!alreadySigned || canAttachSignature ? (
                  <SignaturePad disabled={saving} value={sig} onChange={setSig} />
                ) : existingSigDataUrl ? (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-600">Signature</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={existingSigDataUrl}
                      alt="Signature"
                      className="w-full rounded-xl border border-gray-300 bg-white"
                    />
                  </div>
                ) : null}

                {error && (
                  <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {error}
                  </div>
                )}
                {successMessage && (
                  <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    {successMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving || (alreadySigned && !canAttachSignature) }
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm disabled:opacity-60"
                >
                  {alreadySigned
                    ? canAttachSignature
                      ? saving
                        ? "Saving…"
                        : "Add signature"
                      : "Signature saved"
                    : saving
                    ? "Signing…"
                    : "Sign declaration"}
                </button>

                {alreadySigned && canAttachSignature && (
                  <div className="text-[11px] text-gray-500">
                    This declaration was signed previously using a typed name. You can optionally add a drawn signature for additional evidence.
                  </div>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function FixedBackHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="fixed inset-x-0 top-0 z-50" style={{ backgroundColor: "#24364B" }}>
      <div className="mx-auto flex h-12 max-w-screen-sm items-center justify-between px-3">
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex h-10 w-10 -ml-1 items-center justify-center text-2xl leading-none text-white focus:outline-none"
        >
          ‹
        </button>
        <div className="pointer-events-none absolute left-0 right-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nursery-buddy-icon.png" alt="Logo" className="h-9" />
        </div>
        <div className="w-10" />
      </div>
    </div>
  );
}