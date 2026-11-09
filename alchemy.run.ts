import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

export default Alchemy.Stack(
  "Tupu",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const domain = yield* Config.option(Config.String("TUPU_DOMAIN"));
    const site = yield* Cloudflare.Website.StaticSite("Website", {
      command: "pnpm build",
      outdir: "dist",
      memo: {
        include: [
          "src/**",
          "public/**",
          "index.html",
          "vite.config.ts",
          "package.json",
          "pnpm-lock.yaml",
        ],
      },
      assets: {
        notFoundHandling: "single-page-application",
      },
      domain: Option.getOrNull(domain),
      dev: { command: "pnpm dev" },
    });
    return { url: site.url };
  }),
);
