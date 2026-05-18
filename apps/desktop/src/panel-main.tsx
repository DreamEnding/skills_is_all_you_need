import React from "react";
import ReactDOM from "react-dom/client";
import { ManagementPanel } from "./panel";
import "./panel/panel.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ManagementPanel />
  </React.StrictMode>,
);
