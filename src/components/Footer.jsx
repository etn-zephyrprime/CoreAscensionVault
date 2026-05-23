import React from "react";

export default function Footer() {
  return (
    <div
      style={{
        marginTop: 40,
        padding: "20px 12px",
        textAlign: "center",
        borderTop: "1px solid #222",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "#888",
          letterSpacing: 1,
          textTransform: "uppercase",
          textShadow:
            "0 0 8px rgba(24,187,26,0.4)",
        }}
      >
        © {new Date().getFullYear()}
        {" "}
        Planet Zephyros ×
        {" "}
        @ETN_Villain
      </div>

      <div
        style={{
          width: 60,
          height: 1,
          background:
            "linear-gradient(to right, transparent, #333, transparent)",
          margin: "4px auto",
        }}
      />

      <div
        style={{
          fontSize: 11,
          color: "#555",
          maxWidth: 560,
          marginInline: "auto",
          lineHeight: 1.4,
        }}
      >
        Blockchain staking
        involves risk. Users are
        responsible for wallets,
        transactions, approvals,
        and smart contract
        interactions.
      </div>
    </div>
  );
}