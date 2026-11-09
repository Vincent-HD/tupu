export const hintPenaltyMs = 30_000;
export const checkPenaltyMs = 10_000;

export const scoreOf = (result: {
  readonly elapsedMs: number;
  readonly hints: number;
  readonly checks: number;
}) => result.elapsedMs + result.hints * hintPenaltyMs + result.checks * checkPenaltyMs;

export const isPerfect = (result: { readonly hints: number; readonly checks: number }) =>
  result.hints === 0 && result.checks === 0;

export const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const padded = `${String(minutes).padStart(hours > 0 ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${padded}` : padded;
};
