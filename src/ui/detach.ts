export const detach =
  <Args extends ReadonlyArray<unknown>>(run: (...args: Args) => Promise<unknown>) =>
  (...args: Args): void => {
    void run(...args);
  };
