import React from "react";
import { useCoreAscensionWallet } from "./hooks/useCoreAscensionWallet.jsx";
import { useVaultData } from "./hooks/useVaultData.js";
import { useIsMobile } from "./hooks/useIsMobile.js";

import Header from "./components/Header.jsx";
import VaultStats from "./components/VaultStats.jsx";
import VaultPosition from "./components/VaultPosition.jsx";
import NftHangar from "./components/NftHangar.jsx";
import VaultIntelligence from "./components/VaultIntelligence.jsx";
import Footer from "./components/Footer.jsx";
import EcosystemBlock from "./components/ecosystemBlock.jsx";
import HowToStake from "./components/HowToStake.jsx";

import {
  CoreClashLogo, AppBackground, PlanetZephyrosAE, ElectroSwap,
  VerdantKinBanner, ElectroneumLogo, AetherScionsBanner, VerdantQueenBanner, EtnClubLogo, EvgBanner, 
  TelegramLogo, XLogo, PlanetZephyrosLogo, AscensionsBackground
} from "./appMedia/media.js";

export default function App() {
  const isMobile = useIsMobile();
  const wallet = useCoreAscensionWallet();

  const { vaultData, reloadVaultData, loading } = useVaultData(
    wallet.provider,
    wallet.account
  );

  function handleEcosystemClick(_key, url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        padding: isMobile ? "16px 14px" : 40,
        width: "100%",
        maxWidth: 1100,
        margin: "0 auto",
        boxSizing: "border-box",
        minWidth: 0,
        color: "#fff",
      }}
    >
      <style>{`
        body { margin: 0; background: #000; font-family: Arial, Helvetica, sans-serif; }
        @keyframes vaultPulse {
          0%, 100% { text-shadow: 0 0 8px rgba(24,187,26,0.55), 0 0 18px rgba(24,187,26,0.25); }
          50% { text-shadow: 0 0 14px rgba(24,187,26,0.95), 0 0 30px rgba(24,187,26,0.45); }
        }
      `}</style>

{/* Background Radial Gradient Overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "#000",
          background:
            "radial-gradient(circle at 50% 15%, rgba(24,187,26,0.14), transparent 28%), radial-gradient(circle at 85% 20%, rgba(255,138,61,0.10), transparent 26%), #000",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

{/* ---------------- DEBUG WATERMARK ---------------- */}
<div
  style={{
    position: "fixed",
    inset: 0,
    backgroundColor: "#0a0a0a",
    backgroundImage: `url(${AscensionsBackground})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
    backgroundPosition: "center",
    opacity: 0.45,
    pointerEvents: "none",
    zIndex: -1,
  }}
/>

{/* Main Content */}
      <div style={{ position: "relative", zIndex: 1 }}>
<Header
  wallet={wallet}
  isMobile={isMobile}
  PlanetZephyrosAE={PlanetZephyrosAE}
/>

<div style={{ marginBottom: 12 }}>
  <EcosystemBlock
    isMobile={isMobile}
    handleEcosystemClick={handleEcosystemClick}
    CoreClashLogo={CoreClashLogo}
    ElectroSwap={ElectroSwap}
    TelegramLogo={TelegramLogo}
    XLogo={XLogo}
    PlanetZephyrosAE={PlanetZephyrosAE}
    EvgBanner={EvgBanner}
  />
</div>

        <HowToStake isMobile={isMobile} />

        <VaultStats vaultData={vaultData} isMobile={isMobile} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.05fr 0.95fr",
            gap: 12,
          }}
        >
          <NftHangar
            vaultData={vaultData}
            wallet={wallet}
            isMobile={isMobile}
            reloadVaultData={reloadVaultData}
          />
          <VaultPosition
            vaultData={vaultData}
            wallet={wallet}
            isMobile={isMobile}
            reloadVaultData={reloadVaultData}
            loading={loading}
          />
        </div>

<VaultIntelligence
  isMobile={isMobile}
  vaultData={vaultData}
/>

        <Footer />
      </div>
    </div>
  );
}