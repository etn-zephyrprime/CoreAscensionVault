import React from "react";
import { Wallet } from "lucide-react";

import NeonButton from "./NeonButton.jsx";
import { green, panel, border } from "../styles/theme.js";
import { PlanetZephyrosAE } from "../appMedia/media.js";

function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function Header({
  wallet,
  isMobile,
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        justifyContent: "space-between",
        gap: isMobile ? 12 : 24,
        width: "100%",
        marginBottom: 16,
        flexWrap: isMobile ? "wrap" : "nowrap",
      }}
    >
      {/* LEFT: Logo + Branding */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: isMobile ? 10 : 16,
          minWidth: 0,
          flex: 1,
        }}
      >
        {/* Logo */}
{PlanetZephyrosAE ? (
  <div
    style={{
      height: "100%",
      display: "flex",
      alignItems: "center",
      flexShrink: 0,
    }}
  >
    <video
      src={PlanetZephyrosAE}
      autoPlay
      loop
      muted
      playsInline
      style={{
        height: isMobile ? 96 : 112,
        width: "auto",
        display: "block",
        pointerEvents: "none",
        animation:
          "logoPulse 2.4s ease-in-out infinite",
        filter:
          "drop-shadow(0 0 14px rgba(0,255,140,0.18))",
        borderRadius: 12,
        objectFit: "contain",
      }}
    />
  </div>
) : (
  <div
    style={{
      width: isMobile ? 90 : 140,
      height: isMobile ? 90 : 140,
      borderRadius: 16,
      background:
        "linear-gradient(145deg,#111,#181818)",
      border: `1px solid ${border}`,
      boxShadow:
        "0 0 18px rgba(0,255,140,0.12)",
    }}
  />
)}
        {/* Text */}
<div
  style={{
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  }}
>
            <div
            style={{
              fontSize: isMobile ? 10 : 12,
              color: "#7c7c7c",
              textTransform: "uppercase",
              letterSpacing: 2,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Planet Zephyros
          </div>

          <h1
            style={{
              margin: 0,
              fontWeight: 900,
              fontSize: isMobile ? 28 : 42,
              lineHeight: 0.95,
              letterSpacing: isMobile ? 1 : 2,
              textTransform: "uppercase",
              color: green,
              textShadow:
                "0 0 18px rgba(0,255,140,0.35)",
              animation:
                "vaultPulse 2.2s infinite",
            }}
          >
            CORE ASCENSION
          </h1>

<div
  style={{
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    maxWidth: 540,
  }}
>
  <div
    style={{
      fontSize: isMobile ? 11 : 14,
      color: "#cfcfcf",
      lineHeight: 1.35,
      fontWeight: 500,
      letterSpacing: 0.2,
    }}
  >
    Stake <span style={{ color: "#18bb1a", fontWeight: 800 }}>CORE</span> with{" "}
    <span
      style={{
        color: "#ffcc66",
        fontWeight: 700,
        textShadow:
          "0 0 8px rgba(255,204,102,0.18)",
      }}
    >
      Guardians of Erevos
    </span>
    .
  </div>

  <div
    style={{
      fontSize: isMobile ? 11 : 14,
      color: "#aaa",
      lineHeight: 1.35,
      letterSpacing: 0.3,
    }}
  >
    Absorb the emissions of Zephyros.
  </div>

  <div
    style={{
      fontSize: isMobile ? 12 : 15,
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: 1.4,
      color: "#18bb1a",
      textShadow:
        "0 0 12px rgba(24,187,26,0.28)",
    }}
  >
    Rise Through Ascension
  </div>
</div>
        </div>
      </div>

      {/* RIGHT: Wallet */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
          flexShrink: 0,
        }}
      >
        {wallet.account ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: panel,
              padding: "8px 14px",
              borderRadius: 14,
              border: `1px solid ${border}`,
              boxShadow:
                "0 0 12px rgba(0,0,0,0.45)",
            }}
          >
            <Wallet
              size={16}
              color={green}
            />

            <span
              style={{
                fontSize: isMobile ? 12 : 14,
                fontWeight: 700,
                color: "#fff",
                letterSpacing: 0.4,
              }}
            >
              {shortAddress(wallet.account)}
            </span>

            <div
              style={{
                width: 1,
                height: 16,
                background: "#333",
              }}
            />

            <button
              type="button"
              onClick={
                wallet.disconnectWallet
              }
              style={{
                background: "transparent",
                border: "none",
                color: "#ff6b6b",
                fontWeight: 700,
                fontSize: isMobile
                  ? 11
                  : 13,
                cursor: "pointer",
                padding: "2px 6px",
              }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <NeonButton
            onClick={
              wallet.connectWallet
            }
          >
            Connect Wallet
          </NeonButton>
        )}
      </div>
    </div>
  );
}