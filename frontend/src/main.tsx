import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./App.css";
import { AppThemeProvider } from "./shared/theme/AppThemeProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppThemeProvider>
      <App />
    </AppThemeProvider>
  </React.StrictMode>
);
