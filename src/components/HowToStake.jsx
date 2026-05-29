import React, { useState } from "react";
import NeonButton from "./NeonButton.jsx";

export default function HowToStake({ isMobile }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger Button */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 12,
        }}
      >
        <NeonButton
          variant="green"
          onClick={() => setOpen(true)}
          style={{
            width: isMobile ? "100%" : "auto",
            minWidth: 220,
          }}
        >
          How To Stake
        </NeonButton>
      </div>

      {/* Modal */}
      {open && (
        <div
          onClick={() => setOpen(false)}
style={{
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.78)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: isMobile ? "flex-start" : "center",
  justifyContent: "center",
  overflowY: "auto",
  padding: isMobile ? "24px 14px" : 20,
  zIndex: 9999,
}}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 620,
              maxHeight: isMobile ? "calc(100vh - 48px)" : "90vh",
              overflowY: "auto",
              background: "#0f0f0f",
              border: "1px solid #2f2f2f",
              borderRadius: 18,
              padding: isMobile ? 18 : 26,
              boxShadow:
                "0 0 30px rgba(24,187,26,0.15)",
              position: "relative",
            }}
          >
            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 34,
                height: 34,
                borderRadius: 10,
                border: "1px solid #333",
                background: "#151515",
                color: "#fff",
                cursor: "pointer",
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              ×
            </button>

            {/* Title */}
            <div
              style={{
                fontSize: isMobile ? 24 : 30,
                fontWeight: 900,
                color: "#18bb1a",
                marginBottom: 10,
                textShadow:
                  "0 0 12px rgba(24,187,26,0.45)",
              }}
            >
              Ascension Protocol
            </div>

            <div
              style={{
                fontSize: 14,
                color: "#9a9a9a",
                lineHeight: 1.7,
                marginBottom: 22,
              }}
            >
              Stake CORE and bind eligible NFTs to
              strengthen your vault position and
              earn emissions from the Ascension
              reward pool.
            </div>

            {/* Steps */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {[
                {
                  title: "1. Connect Wallet",
                  text:
                    "Connect a wallet holding CORE and eligible Guardians of Erevos NFTs.",
                },
                {
                  title: "2. Stake CORE",
                  text:
                    "Deposit up to 10,000 CORE into the vault to begin earning emissions.",
                },
                {
                  title: "3. Bind NFTs",
                  text:
                    "Stake up to 4 eligible NFTs to increase your vault multiplier.",
                },
                {
                  title: "4. Earn Emissions",
                  text:
                    "Rewards accumulate over time based on your vault strength.",
                },
                {
                  title: "5. Withdraw Strategically",
                  text:
                    "Early withdrawals may trigger penalties and CORE burns.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  style={{
                    background: "#121212",
                    border: "1px solid #262626",
                    borderRadius: 14,
                    padding: "14px 16px",
                  }}
                >
                  <div
                    style={{
                      color: "#fff",
                      fontWeight: 800,
                      marginBottom: 5,
                      fontSize: 15,
                    }}
                  >
                    {item.title}
                  </div>

                  <div
                    style={{
                      color: "#9a9a9a",
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {item.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Note */}
            <div
              style={{
                marginTop: 22,
                fontSize: 12,
                color: "#666",
                lineHeight: 1.5,
                textAlign: "center",
              }}
            >
              Planet Zephyros • CORE Ascension •
              Vault emissions are block-based and
              subject to smart contract risk.
            </div>
          </div>
        </div>
      )}
    </>
  );
}