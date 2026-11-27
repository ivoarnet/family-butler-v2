import { useState } from "react";
import { Typography } from "@mui/material";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import { ShareLinkDialog, type ShareCategory, type ShareLinkValues } from "../../../shared/ui/ShareLinkDialog";
import { parentingShareScope, type ShareLinkRequest } from "../../../shared/sharing/shareLinks";

export function ParentingShareLinks({ householdId, request, defaultExpiresAt, selectedCategories, categoryOptions, disabled }: {
  householdId: string;
  request: ShareLinkRequest;
  defaultExpiresAt: string;
  selectedCategories: string[];
  categoryOptions: ShareCategory[];
  disabled: boolean;
}) {
  const base = `/api/households/${encodeURIComponent(householdId)}/share-links`;
  const [draft, setDraft] = useState<ShareLinkValues | null>(null);
  return <>
    <button type="button" className="icon-button" aria-label="Share parenting changes" title="Share parenting changes" disabled={disabled}
      onClick={() => setDraft({ expiresAt: defaultExpiresAt, note: "", categories: [...selectedCategories] })}>
      <ShareOutlinedIcon fontSize="small" />
    </button>
    {draft && <ShareLinkDialog title="Share parenting changes"
      information={<Typography variant="body2">{parentingShareScope}</Typography>}
      initialValues={draft} categoryOptions={categoryOptions}
      onClose={() => setDraft(null)} onSave={async (values, signal) => {
        const result = await request(base, {
          method: "POST", signal, body: JSON.stringify({ ...values, resourceType: "parenting_changes" }),
        }) as { token?: string };
        if (signal.aborted) return;
        if (!result.token || !/^[A-Za-z0-9_-]{43}$/.test(result.token)) throw new Error("The new URL is unavailable. Create another link.");
        return `${window.location.origin}/shared#${result.token}`;
      }} />}
  </>;
}
