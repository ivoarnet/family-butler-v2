import { useEffect, useRef, useState } from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import {
  DialogActionsBar, DialogContentPanel, DialogHeader, GlassDialog, GradientButton, SecondaryButton,
} from "../../../shared/ui/GlassFormDialog";
import { ShareLinkDialog, type ShareCategory, type ShareLinkValues } from "../../../shared/ui/ShareLinkDialog";
import type { ParentingTimeRequest } from "./ParentingTimeSettings";

export type ShareLink = ShareLinkValues & { id: string; resourceType: "parenting_changes"; createdAt: string };
export const parentingShareScope = "Live future changes in the selected categories, not a snapshot. Only changes starting at or after now (the next change handover) are shared; ongoing and past changes are excluded. Ends are clipped to the link expiry. Later additions and edits in these categories appear automatically.";
const formatDate = (iso: string) => new Date(iso).toLocaleString();

export function ParentingShareLinks({ householdId, request, defaultExpiresAt, selectedCategories, categoryOptions, disabled }: {
  householdId: string;
  request: ParentingTimeRequest;
  defaultExpiresAt: string;
  selectedCategories: string[];
  categoryOptions: ShareCategory[];
  disabled: boolean;
}) {
  const base = `/api/households/${encodeURIComponent(householdId)}/share-links`;
  const [draft, setDraft] = useState<ShareLinkValues & { id?: string } | null>(null);
  const [overview, setOverview] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [deleting, setDeleting] = useState<ShareLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const load = async () => {
    pending.current?.abort();
    const operation = new AbortController();
    pending.current = operation;
    setBusy(true);
    setError("");
    try {
      const result = await request(base, { signal: operation.signal }) as { links: ShareLink[] };
      if (!operation.signal.aborted) setLinks(result.links);
    } catch (cause) {
      if (!operation.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load shared links.");
    } finally {
      if (!operation.signal.aborted) setBusy(false);
    }
  };
  const categories = (values: string[]) => values.map((value) => categoryOptions.find((option) => option.value === value)?.label ?? value).join(", ");
  return <>
    <button type="button" className="icon-button" aria-label="Share parenting changes" title="Share parenting changes" disabled={disabled}
      onClick={() => setDraft({ expiresAt: defaultExpiresAt, note: "", categories: [...selectedCategories] })}>
      <ShareOutlinedIcon fontSize="small" />
    </button>
    <SecondaryButton type="button" onClick={() => { setOverview(true); void load(); }}>Shared links</SecondaryButton>
    <GlassDialog open={overview && !draft} onClose={() => { if (!busy) setOverview(false); }} maxWidth="sm" fullWidth aria-labelledby="shared-links-title">
      <DialogHeader><Typography id="shared-links-title" variant="h6">Shared links</Typography></DialogHeader>
      <DialogContentPanel>
        <Typography variant="body2">{parentingShareScope}</Typography>
        <Typography variant="body2">URLs cannot be recovered: only a digest is stored. Save each new link when creating it, or create another.</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {busy && <Typography role="status">Loading…</Typography>}
        {!busy && !error && links.length === 0 && <Typography>No shared links yet.</Typography>}
        {links.map((link) => <Box component="article" key={link.id} sx={{ border: "1px solid var(--dialog-border)", borderRadius: 2, p: 2 }}>
          <Stack spacing={1}>
            <Typography sx={{ fontWeight: 600 }}>Parenting changes · {Date.parse(link.expiresAt) > Date.now() ? "Active" : "Expired"}</Typography>
            <Typography>Categories: {categories(link.categories)}</Typography>
            <Typography variant="body2">Created: {formatDate(link.createdAt)}</Typography>
            <Typography variant="body2">Expires: {formatDate(link.expiresAt)} ({Intl.DateTimeFormat().resolvedOptions().timeZone})</Typography>
            <Typography sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>Private note: {link.note || "None"}</Typography>
            <Stack direction="row" spacing={1}>
              <SecondaryButton disabled={busy} onClick={() => setDraft({ ...link, note: link.note ?? "" })}>Edit link</SecondaryButton>
              <SecondaryButton disabled={busy} onClick={() => { setError(""); setDeleting(link); }}>Delete link</SecondaryButton>
            </Stack>
          </Stack>
        </Box>)}
      </DialogContentPanel>
      <DialogActionsBar>
        <SecondaryButton disabled={busy} onClick={() => void load()}>Refresh</SecondaryButton>
        <SecondaryButton disabled={busy} onClick={() => setOverview(false)}>Close</SecondaryButton>
      </DialogActionsBar>
    </GlassDialog>
    {draft && <ShareLinkDialog title={draft.id ? "Edit shared link" : "Share parenting changes"}
      initialValues={draft} editing={!!draft.id} categoryOptions={draft.id ? undefined : categoryOptions}
      onClose={() => setDraft(null)} onSave={async (values, signal) => {
        const result = await request(draft.id ? `${base}?id=${encodeURIComponent(draft.id)}` : base, {
          method: draft.id ? "PATCH" : "POST", signal,
          body: JSON.stringify(draft.id ? { expiresAt: values.expiresAt, note: values.note }
            : { ...values, resourceType: "parenting_changes" }),
        }) as { link: ShareLink; token?: string };
        if (signal.aborted) return;
        setLinks((current) => [result.link, ...current.filter((link) => link.id !== result.link.id)]);
        if (!draft.id) {
          if (!result.token || !/^[A-Za-z0-9_-]{43}$/.test(result.token)) throw new Error("The new URL is unavailable. Create another link.");
          return `${window.location.origin}/shared#${result.token}`;
        }
      }}>
      <Typography variant="body2">{parentingShareScope}</Typography>
      <Typography variant="body2">Anyone with this link can view these changes until it expires or you delete it. Keep it private.</Typography>
      {draft.id && <Typography>Categories: {categories(draft.categories)}. Create another link to change its categories.</Typography>}
    </ShareLinkDialog>}
    <GlassDialog open={!!deleting} onClose={() => { if (!busy) setDeleting(null); }} maxWidth="xs" fullWidth aria-labelledby="delete-link-title">
      <DialogHeader><Typography id="delete-link-title" variant="h6">Delete shared link?</Typography></DialogHeader>
      <DialogContentPanel>
        <Typography>The link will stop working for everyone. This cannot be undone.</Typography>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContentPanel>
      <DialogActionsBar>
        <SecondaryButton disabled={busy} onClick={() => setDeleting(null)}>Cancel</SecondaryButton>
        <GradientButton disabled={busy} onClick={async () => {
          if (!deleting) return;
          const operation = new AbortController();
          pending.current = operation;
          setBusy(true);
          setError("");
          try {
            await request(`${base}?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE", signal: operation.signal });
            if (operation.signal.aborted) return;
            setLinks((current) => current.filter((link) => link.id !== deleting.id));
            setDeleting(null);
          } catch (cause) {
            if (!operation.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not delete the shared link.");
          } finally {
            if (!operation.signal.aborted) setBusy(false);
          }
        }}>{busy ? "Deleting…" : "Delete permanently"}</GradientButton>
      </DialogActionsBar>
    </GlassDialog>
  </>;
}
