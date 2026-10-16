import { useId, useRef, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { Box, SwipeableDrawer, List, ListItem, ListItemButton, Tooltip } from "@mui/material";
import { moduleDestinations, type ModuleDestination } from "../modules";

export function ModuleNavigation({ activeId, onNavigate }: {
  activeId?: string;
  onNavigate: (destination: ModuleDestination) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const activeModule = moduleDestinations.find((destination) => destination.id === activeId) ?? moduleDestinations[0];
  const ActiveModuleIcon = activeModule.icon;
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const select = (destination: ModuleDestination) => {
    close();
    onNavigate(destination);
  };

  return (
    <>
      <button ref={trigger} type="button" className="icon-button" aria-label="Open module menu"
        title={`${activeModule.label} — Open module menu`} aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => setOpen(true)}>
        <ActiveModuleIcon fontSize="medium" />
      </button>
      <SwipeableDrawer anchor="left" open={open} onOpen={() => setOpen(true)} onClose={close}
        ModalProps={{ disableRestoreFocus: true }}
        slotProps={{ transition: { onExited: () => trigger.current?.focus() } }}>
        <Box id={id} role="dialog" aria-modal="true" aria-label="Modules"
          sx={{ width: 80, maxWidth: "85vw", height: "100dvh", display: "grid", gridTemplateRows: "64px minmax(0, 1fr) 64px",
            bgcolor: "var(--surface)", color: "var(--text-primary)" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button type="button" className="icon-button" aria-label="Close module menu" onClick={close}>
              <CloseIcon fontSize="small" />
            </button>
          </Box>
          <Box component="nav" aria-label="Modules" sx={{ display: "flex", flexDirection: "column", overflowY: "auto" }}>
            <List sx={{ my: "auto", flexShrink: 0 }}>
              {moduleDestinations.map((destination) => (
                <ListItem key={destination.id} disablePadding>
                  <Tooltip title={destination.path ? destination.label : `${destination.label} — Coming soon`} placement="right" describeChild>
                    <Box component="span" sx={{ display: "flex", width: "100%" }}>
                      <ListItemButton
                        aria-label={destination.path ? destination.label : `${destination.label} Coming soon`}
                        disabled={!destination.path}
                        selected={activeId === destination.id}
                        aria-current={activeId === destination.id ? "page" : undefined}
                        onClick={() => select(destination)}
                        sx={{ minHeight: 56, justifyContent: "center" }}
                      >
                        <destination.icon />
                      </ListItemButton>
                    </Box>
                  </Tooltip>
                </ListItem>
              ))}
            </List>
          </Box>
        </Box>
      </SwipeableDrawer>
    </>
  );
}
