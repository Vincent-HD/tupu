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
    const database = yield* Cloudflare.D1.Database("Database");
    const authSecret = yield* Config.Redacted("BETTER_AUTH_SECRET");
    // Sign-in codes come from MAIL_FROM. With a custom domain it defaults to an
    // address there, and the stack onboards that domain to Email Sending.
    // Without one, MAIL_FROM must be on a domain onboarded in the dashboard.
    const mailFrom = yield* Option.match(domain, {
      onNone: () => Config.String("MAIL_FROM"),
      onSome: (name) => Config.String("MAIL_FROM").pipe(Config.withDefault(`noreply@${name}`)),
    });
    if (Option.isSome(domain)) {
      const mailDomain = mailFrom.slice(mailFrom.lastIndexOf("@") + 1);
      const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
      const zoneId = yield* Cloudflare.Zone.resolveZoneId({
        accountId,
        zone: undefined,
        hostname: mailDomain,
      }).pipe(Effect.orDie);
      yield* Cloudflare.Email.SendingSubdomain("MailDomain", { zoneId, name: mailDomain });
    }
    const email = yield* Cloudflare.Email.SendEmail("Email");
    const site = yield* Cloudflare.Website.StaticSite("Website", {
      command: "pnpm build",
      outdir: "dist",
      main: "./server/worker.ts",
      env: { DB: database, BETTER_AUTH_SECRET: authSecret, EMAIL: email, MAIL_FROM: mailFrom },
      compatibility: { flags: ["nodejs_compat"] },
      memo: {
        include: [
          "src/**",
          "server/**",
          "public/**",
          "index.html",
          "vite.config.ts",
          "package.json",
          "pnpm-lock.yaml",
        ],
      },
      assets: {
        notFoundHandling: "single-page-application",
        runWorkerFirst: ["/rpc", "/api/auth/*", "/healthz"],
      },
      domain: Option.getOrNull(domain),
      dev: { command: "pnpm dev" },
    });
    return { url: site.url };
  }),
);
