export default function EcosystemCard({
  onClick,
  imageSrc,
  videoSrc,
  alt,
  label,
  isMobile,
  imageScale = 1,
}) {
  return (
    <div
      onClick={onClick}
      style={{
        width: "100%",
        height: "100%",
        cursor: "pointer",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: "#0f0f0f",
          border: "1px solid #333",
          borderRadius: 12,
          width: "100%",
          height: isMobile ? 92 : 96,
          padding: "10px 8px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          boxShadow: "0 0 8px rgba(0,0,0,0.5)",
          textAlign: "center",
          overflow: "hidden",
        }}
      >
{videoSrc ? (
  <video
    src={videoSrc}
    autoPlay
    loop
    muted
    playsInline
    style={{
      width: isMobile ? 42 : 56,
      height: isMobile ? 42 : 56,
      borderRadius: 6,
      objectFit: "cover",
      display: "block",
      transform: `scale(${imageScale || 1})`,
      maxWidth: "100%",
      maxHeight: "100%",
      flexShrink: 0,
    }}
  />
) : (
  <img
    src={imageSrc}
    alt={alt}
    style={{
      width: isMobile ? 42 : 56,
      height: isMobile ? 42 : 56,
      borderRadius: 6,
      objectFit: "contain",
      display: "block",
      transform: `scale(${imageScale || 1})`,
      maxWidth: "100%",
      maxHeight: "100%",
    }}
  />
)}
        <span
          style={{
            width: "100%",
            fontSize: isMobile ? 11 : 13,
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}