import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Predicate, Schema } from "effect";
import { useState, type ReactNode } from "react";
import { DisplayName, Email } from "../../api/rpc.ts";
import { Icon } from "../components/icons.tsx";
import { Button, Card } from "../components/ui.tsx";
import { accountQuery, actions } from "../queries.ts";

const authMessages: Readonly<Record<string, string>> = {
  INVALID_OTP: "That code is not right. Check the email and try again.",
  OTP_EXPIRED: "That code expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "Too many tries with that code. Send a new one.",
  AUTH_CANCELLED: "No passkey was used. Try again, or sign in with an email code.",
  ERROR_CEREMONY_ABORTED: "The passkey prompt was closed. Try again when you are ready.",
  AUTHENTICATION_FAILED: "That passkey is not linked to a Tupu account. Use an email code.",
  PASSKEY_NOT_FOUND: "That passkey is not linked to a Tupu account. Use an email code.",
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: "This device already has a passkey for Tupu.",
};

const failureMessage = (error: unknown) => {
  if (Predicate.isTagged(error, "AuthFailed") && Predicate.hasProperty(error, "code")) {
    const known = authMessages[String(error.code)];
    if (known) return known;
    const message = Predicate.hasProperty(error, "message") ? String(error.message) : "";
    // Browser passkey errors arrive with their own codes but this one message.
    if (message === "Auth cancelled") return authMessages["AUTH_CANCELLED"];
    if (message !== "") return message;
  }
  if (Predicate.isTagged(error, "RpcClientError"))
    return "Tupu can't reach its server. Signing in needs a connection; playing doesn't.";
  return "Something went wrong. Try again.";
};

const inputClass =
  "h-12 w-full rounded-xl border-[2.5px] border-ink bg-card px-3 font-bold shadow-hard-sm outline-none focus-visible:ring-4 focus-visible:ring-marker";

const nameFromEmail = (email: string) => (email.split("@")[0] ?? "").slice(0, 24);

const Failure = (props: { readonly error: unknown }) =>
  props.error ? (
    <p role="alert" className="mt-4 flex items-start gap-2 font-bold text-danger">
      <Icon name="x" className="mt-1 shrink-0" /> {failureMessage(props.error)}
    </p>
  ) : null;

const Heading = (props: {
  readonly eyebrow: string;
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <>
    <p className="text-sm font-bold tracking-[0.2em] text-ink-soft uppercase">{props.eyebrow}</p>
    <h1 className="mt-1 font-display text-3xl font-extrabold">{props.title}</h1>
    <p className="mt-2 text-sm text-ink-soft">{props.children}</p>
  </>
);

const TextLink = (props: { readonly onClick: () => void; readonly children: ReactNode }) => (
  <button
    type="button"
    className="mt-3 w-full cursor-pointer text-sm font-bold underline"
    onClick={props.onClick}
  >
    {props.children}
  </button>
);

type Step =
  | { readonly kind: "email" }
  | { readonly kind: "code"; readonly email: string }
  | { readonly kind: "passkey" };

export const LoginPage = () => {
  const navigate = useNavigate();
  const account = useQuery(accountQuery);
  const [step, setStep] = useState<Step>({ kind: "email" });
  const queryClient = useQueryClient();
  // The root route checks the stored account, so it must be fresh before leaving.
  const done = () =>
    void queryClient
      .invalidateQueries({ queryKey: accountQuery.queryKey })
      .then(() => navigate({ to: "/" }));

  // A brand-new account picks its name first, even after a reload.
  if (account.data && account.data.name === "")
    return (
      <Shell>
        <NameStep email={account.data.email} onDone={() => setStep({ kind: "passkey" })} />
      </Shell>
    );

  return (
    <Shell guest={account.data === null && step.kind === "email"}>
      {step.kind === "email" && (
        <EmailStep onSent={(email) => setStep({ kind: "code", email })} onSignedIn={done} />
      )}
      {step.kind === "code" && (
        <CodeStep
          email={step.email}
          onSignedIn={(signedIn) => {
            if (signedIn.name !== "") done();
          }}
          onBack={() => setStep({ kind: "email" })}
        />
      )}
      {step.kind === "passkey" && <PasskeyStep onDone={done} />}
    </Shell>
  );
};

const Shell = (props: { readonly children: ReactNode; readonly guest?: boolean }) => (
  <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 pt-6">
    <Card className="ruled w-full p-6" tilt="left">
      <span className="tape -top-3 left-10" />
      {props.children}
    </Card>
    {props.guest && (
      <Link to="/" className="font-bold underline">
        Play without an account
      </Link>
    )}
    <p className="px-4 text-center text-sm text-ink-soft">
      No password. Sign in with a code sent to your email, or with a passkey: your fingerprint, face
      or screen lock.
    </p>
  </div>
);

const EmailStep = (props: {
  readonly onSent: (email: string) => void;
  readonly onSignedIn: () => void;
}) => {
  const send = useMutation({
    mutationFn: actions.sendCode,
    onSuccess: (_, email) => props.onSent(email),
  });
  const passkey = useMutation({
    mutationFn: actions.signInWithPasskey,
    onSuccess: props.onSignedIn,
  });
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: Schema.toStandardSchemaV1(Schema.Struct({ email: Email })) },
    onSubmit: ({ value }) => {
      passkey.reset();
      send.mutate(value.email.trim().toLowerCase());
    },
  });
  const busy = send.isPending || passkey.isPending;
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Heading eyebrow="Welcome" title="Sign in">
          Sync your games across devices and join the leaderboards. Games already played on this
          device move into your account.
        </Heading>
        <form.Field name="email">
          {(field) => (
            <div className="mt-4">
              <input
                type="email"
                value={field.state.value}
                autoFocus
                autoComplete="email"
                placeholder="you@example.com"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-label="Email"
                className={inputClass}
              />
              {field.state.meta.errors[0] && (
                <p className="mt-1 text-sm font-bold text-danger">
                  {field.state.meta.errors[0].message}
                </p>
              )}
            </div>
          )}
        </form.Field>
        <Button
          type="submit"
          tone="ink"
          size="lg"
          icon="mail"
          className="mt-5 w-full"
          disabled={busy}
        >
          {send.isPending ? "Sending…" : "Email me a code"}
        </Button>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs font-bold tracking-[0.2em] text-ink-soft uppercase">
        <span className="h-0.5 flex-1 bg-ink/20" /> or <span className="h-0.5 flex-1 bg-ink/20" />
      </div>
      <Button
        tone="paper"
        size="lg"
        icon="key"
        className="w-full"
        disabled={busy}
        onClick={() => {
          send.reset();
          passkey.mutate();
        }}
      >
        {passkey.isPending ? "Waiting for your passkey…" : "Sign in with a passkey"}
      </Button>
      <Failure error={send.error ?? passkey.error} />
    </>
  );
};

const CodeStep = (props: {
  readonly email: string;
  readonly onSignedIn: (account: { readonly name: string }) => void;
  readonly onBack: () => void;
}) => {
  const verify = useMutation({ mutationFn: actions.verifyCode, onSuccess: props.onSignedIn });
  const resend = useMutation({ mutationFn: actions.sendCode });
  const form = useForm({
    defaultValues: { code: "" },
    onSubmit: ({ value }) => verify.mutate({ email: props.email, code: value.code.trim() }),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <Heading eyebrow="Check your email" title="Enter your code">
        We sent a 6-digit code to <span className="font-bold text-ink">{props.email}</span>. It
        works for 10 minutes.
      </Heading>
      <form.Field name="code">
        {(field) => (
          <input
            value={field.state.value}
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="123456"
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value.replace(/\D/g, ""))}
            aria-label="Code"
            className={`${inputClass} mt-4 text-center text-2xl tracking-[0.5em]`}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.code.length === 6}>
        {(complete) => (
          <Button
            type="submit"
            tone="ink"
            size="lg"
            icon="check"
            className="mt-5 w-full"
            disabled={!complete || verify.isPending}
          >
            {verify.isPending ? "Checking…" : "Sign in"}
          </Button>
        )}
      </form.Subscribe>
      <TextLink
        onClick={() => {
          verify.reset();
          resend.mutate(props.email);
        }}
      >
        {resend.isPending ? "Sending…" : resend.isSuccess ? "New code sent" : "Send a new code"}
      </TextLink>
      <TextLink onClick={props.onBack}>Use another email</TextLink>
      <Failure error={verify.error ?? resend.error} />
    </form>
  );
};

const NameStep = (props: { readonly email: string; readonly onDone: () => void }) => {
  const rename = useMutation({ mutationFn: actions.rename, onSuccess: props.onDone });
  const form = useForm({
    defaultValues: { name: nameFromEmail(props.email) },
    validators: { onChange: Schema.toStandardSchemaV1(Schema.Struct({ name: DisplayName })) },
    onSubmit: ({ value }) => rename.mutate(value.name.trim()),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <Heading eyebrow="New here" title="Pick a name">
        It shows on the leaderboard. You can change it later in Settings.
      </Heading>
      <form.Field name="name">
        {(field) => (
          <div className="mt-4">
            <input
              value={field.state.value}
              maxLength={24}
              autoFocus
              autoComplete="nickname"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-label="Display name"
              className={inputClass}
            />
            {field.state.meta.errors[0] && (
              <p className="mt-1 text-sm font-bold text-danger">
                {field.state.meta.errors[0].message}
              </p>
            )}
          </div>
        )}
      </form.Field>
      <Button
        type="submit"
        tone="ink"
        size="lg"
        icon="check"
        className="mt-5 w-full"
        disabled={rename.isPending}
      >
        {rename.isPending ? "Saving…" : "Continue"}
      </Button>
      <Failure error={rename.error} />
    </form>
  );
};

const PasskeyStep = (props: { readonly onDone: () => void }) => {
  const add = useMutation({ mutationFn: actions.addPasskey, onSuccess: props.onDone });
  return (
    <>
      <Heading eyebrow="One more thing" title="Save a passkey?">
        Next time, sign in with your fingerprint, face or screen lock instead of waiting for an
        email.
      </Heading>
      <Button
        tone="ink"
        size="lg"
        icon="key"
        className="mt-5 w-full"
        disabled={add.isPending}
        onClick={() => add.mutate()}
      >
        {add.isPending ? "Waiting for your passkey…" : "Save a passkey"}
      </Button>
      <TextLink onClick={props.onDone}>Not now</TextLink>
      <Failure error={add.error} />
    </>
  );
};
