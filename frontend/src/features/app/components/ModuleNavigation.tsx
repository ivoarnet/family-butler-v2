import { useId, useRef, useState } from "react";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import { Box, SwipeableDrawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
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

  return (
    <>
      <button ref={trigger} type="button" className="icon-button" aria-label="Open module menu"
        title="Open module menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => setOpen(true)}>
        <MenuIcon fontSize="small" />
      </button>
      <SwipeableDrawer anchor="left" open={open} onOpen={() => setOpen(true)} onClose={close}
        ModalProps={{ disableRestoreFocus: true }}
        slotProps={{ transition: { onExited: () => trigger.current?.focus() } }}>
        <Box id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
          sx={{ width: 240, maxWidth: "85vw", minHeight: "100%", bgcolor: "var(--surface)", color: "var(--text-primary)" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2 }}>
            <Typography id={`${id}-title`} variant="h6">Modules</Typography>
            <button type="button" className="icon-button" aria-label="Close module menu" onClick={close}>
              <CloseIcon fontSize="small" />
            </button>
          </Box>
          <nav aria-label="Modules">
            <List>
              {moduleDestinations.map((destination) => (
                <ListItem key={destination.id} disablePadding>
                  <ListItemButton
                    disabled={!destination.path}
                    selected={activeId === destination.id}
                    aria-current={activeId === destination.id ? "page" : undefined}
                    onClick={() => select(destination)}
                    sx={{ py: 2 }}
                  >
                    <ListItemIcon sx={{ minWidth: 44, color: "inherit" }}>
                      {destination.id === "family-calendar" ? <CalendarMonthIcon /> : <TaskAltIcon />}
                    </ListItemIcon>
                    <ListItemText primary={destination.label} secondary={!destination.path ? "Coming soon" : undefined} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </nav>
        </Box>
      </SwipeableDrawer>
    </>
  );
}
