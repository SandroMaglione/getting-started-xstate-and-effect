import { RegistryContext } from "@effect/atom-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { registry } from "./domain";
import "./styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <RegistryContext.Provider value={registry}>
      <App />
    </RegistryContext.Provider>
  </StrictMode>
);
