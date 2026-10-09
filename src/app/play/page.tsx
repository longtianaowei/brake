import type { Metadata } from "next";
import Game from "@/components/Game";

export const metadata: Metadata = {
  title: "测试中 · 刹车练习模拟器",
};

export default function PlayPage() {
  return (
    <main className="app">
      <Game />
    </main>
  );
}
