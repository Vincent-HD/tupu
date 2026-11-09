import { useSyncExternalStore } from "react";

export type Route =
  | { readonly page: "home" }
  | { readonly page: "play"; readonly id: string }
  | { readonly page: "replay"; readonly id: string }
  | { readonly page: "custom" }
  | { readonly page: "archive" }
  | { readonly page: "stats" }
  | { readonly page: "leaderboard" }
  | { readonly page: "settings" }
  | { readonly page: "rules" }
  | { readonly page: "tutorial" };

const parse = (hash: string): Route => {
  const [page = "", id = ""] = hash.replace(/^#\/?/, "").split("/");
  switch (page) {
    case "play":
      return id ? { page: "play", id } : { page: "home" };
    case "replay":
      return id ? { page: "replay", id } : { page: "home" };
    case "custom":
    case "archive":
    case "stats":
    case "leaderboard":
    case "settings":
    case "rules":
    case "tutorial":
      return { page };
    default:
      return { page: "home" };
  }
};

const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};

export const useHash = () => useSyncExternalStore(subscribe, () => window.location.hash);

export const useRoute = () => parse(useHash());

export const href = (route: Route) => {
  switch (route.page) {
    case "home":
      return "#/";
    case "play":
    case "replay":
      return `#/${route.page}/${route.id}`;
    default:
      return `#/${route.page}`;
  }
};

export const navigate = (route: Route) => {
  window.location.hash = href(route);
  window.scrollTo({ top: 0 });
};
