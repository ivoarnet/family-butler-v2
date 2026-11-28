import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Typography } from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  DialogActionsBar, DialogContentPanel, DialogHeader, GlassDialog, GradientButton, SecondaryButton,
} from "../../../shared/ui/GlassFormDialog";
import { ShareLinkDialog } from "../../../shared/ui/ShareLinkDialog";
import { SettingsInfo } from "./SettingsInfo";
import { formatShareDateTime } from "../../../shared/sharing/formatShareDateTime";
import {
  shareCategoriesLabel, shareResourceLabel, shareResourceScope, type ShareLink, type ShareLinkRequest,
} from "../../../shared/sharing/shareLinks";

type Props = { householdId: string; request: ShareLinkRequest };
const formatDate = formatShareDateTime;

export function SharedLinksSettings(props: Props) {
  return <HouseholdSharedLinks key={props.householdId} {...props} />;
}

function HouseholdSharedLinks({ householdId, request }: Props) {
  const base = `/api/households/${encodeURIComponent(householdId)}/share-links`;
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [draft, setDraft] = useState<ShareLink | null>(null);
  const [deleting, setDeleting] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    pending.current?.abort();
    const operation = new AbortController();
    pending.current = operation;
    setLoading(true);
    setError("");
    try {
      const result = await request(base, { signal: operation.signal }) as { links: ShareLink[] };
      if (!operation.signal.aborted) setLinks(result.links);
    } catch (cause) {
      if (!operation.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load shared links.");
    } finally {
      if (!operation.signal.aborted) setLoading(false);
    }
  }, [base, request]);
  useEffect(() => {
    void load();
    return () => pending.current?.abort();
  }, [load]);

  return <>
    <div className="section-toolbar">
      <span className="section-title-info"><h2>Shared links</h2>
        <SettingsInfo label="Shared links information" text="Manage links you shared from this household. Notes are private. Views count successful page opens, not automatic refreshes or unique people. Save each URL when creating it: only a digest is stored, so lost URLs cannot be recovered. Create a new link if needed." />
      </span>
      <SecondaryButton disabled={loading || busy || !!draft || !!deleting} onClick={() => void load()}>Refresh</SecondaryButton>
    </div>
    {loading && <div role="status">Loading shared links…</div>}
    {error && <Alert severity="error" action={<SecondaryButton onClick={() => void load()}>Retry</SecondaryButton>}>{error}</Alert>}
    {!loading && !error && <div className="table-scroll">
      <table className="settings-table" aria-label="Shared links">
        <thead><tr><th>Resource / type</th><th>Categories / scope</th><th>Created</th><th>Expires / status</th><th>Views</th><th>Private note</th><th className="actions-column">Actions</th></tr></thead>
        <tbody>
          {links.length === 0 && <tr><td colSpan={7}>No shared links yet.</td></tr>}
          {links.map((link) => <tr key={link.id}>
            <td>{shareResourceLabel(link.resourceType)}</td>
            <td>{shareCategoriesLabel(link)}{shareResourceScope(link.resourceType) && <details>
              <summary>Scope</summary><p>{shareResourceScope(link.resourceType)}</p>
            </details>}</td>
            <td>{formatDate(link.createdAt)}</td>
            <td>{formatDate(link.expiresAt)} ({Intl.DateTimeFormat().resolvedOptions().timeZone})<br />
              <span>{Date.parse(link.expiresAt) > Date.now() ? "Active" : "Expired"}</span></td>
            <td>{link.viewCount}</td>
            <td style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{link.note || "—"}</td>
            <td className="actions-cell"><div className="action-buttons icon-actions">
              <button type="button" className="icon-button compact-icon-button" disabled={busy}
                aria-label={`Edit shared link for ${shareResourceLabel(link.resourceType)}`} title="Edit shared link"
                onClick={() => setDraft({ ...link, note: link.note ?? "" })}><EditOutlinedIcon fontSize="small" /></button>
              <button type="button" className="icon-button compact-icon-button" disabled={busy}
                aria-label={`Delete shared link for ${shareResourceLabel(link.resourceType)}`} title="Delete shared link"
                onClick={() => { setDeleteError(""); setDeleting(link); }}><DeleteOutlinedIcon fontSize="small" /></button>
            </div></td>
          </tr>)}
        </tbody>
      </table>
    </div>}
    {draft && <ShareLinkDialog title="Edit shared link" initialValues={draft} editing onClose={() => setDraft(null)}
      information={<>
        <Typography variant="body2">{draft.resourceType === "childcare_schedule"
          ? "The expiry date is the end of the shared care filter; create a new link to change the date or provider filter."
          : "Create another link to change its categories."}</Typography>
        {shareResourceScope(draft.resourceType) && <Typography variant="body2">{shareResourceScope(draft.resourceType)}</Typography>}
      </>}
      expiryLocked={draft.resourceType === "childcare_schedule"}
      onSave={async (values, signal) => {
        const result = await request(`${base}?id=${encodeURIComponent(draft.id)}`, {
          method: "PATCH", signal, body: JSON.stringify({ expiresAt: values.expiresAt, note: values.note }),
        }) as { link: ShareLink };
        if (!signal.aborted) setLinks((current) => current.map((link) => link.id === result.link.id ? result.link : link));
      }}>
      <Typography>{shareResourceLabel(draft.resourceType)}</Typography>
      <Typography>Categories: {shareCategoriesLabel(draft)}</Typography>
    </ShareLinkDialog>}
    <GlassDialog open={!!deleting} onClose={() => { if (!busy) setDeleting(null); }} maxWidth="xs" fullWidth aria-labelledby="delete-link-title">
      <DialogHeader><Typography id="delete-link-title" variant="h6">Delete shared link?</Typography></DialogHeader>
      <DialogContentPanel>
        <Typography>The link will stop working for everyone. This cannot be undone.</Typography>
        {deleteError && <Alert severity="error">{deleteError}</Alert>}
      </DialogContentPanel>
      <DialogActionsBar>
        <SecondaryButton disabled={busy} onClick={() => setDeleting(null)}>Cancel</SecondaryButton>
        <GradientButton disabled={busy} onClick={async () => {
          if (!deleting || busy) return;
          const operation = new AbortController();
          pending.current = operation;
          setBusy(true);
          setDeleteError("");
          try {
            await request(`${base}?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE", signal: operation.signal });
            if (operation.signal.aborted) return;
            setLinks((current) => current.filter((link) => link.id !== deleting.id));
            setDeleting(null);
          } catch (cause) {
            if (!operation.signal.aborted) setDeleteError(cause instanceof Error ? cause.message : "Could not delete the shared link.");
          } finally {
            if (!operation.signal.aborted) setBusy(false);
          }
        }}>{busy ? "Deleting…" : "Delete permanently"}</GradientButton>
      </DialogActionsBar>
    </GlassDialog>
  </>;
}
