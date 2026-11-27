import type { ShareLinkValues } from "../ui/ShareLinkDialog";

export type ShareLinkRequest = (path: string, init?: RequestInit) => Promise<unknown>;
export type ShareLink = ShareLinkValues & {
  id: string; resourceType: string; createdAt: string; viewCount: number;
  filters?: { startDate: string; endDate: string; providerId: string | null; timeZone: string };
};

export const parentingShareScope = "Live future changes in the selected categories, not a snapshot. Only changes starting at or after now (the next change handover) are shared; ongoing and past changes are excluded. Ends are clipped to the link expiry. Later additions and edits in these categories appear automatically.";
export const childcareShareScope = "Live resolved care in the selected date range and provider filter. Only care dates from today through the selected end date are shown; later changes to arrangements and one-off care are reflected automatically.";

const resources: Record<string, { label: string; scope: string; categories: Record<string, string> }> = {
  parenting_changes: {
    label: "Parenting changes",
    scope: parentingShareScope,
    categories: { adjusted_handover: "Adjusted Handover", holiday: "Holiday", diverse: "Diverse" },
  },
  childcare_schedule: {
    label: "Resolved care",
    scope: childcareShareScope,
    categories: {},
  },
};

export const shareResourceLabel = (resourceType: string) => resources[resourceType]?.label ?? resourceType;
export const shareResourceScope = (resourceType: string) => resources[resourceType]?.scope;
export const shareCategoriesLabel = (link: ShareLink) =>
  link.resourceType === "childcare_schedule"
    ? `${link.filters?.startDate ?? "—"} – ${link.filters?.endDate ?? "—"} · ${link.filters?.providerId ? "Selected provider" : "All providers"}`
    : link.categories.map((category) => resources[link.resourceType]?.categories[category] ?? category).join(", ") || "—";
