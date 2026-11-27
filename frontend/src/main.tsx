import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./App.css";
import { AppThemeProvider } from "./shared/theme/AppThemeProvider";
import { SharedLinkPage } from "./features/sharing/SharedLinkPage";

const isSharedLink = /^\/shared\/?$/.test(window.location.pathname);
// Capture once outside StrictMode, before removing the bearer token from browser history.
const sharedToken = isSharedLink ? window.location.hash.slice(1) : "";
if (isSharedLink) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppThemeProvider>
      {isSharedLink ? <SharedLinkPage token={sharedToken} /> : <App />}
    </AppThemeProvider>
  </React.StrictMode>
);
