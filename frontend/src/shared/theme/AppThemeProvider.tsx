import { PropsWithChildren } from "react";
import { GlobalStyles, ThemeProvider } from "@mui/material";
import { appMuiTheme } from "./muiTheme";
import { themeTokenGlobalStyles } from "./tokens";

export function AppThemeProvider({ children }: PropsWithChildren) {
  return (
    <ThemeProvider theme={appMuiTheme}>
      <GlobalStyles styles={themeTokenGlobalStyles} />
      {children}
    </ThemeProvider>
  );
}
