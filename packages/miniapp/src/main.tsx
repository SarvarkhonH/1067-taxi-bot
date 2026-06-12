import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initTelegram } from "./telegram";
import "./styles.css";
import "./design/tokens.css";

initTelegram();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
