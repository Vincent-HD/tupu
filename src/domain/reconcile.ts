import type { GameStatus } from "../db/schema.ts";

export interface GameVersion {
  readonly status: GameStatus;
  readonly updatedAt: string;
}

const statusRank = (status: GameStatus) => (status === "solved" ? 1 : 0);

// A solved game beats an unfinished one, then the latest write wins. On a tie
// the version already stored on the server is kept.
export const replacesServerVersion = (input: {
  readonly server: GameVersion;
  readonly client: GameVersion;
}) => {
  const rank = statusRank(input.client.status) - statusRank(input.server.status);
  if (rank !== 0) return rank > 0;
  return input.client.updatedAt > input.server.updatedAt;
};
