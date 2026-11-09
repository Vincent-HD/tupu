import { useState } from "react";
import { Wordmark } from "./logo.tsx";
import { Button, Card } from "./ui.tsx";

export const ElsewhereScreen = ({
  moved,
  onUseHere,
}: {
  moved: boolean;
  onUseHere: () => Promise<void>;
}) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <Wordmark />
      <Card className="ruled w-full max-w-md p-6">
        <span className="tape -top-3 right-8" />
        <p className="font-display text-2xl font-extrabold">
          {moved ? "Tupu moved to another window" : "Tupu is open in another window"}
        </p>
        <p className="mt-2 leading-snug text-ink-soft">
          Your puzzles live in one database on this device, and only one window can use it at a
          time.
        </p>
        <Button
          tone="ink"
          size="lg"
          icon="play"
          className="mt-6 w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onUseHere();
          }}
        >
          {busy ? "Switching…" : "Use Tupu here"}
        </Button>
      </Card>
    </div>
  );
};
