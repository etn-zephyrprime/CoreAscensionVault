import React from "react";

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 760);

  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isMobile;
}