import { tileColors } from "../../domain/palette.ts";

const noise = (index: number, salt: number) => {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

export const Confetti = ({ pieces = 70 }: { pieces?: number }) => {
  const flakes = Array.from({ length: pieces }, (_, index) => ({
    left: noise(index, 1) * 100,
    delay: noise(index, 2) * 0.6,
    duration: 1.8 + noise(index, 3) * 1.6,
    drift: `${(noise(index, 4) - 0.5) * 40}vw`,
    spin: `${(noise(index, 5) - 0.5) * 1440}deg`,
    width: 8 + noise(index, 6) * 10,
    height: 10 + noise(index, 7) * 16,
    color: tileColors[index % tileColors.length]?.fill ?? "#ffd23f",
    round: noise(index, 8) > 0.75,
  }));
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      {flakes.map((flake, index) => (
        <span
          key={index}
          className={`absolute top-0 border-2 border-ink ${flake.round ? "rounded-full" : "rounded-[2px]"}`}
          style={{
            left: `${flake.left}%`,
            width: flake.width,
            height: flake.height,
            backgroundColor: flake.color,
            animation: `confetti-fall ${flake.duration}s cubic-bezier(0.25, 0.6, 0.4, 1) ${flake.delay}s both`,
            ["--drift" as string]: flake.drift,
            ["--spin" as string]: flake.spin,
          }}
        />
      ))}
    </div>
  );
};
