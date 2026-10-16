import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CloseIcon from "@mui/icons-material/Close";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Box, SwipeableDrawer, List, ListItem, ListItemButton, Tooltip } from "@mui/material";
import { moduleDestinations, type ModuleDestination } from "../modules";

export function ModuleNavigation({ activeId, onNavigate }: {
  activeId?: string;
  onNavigate: (destination: ModuleDestination) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const notch = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const dragStart = useRef<number | null>(null);
  const id = useId();
  const openMenu = (source: HTMLButtonElement | null) => {
    returnFocus.current = source;
    setOpen(true);
  };
  const activeModule = moduleDestinations.find((destination) => destination.id === activeId) ?? moduleDestinations[0];
  const ActiveModuleIcon = activeModule.icon;
  const close = () => {
    setOpen(false);
    returnFocus.current?.focus();
  };
  const select = (destination: ModuleDestination) => {
    close();
    onNavigate(destination);
  };
  const moduleList = (
    <Box component="nav" aria-label="Modules" sx={{ display: "flex", flexDirection: "column", overflowY: "auto", height: "100%" }}>
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
                  sx={{ minHeight: 56, px: 0 }}
                >
                  <Box sx={{ width: 80, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                    <destination.icon />
                  </Box>
                </ListItemButton>
              </Box>
            </Tooltip>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <>
      <button ref={trigger} type="button" className="icon-button" aria-label="Open module menu"
        title={`${activeModule.label} — Open module menu`} aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => openMenu(trigger.current)}>
        <ActiveModuleIcon fontSize="medium" />
      </button>
      {createPortal(<Box component="button" ref={notch} type="button"
        aria-label="Open module menu from left edge" title="Click or drag right to open modules"
        aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => openMenu(notch.current)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragStart.current = event.clientX;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          if (dragStart.current !== null && event.clientX - dragStart.current >= 32) openMenu(notch.current);
          dragStart.current = null;
        }}
        onPointerCancel={() => { dragStart.current = null; }}
        sx={{ position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 1200,
          width: 24, height: 72, p: 0, display: "flex", alignItems: "center", justifyContent: "center",
          border: "1px solid var(--border)", borderLeft: 0, borderRadius: "0 16px 16px 0",
          bgcolor: "var(--menu-surface)", color: "var(--text-primary)", boxShadow: "var(--shadow)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", cursor: "grab", touchAction: "none",
          "&:focus-visible": { outline: "2px solid currentColor", outlineOffset: 2 } }}>
        <ChevronRightIcon fontSize="small" />
      </Box>, document.body)}
      <SwipeableDrawer anchor="left" open={open} onOpen={() => openMenu(notch.current)} onClose={close}
        disableSwipeToOpen={false} disableDiscovery
        ModalProps={{ disableRestoreFocus: true }}
        slotProps={{
          transition: { onExited: () => returnFocus.current?.focus() },
          paper: { sx: { background: "var(--menu-surface)", backgroundImage: "none", color: "var(--text-primary)",
            backdropFilter: "saturate(160%) blur(var(--menu-backdrop-blur))",
            WebkitBackdropFilter: "saturate(160%) blur(var(--menu-backdrop-blur))",
            borderRight: "1px solid var(--border)", borderRadius: "0 24px 24px 0", boxShadow: "var(--shadow)" } },
          backdrop: { sx: { bgcolor: "rgba(0,0,0,0.12)" } },
        }}>
        <Box id={id} role="dialog" aria-modal="true" aria-label="Modules"
          sx={{ width: 80, maxWidth: "85vw", height: "100dvh", display: "grid", gridTemplateRows: "64px minmax(0, 1fr) 64px",
            color: "var(--text-primary)" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button type="button" className="icon-button" aria-label="Close module menu" onClick={close}>
              <CloseIcon fontSize="small" />
            </button>
          </Box>
          {moduleList}
        </Box>
      </SwipeableDrawer>
    </>
  );
}
