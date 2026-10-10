import { FormEvent } from "react";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Button,
  Switch,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, styled, useTheme } from "@mui/material/styles";
import {
  CalendarVisibilityToggle,
  DialogActionsBar,
  DialogContentPanel,
  DialogDescription,
  DialogHeader,
  FieldTitle,
  FormField,
  GlassDialog,
  GlassPanel,
  GradientButton,
  SecondaryButton,
} from "../../../shared/ui/GlassFormDialog";
import { ColorPicker } from "../../../shared/ui/ColorPicker";
import { MemberAvatarColor } from "../../../types/family";

const AvatarPanel = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(1.25),
  padding: theme.spacing(2),
  borderRadius: 14,
  border: `1px solid ${alpha("#b8c2ff", 0.16)}`,
  background: alpha("#151824", 0.5),
}));

const MemberDetailsSection = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(2),
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  [theme.breakpoints.down("sm")]: {
    gridTemplateColumns: "1fr",
  },
}));

const RelationshipField = styled(FormField)({});

export interface MemberDialogFormState {
  firstName: string;
  role: string;
  isChild: boolean;
  hatchParentingAway: boolean;
  schoolBuilding: string;
  schoolClass: string;
  avatarColor: MemberAvatarColor;
  visibleInCalendar: boolean;
}

interface MemberDialogProps {
  open: boolean;
  editing: boolean;
  colors: MemberAvatarColor[];
  formState: MemberDialogFormState;
  firstNameError: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFirstNameChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onIsChildChange: (value: boolean) => void;
  onHatchParentingAwayChange: (value: boolean) => void;
  onSchoolBuildingChange: (value: string) => void;
  onSchoolClassChange: (value: string) => void;
  onAvatarColorChange: (value: MemberAvatarColor) => void;
  onVisibleInCalendarChange: (value: boolean) => void;
}

export function MemberDialog({
  open,
  editing,
  colors,
  formState,
  firstNameError,
  onClose,
  onSubmit,
  onFirstNameChange,
  onRoleChange,
  onIsChildChange,
  onHatchParentingAwayChange,
  onSchoolBuildingChange,
  onSchoolClassChange,
  onAvatarColorChange,
  onVisibleInCalendarChange,
}: MemberDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const titleId = "member-dialog-title";
  const descriptionId = "member-dialog-description";

  return (
    <GlassDialog open={open} onClose={onClose} aria-labelledby={titleId} aria-describedby={descriptionId} fullScreen={fullScreen}>
      <Box component="form" onSubmit={onSubmit} noValidate>
        <DialogHeader>
          <Typography id={titleId} variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            {editing ? "Edit member" : "Add member"}
          </Typography>
          <Button
            type="button"
            onClick={onClose}
            aria-label="Close member dialog"
            sx={{ minWidth: "auto", color: "var(--text-primary)", borderRadius: "999px" }}
          >
            <CloseIcon fontSize="small" />
          </Button>
        </DialogHeader>

        <DialogContentPanel>
          <DialogDescription id={descriptionId} variant="body2">
            Add household member details, calendar visibility, and avatar preferences.
          </DialogDescription>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Member details</FieldTitle>
            <MemberDetailsSection>
              <FormField
                required
                label="First name"
                autoFocus
                slotProps={{ inputLabel: { shrink: true } }}
                value={formState.firstName}
                error={firstNameError}
                helperText={firstNameError ? "First name is required." : " "}
                onChange={(event) => onFirstNameChange(event.target.value)}
              />
              <RelationshipField
                label="Role / relationship"
                slotProps={{ inputLabel: { shrink: true } }}
                value={formState.role}
                helperText="Optional"
                onChange={(event) => onRoleChange(event.target.value)}
              />
              <Box sx={{ gridColumn: "1 / -1" }}>
                <CalendarVisibilityToggle
                  control={<Switch checked={formState.isChild}
                    onChange={(event) => onIsChildChange(event.target.checked)}
                    slotProps={{ input: { "aria-label": "Child" } }} />}
                  label="Child"
                />
                <Typography variant="body2" sx={{ color: "var(--dialog-muted)" }}>
                  Marks this member's calendar column as a child. Role and school details do not determine this.
                </Typography>
              </Box>
              {formState.isChild && <>
                <Box sx={{ gridColumn: "1 / -1" }}>
                  <CalendarVisibilityToggle
                    control={<Switch checked={formState.hatchParentingAway}
                      onChange={(event) => onHatchParentingAwayChange(event.target.checked)}
                      slotProps={{ input: { "aria-label": "Hatch background when parenting is not with a household member" } }} />}
                    label="Hatch background when parenting is not with a household member"
                  />
                  <Typography variant="body2" sx={{ color: "var(--dialog-muted)" }}>
                    Uses active parenting parties linked to household members. Unknown periods stay unshaded.
                  </Typography>
                </Box>
                <FormField label="School building" value={formState.schoolBuilding} helperText="Optional"
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 100 } }}
                  onChange={(event) => onSchoolBuildingChange(event.target.value)} />
                <FormField label="School class" value={formState.schoolClass} helperText="Optional"
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 50 } }}
                  onChange={(event) => onSchoolClassChange(event.target.value)} />
              </>}
              <ColorPicker label="Avatar color" value={formState.avatarColor} presets={colors}
                onChange={onAvatarColorChange} helperText="Choose a color or enter a hex value." />
              <Box sx={{ display: "grid", alignContent: "center" }}>
                <CalendarVisibilityToggle
                  control={
                    <Switch
                      checked={formState.visibleInCalendar}
                      onChange={(event) => onVisibleInCalendarChange(event.target.checked)}
                      slotProps={{ input: { "aria-label": "Visible in calendar" } }}
                    />
                  }
                  label={formState.visibleInCalendar ? "Visible in calendar" : "Hidden from calendar"}
                />
              </Box>
            </MemberDetailsSection>
          </GlassPanel>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Avatar / photo</FieldTitle>
            <AvatarPanel>
              <Typography variant="body2" sx={{ color: alpha("#f1f4ff", 0.92), fontWeight: 600 }}>
                Photo upload coming soon
              </Typography>
              <Typography variant="body2" sx={{ color: alpha("#d3d9ff", 0.72) }}>
                Avatar images will be available in an upcoming update.
              </Typography>
            </AvatarPanel>
          </GlassPanel>
        </DialogContentPanel>

        <DialogActionsBar>
          <SecondaryButton
            type="button"
            onClick={onClose}
            variant="outlined"
          >
            Cancel
          </SecondaryButton>
          <GradientButton type="submit" variant="contained" disableElevation>
            Save member
          </GradientButton>
        </DialogActionsBar>
      </Box>
    </GlassDialog>
  );
}
