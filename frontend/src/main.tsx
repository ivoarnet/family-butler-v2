import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./App.css";
import { AppThemeProvider } from "./shared/theme/AppThemeProvider";
import { SharedLinkPage } from "./features/sharing/SharedLinkPage";

const isSharedLink = /^\/shared\/?$/.test(window.location.pathname);
// Keep the fragment so reloading a shared link still works; fragments are never sent in HTTP requests.
const sharedToken = isSharedLink ? window.location.hash.slice(1) : "";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppThemeProvider>
      {isSharedLink ? <SharedLinkPage token={sharedToken} /> : <App />}
    </AppThemeProvider>
  </React.StrictMode>
);
