import { createFileRoute } from "@tanstack/react-router";
import { CityPage } from "#/components/CityPage";

export const Route = createFileRoute("/")({ component: CityPage });
