// lib/funding/resolve.ts
export type ClaimType = "none" | "working_parent" | "disadvantaged_2";

export type ChildCore = {
  date_of_birth: string;            // ISO YYYY-MM-DD
  funding_claim_type: ClaimType;    // profile choice
};

export type Block = { basis: "UNIVERSAL" | "DISADVANTAGED" | "WORKING_PARENT"; hours: 15 };

function monthsBetween(dobISO: string, onISO: string): number {
  const dob = new Date(dobISO);
  const on  = new Date(onISO);
  const years  = on.getFullYear() - dob.getFullYear();
  const months = on.getMonth() - dob.getMonth();
  let m = years * 12 + months;
  if (on.getDate() < dob.getDate()) m -= 1; // floor to whole months
  return m;
}

/** Returns 0, 1, or 2 x 15h blocks, capped at 30h, based on YOUR rules above. */
export function resolveBlocksForTerm(child: ChildCore, termStartISO: string): Block[] {
  const ageM = monthsBetween(child.date_of_birth, termStartISO);
  const type = child.funding_claim_type;

  // out of scope ages
  if (ageM < 9 || ageM >= 60) return [];

  // 9–23m: only Working Parent (as 30h total = two 15h blocks)
  if (ageM < 24) {
    return type === "working_parent" ? [{ basis: "WORKING_PARENT", hours: 15 }, { basis: "WORKING_PARENT", hours: 15 }] : [];
  }

  // 24–35m: Disadvantaged 2s OR Working Parent (mutually exclusive by your rule)
  if (ageM < 36) {
    if (type === "disadvantaged_2") return [{ basis: "DISADVANTAGED", hours: 15 }];
    if (type === "working_parent")  return [{ basis: "WORKING_PARENT", hours: 15 }, { basis: "WORKING_PARENT", hours: 15 }];
    return [];
  }

  // 36–59m: Universal 15 always applies; WP may top up by 15 (max 30)
  const blocks: Block[] = [{ basis: "UNIVERSAL", hours: 15 }];
  if (type === "working_parent") blocks.push({ basis: "WORKING_PARENT", hours: 15 });
  return blocks;
}
