import { createFileRoute } from "@tanstack/react-router";
import { CustomPage } from "../ui/pages/custom-page.tsx";

export const Route = createFileRoute("/custom")({ component: CustomPage });
