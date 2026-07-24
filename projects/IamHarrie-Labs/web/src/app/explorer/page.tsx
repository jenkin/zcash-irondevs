import type { Metadata } from "next";
import Explorer from "@/components/Explorer";

export const metadata: Metadata = {
  title: "The explorer: Heroes of Z10",
};

export default function ExplorerPage() {
  return <Explorer />;
}
