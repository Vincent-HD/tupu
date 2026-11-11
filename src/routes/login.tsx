import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "../ui/pages/login-page.tsx";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});
