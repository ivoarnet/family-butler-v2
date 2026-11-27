import type { ShareLinkValues } from "../ui/ShareLinkDialog";

export type ShareLinkRequest = (path: string, init?: RequestInit) => Promise<unknown>;
export type ShareLink = ShareLinkValues & { id: string; resourceType: string; createdAt: string };

export const parentingShareScope = "Live future changes in the selected categories, not a snapshot. Only changes starting at or after now (the next change handover) are shared; ongoing and past changes are excluded. Ends are clipped to the link expiry. Later additions and edits in these categories appear automatically.";

const resources: Record<string, { label: string; scope: string; categories: Record<string, string> }> = {
  parenting_changes: {
    label: "Parenting changes",
    scope: parentingShareScope,
    categories: { adjusted_handover: "Adjusted Handover", holiday: "Holiday", diverse: "Diverse" },
  },
};

export const shareResourceLabel = (resourceType: string) => resources[resourceType]?.label ?? resourceType;
export const shareResourceScope = (resourceType: string) => resources[resourceType]?.scope;
export const shareCategoriesLabel = (link: ShareLink) =>
  link.categories.map((category) => resources[link.resourceType]?.categories[category] ?? category).join(", ") || "—";
