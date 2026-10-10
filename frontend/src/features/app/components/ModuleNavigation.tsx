import { Fragment, useId, useRef, useState } from "react";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import { Box, Drawer, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import { moduleDestinations, type ModuleDestination } from "../modules";

export function ModuleNavigation({ activeId, onNavigate }: {
  activeId?: string;
  onNavigate: (destination: ModuleDestination) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const select = (destination: ModuleDestination) => {
    close();
    onNavigate(destination);
  };
  const entry = (destination: ModuleDestination, nested = false) => (
    <ListItemButton
      selected={activeId === destination.id}
      aria-current={activeId === destination.id ? "page" : undefined}
      onClick={() => select(destination)}
      sx={{ pl: nested ? 4 : 2 }}
    >
      <ListItemText primary={destination.label} />
    </ListItemButton>
  );

  return (
    <>
      <button ref={trigger} type="button" className="icon-button" aria-label="Open module menu"
        title="Open module menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => setOpen(true)}>
        <MenuIcon fontSize="small" />
      </button>
      <Drawer anchor="left" open={open} onClose={close} ModalProps={{ disableRestoreFocus: true }}
        slotProps={{ transition: { onExited: () => trigger.current?.focus() } }}>
        <Box id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
          sx={{ width: 320, maxWidth: "85vw", minHeight: "100%", bgcolor: "var(--surface)", color: "var(--text-primary)" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2 }}>
            <Typography id={`${id}-title`} variant="h6">Modules</Typography>
            <button type="button" className="icon-button" aria-label="Close module menu" onClick={close}>
              <CloseIcon fontSize="small" />
            </button>
          </Box>
          <nav aria-label="Modules">
            <List>
              {moduleDestinations.map((destination) => (
                <Fragment key={destination.id}>
                  {entry(destination)}
                  {destination.children?.length ? (
                    <List disablePadding aria-label={`${destination.label} sub-features`}>
                      {destination.children.map((child) => <Fragment key={child.id}>{entry(child, true)}</Fragment>)}
                    </List>
                  ) : null}
                </Fragment>
              ))}
            </List>
          </nav>
        </Box>
      </Drawer>
    </>
  );
}
