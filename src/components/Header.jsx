import React from "react";
import { Wallet } from "lucide-react";

import NeonButton from "./NeonButton.jsx";
import { green, panel, border } from "../styles/theme.js";
import { PlanetZephyrosAE, CoreAscensionLogo } from "../appMedia/media.js";

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
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "stretch",
        justifyContent: "space-between",
        gap: isMobile ? 10 : 18,
        width: "100%",
        marginBottom: 10,
      }}
    >
      {/* RIGHT: Wallet */}
      <div
        style={{
          display: "flex",
          justifyContent: isMobile ? "center" : "flex-end",   // Centered on mobile
          alignItems: "center",
          width: isMobile ? "100%" : "auto",
          gap: 8,
          flexShrink: 0,
          order: isMobile ? 0 : 2,
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
              boxShadow: "0 0 12px rgba(0,0,0,0.45)",
            }}
          >
            <Wallet size={16} color={green} />
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
            <div style={{ width: 1, height: 16, background: "#333" }} />
            <button
              type="button"
              onClick={wallet.disconnectWallet}
              style={{
                background: "transparent",
                border: "none",
                color: "#ff6b6b",
                fontWeight: 700,
                fontSize: isMobile ? 11 : 13,
                cursor: "pointer",
                padding: "2px 6px",
              }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <NeonButton onClick={wallet.connectWallet}>
            Connect Wallet
          </NeonButton>
        )}
      </div>

      {/* LEFT: Logo + Branding */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: isMobile ? "center" : "flex-start",
          gap: isMobile ? 12 : 16,
          minWidth: 0,
          flex: 1,
          width: "100%",
          order: isMobile ? 1 : 1,
        }}
      >
        {/* Planet Zephyros Video Logo */}
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
                height: isMobile ? 82 : 112,
                width: "auto",
                display: "block",
                pointerEvents: "none",
                animation: "logoPulse 2.4s ease-in-out infinite",
                filter: "drop-shadow(0 0 14px rgba(0,255,140,0.18))",
                borderRadius: 12,
                objectFit: "contain",
              }}
            />
          </div>
        ) : null}

        {/* Text + CoreAscension Logo */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: isMobile ? "center" : "center",   // ← Key change
            textAlign: isMobile ? "center" : "center",
            minWidth: 0,
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

          {/* Core Ascension Logo */}
          <img
            src={CoreAscensionLogo}
            alt="Core Ascension"
            style={{
              margin: 0,
              width: isMobile ? "280px" : "520px",     // Better mobile width
              maxWidth: "100%",
              height: "auto",
              filter: "drop-shadow(0 0 18px rgba(0,255,140,0.45))",
              animation: "vaultPulse 2.2s infinite",
              objectFit: "contain",
            }}
          />

          {/* Guardians of Erevos Text */}
          <div
            style={{
              marginTop: 6,
              display: "flex",
              flexDirection: "column",
              gap: 1,
              maxWidth: isMobile ? "320px" : "540px",   // Constrain on mobile
              alignItems: isMobile ? "center" : "flex-start",
              textAlign: isMobile ? "center" : "left",
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
                  textShadow: "0 0 8px rgba(255,204,102,0.18)",
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
                fontSize: isMobile ? 11 : 13,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: 1,
                color: "#18bb1a",
                textShadow: "0 0 12px rgba(24,187,26,0.28)",
              }}
            >
              Rise Through Ascension
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}