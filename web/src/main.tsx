import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { installToastLogging } from "./store/notificationStore";

installToastLogging();

// biome-ignore lint/style/noNonNullAssertion: standard React root mount
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="bottom-right" toastOptions={{ duration: 5000 }} />
    </BrowserRouter>
  </React.StrictMode>
);
