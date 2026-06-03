import React from "react";
import Panel from "./Panel.jsx";
import { green, muted } from "../styles/theme.js";

function StatBox({ icon, label, value, color = green, isMobile = false }) {
  return (
    <Panel style={{ minWidth: 0 }}>
      <div
style={{
  display: "flex",
  flexDirection: "column",           // Changed to column for all (cleaner)
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  textAlign: "center",
  padding: isMobile ? "18px 12px" : "22px 16px",
  minHeight: "118px",                // Important: gives room for 2 lines
  boxSizing: "border-box",
}}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            border: "1px solid #2f2f2f",
            background: "#151515",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            boxShadow: "0 0 8px rgba(0,0,0,0.35)",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              color: muted,
              textTransform: "uppercase",
              letterSpacing: 1.1,
              marginBottom: 4,
            }}
          >
            {label}
          </div>

          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              color: "#fff",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default StatBox;