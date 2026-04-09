import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// biome-ignore lint/style/noNonNullAssertion: standard React root mount
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
    </BrowserRouter>
  </React.StrictMode>
);
