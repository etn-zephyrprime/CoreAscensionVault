import { useEffect, useState } from "react";
import { ethers } from "ethers";

const DRIP_ADDRESS = "0x219341313B6142343C3003f3e2CAec96779cf8ED";

const ABI = [
  "function nextDripIn() view returns (uint256)"
];

export function useDripCountdown(provider) {
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!provider) return;

    let timer;

    async function load() {
      try {
        const contract = new ethers.Contract(
          DRIP_ADDRESS,
          ABI,
          provider
        );

        const next = await contract.nextDripIn();

        setSecondsLeft(Number(next));
      } catch (err) {
        console.error("Drip countdown failed:", err);
      }
    }

    load();

    timer = setInterval(() => {
      setSecondsLeft((prev) =>
        prev > 0 ? prev - 1 : 0
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [provider]);

  return secondsLeft;
}