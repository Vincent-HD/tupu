import { createFileRoute } from "@tanstack/react-router";
import { RulesPage } from "../ui/pages/rules-page.tsx";

export const Route = createFileRoute("/rules")({ component: RulesPage });
