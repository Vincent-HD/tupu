import { Context, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";
import type { RpcClientError } from "effect/rpc/RpcClientError";
import { TupuRpcs } from "../api/rpc.ts";

// The better-auth session cookie authenticates every call: the API is served
// from the same origin as the app.
export class Api extends Context.Service<
  Api,
  RpcClient.FromGroup<typeof TupuRpcs, RpcClientError>
>()("tupu/services/Api") {
  static readonly layer = (url: string) =>
    Layer.effect(Api, RpcClient.make(TupuRpcs)).pipe(
      Layer.provide(RpcClient.layerProtocolHttp({ url })),
      Layer.provide(RpcSerialization.layerJson),
      Layer.provide(FetchHttpClient.layer),
    );
}
