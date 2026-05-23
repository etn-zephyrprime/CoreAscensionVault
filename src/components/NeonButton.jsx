import React from "react";
import { green, greenGlow } from "../styles/theme.js";

function NeonButton({ children, onClick, variant = "green", disabled = false, style = {} }) {
  const styles = {
    green: {
      background: green,
      color: "#000",
      boxShadow: `0 0 12px ${greenGlow}`,
      border: "none",
    },
    orange: {
      background: "linear-gradient(90deg, #ff7a00, #ff3d00)",
      color: "#fff",
      boxShadow: "0 0 12px rgba(255,122,0,0.25)",
      border: "none",
    },
    blue: {
      background: "linear-gradient(90deg, #1affb3, #00c6ff)",
      color: "#111",
      boxShadow: "0 0 12px rgba(0,198,255,0.25)",
      border: "none",
    },
    dark: {
      background: "#151515",
      color: green,
      boxShadow: "0 0 8px rgba(0,0,0,0.35)",
      border: "1px solid #2f2f2f",
    },
    danger: {
      background: "rgba(255,77,77,0.14)",
      color: "#ff6b6b",
      boxShadow: "0 0 10px rgba(255,77,77,0.12)",
      border: "1px solid rgba(255,77,77,0.35)",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "12px 16px",
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "all 0.2s ease",
        whiteSpace: "nowrap",
        ...styles[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && variant === "dark") {
          e.currentTarget.style.borderColor = green;
          e.currentTarget.style.boxShadow = `0 0 12px ${greenGlow}`;
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && variant === "dark") {
          e.currentTarget.style.borderColor = "#2f2f2f";
          e.currentTarget.style.boxShadow = "0 0 8px rgba(0,0,0,0.35)";
        }
      }}
    >
      {children}
    </button>
  );
}

export default NeonButton;