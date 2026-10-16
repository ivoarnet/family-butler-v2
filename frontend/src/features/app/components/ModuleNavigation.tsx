import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CloseIcon from "@mui/icons-material/Close";
import { Box, Drawer, SwipeableDrawer, List, ListItem, ListItemButton, Tooltip, useMediaQuery } from "@mui/material";
import { moduleDestinations, type ModuleDestination } from "../modules";

export function ModuleNavigation({ activeId, onNavigate }: {
  activeId?: string;
  onNavigate: (destination: ModuleDestination) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const desktop = useMediaQuery("(min-width:1200px)");
  useEffect(() => {
    setOpen(false);
  }, [desktop]);
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
                  {desktop ? <Box className="module-name" component="span" sx={{ display: "none", whiteSpace: "nowrap" }}>
                    {destination.label}
                    {!destination.path ? <Box component="small" sx={{ display: "block" }}>Coming soon</Box> : null}
                  </Box> : null}
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
        title={`${activeModule.label} — Open module menu`} aria-expanded={desktop || open} aria-controls={desktop || open ? id : undefined}
        onClick={() => desktop ? document.getElementById(id)?.querySelector<HTMLElement>('[aria-current="page"], [role="button"]:not([aria-disabled="true"])')?.focus() : setOpen(true)}>
        <ActiveModuleIcon fontSize="medium" />
      </button>
      {desktop ? <><Box component="span" className="module-navigation-desktop" sx={{ display: "none" }} />
        {createPortal(<Drawer variant="permanent"
        sx={{ position: "absolute", width: 0,
          "& .MuiDrawer-paper": { width: 80, overflowX: "hidden", bgcolor: "var(--surface)", color: "var(--text-primary)",
            "&:hover, &:focus-within": { width: 240, "& .module-name": { display: "block" } },
            "@media (min-width:1600px)": { width: 240, "& .module-name": { display: "block" } } } }}>
        <Box id={id} sx={{ height: "100dvh" }}>{moduleList}</Box>
      </Drawer>, document.body)}</> : <SwipeableDrawer anchor="left" open={open} onOpen={() => setOpen(true)} onClose={close}
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
          {moduleList}
        </Box>
      </SwipeableDrawer>}
    </>
  );
}
