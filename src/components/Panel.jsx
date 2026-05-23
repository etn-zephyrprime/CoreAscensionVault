import React from "react";
import { panel, border } from "../styles/theme.js";

export default function Panel({ children, style = {} }) {
  return (
    <div
      style={{
        background: panel,
        border: `1px solid ${border}`,
        borderRadius: 14,
        padding: 16,
        boxShadow: "0 0 12px rgba(24,187,26,0.12)",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}