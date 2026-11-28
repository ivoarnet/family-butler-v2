import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Box, Checkbox, FormControlLabel, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import {
  DialogActionsBar, DialogContentPanel, DialogHeader, FormField, GlassDialog, GradientButton, SecondaryButton,
} from "./GlassFormDialog";
import { DateField } from "./PickerFields";

export type ShareLinkValues = { expiresAt: string; note: string; categories: string[] };
export type ShareCategory = { value: string; label: string };
export const localShareDate = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export const afterLocalShareDay = (date: string) => {
  const end = new Date(`${date}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return Number.isFinite(end.getTime()) ? end.toISOString() : "";
};
const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Mount for each create/edit session so the one-time URL never survives closing. */
export function ShareLinkDialog({ initialValues, categoryOptions, children, information, editing = false, expiryLocked = false,
  title = "Create shared link", onSave, onClose }: {
  initialValues: ShareLinkValues;
  categoryOptions?: ShareCategory[];
  children?: ReactNode;
  information?: ReactNode;
  editing?: boolean;
  expiryLocked?: boolean;
  title?: string;
  onSave: (values: ShareLinkValues, signal: AbortSignal) => Promise<string | void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [date, setDate] = useState(() => localShareDate(new Date(Date.parse(initialValues.expiresAt) - 1).toISOString()));
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const validExpiry = Number.isFinite(Date.parse(values.expiresAt)) && (editing || Date.parse(values.expiresAt) > Date.now());
  const validCategories = !categoryOptions || values.categories.length > 0;
  return <GlassDialog open onClose={() => { if (!busy) onClose(); }} maxWidth="sm" fullWidth aria-labelledby="share-link-title">
    <Box component="form" onSubmit={async (event) => {
      event.preventDefault();
      if (busy || !validExpiry || !validCategories || values.note.length > 1000) return;
      const operation = new AbortController();
      controller.current = operation;
      setBusy(true);
      setError("");
      try {
        const createdUrl = await onSave(values, operation.signal);
        if (operation.signal.aborted) return;
        if (createdUrl) setUrl(createdUrl);
        else onClose();
      } catch (cause) {
        if (!operation.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not save the shared link. Please try again.");
      } finally {
        if (!operation.signal.aborted) setBusy(false);
      }
    }}>
      <DialogHeader>
        <Stack direction="row" sx={{ alignItems: "center" }} spacing={1}>
          <Typography id="share-link-title" variant="h6">{title}</Typography>
          <Tooltip describeChild enterTouchDelay={0} title={<Stack spacing={1}>
            {information}
            <Typography variant="body2">Anyone with this link can view the shared records until it expires or you delete it. Private notes are never shared.</Typography>
            <Typography variant="body2">Dates use your local timezone ({localTimeZone}). The selected day is included; expiry is the following local midnight (exclusive).</Typography>
            <Typography variant="body2">Manage links in Settings → Shared links. Save each URL when creating it: only a digest is stored, so it cannot be recovered. Create another link if you lose it.</Typography>
          </Stack>}>
            <IconButton type="button" size="small" aria-label="Sharing information" sx={{ color: "var(--text-secondary)" }}>
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </DialogHeader>
      <DialogContentPanel>
        {error && <Alert severity="error">{error}</Alert>}
        {url ? <>
          <Alert severity="success">Link created. Copy it now — it cannot be recovered later.</Alert>
          <FormField label="New shared link" value={url} slotProps={{ input: { readOnly: true } }} fullWidth
            onFocus={(event) => event.target.select()} />
          <SecondaryButton type="button" onClick={async () => {
            try { await navigator.clipboard.writeText(url); setCopied(true); setError(""); }
            catch { setError("Could not copy. Select and copy the link above."); }
          }}>{copied ? "Copied" : "Copy link"}</SecondaryButton>
        </> : <>
          {children}
          <Typography variant="body2">Anyone with the link can view it. Keep it private.</Typography>
          <DateField label="Expiry date" value={date} disabled={busy || expiryLocked} required error={!validExpiry}
            onChange={(nextDate) => {
              setDate(nextDate);
              setValues((current) => ({ ...current, expiresAt: afterLocalShareDay(nextDate) }));
            }} />
          {!validExpiry && <Typography variant="body2">{editing ? "Choose a valid expiry." : "Choose a future expiry."}</Typography>}
          {editing && Date.parse(values.expiresAt) <= Date.now() && <Typography variant="body2">This link is expired.</Typography>}
          {categoryOptions && <Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0 }}>
            <Typography component="legend" sx={{ fontWeight: 600 }}>Categories (choose at least one)</Typography>
            <Stack>{categoryOptions.map((category) => <FormControlLabel key={category.value} label={category.label}
              control={<Checkbox checked={values.categories.includes(category.value)} onChange={(_, checked) =>
                setValues((current) => ({ ...current, categories: checked
                  ? [...current.categories, category.value] : current.categories.filter((value) => value !== category.value) }))} />} />)}</Stack>
            {!validCategories && <Typography color="error">Select at least one category.</Typography>}
          </Box>}
          <FormField label="Private note (optional)" multiline minRows={2} fullWidth disabled={busy} value={values.note}
            helperText={`${values.note.length}/1000 · Only visible to you, never to link recipients.`}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
            onChange={(event) => setValues((current) => ({ ...current, note: event.target.value }))} />
        </>}
      </DialogContentPanel>
      <DialogActionsBar sx={{ flexWrap: "wrap", gap: 1 }}>
        <SecondaryButton type="button" disabled={busy} onClick={onClose}>{url ? "Done" : "Cancel"}</SecondaryButton>
        {!url && <GradientButton type="submit" disabled={busy || !validExpiry || !validCategories || values.note.length > 1000}>
          {busy ? "Saving…" : editing ? "Save shared link" : "Create link"}
        </GradientButton>}
      </DialogActionsBar>
    </Box>
  </GlassDialog>;
}
