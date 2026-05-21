import { RegistryContext } from "@effect/atom-react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { registry } from "./atoms";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RegistryContext.Provider value={registry}>
      <App />
    </RegistryContext.Provider>
  </React.StrictMode>
);
