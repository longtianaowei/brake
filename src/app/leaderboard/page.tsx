import type { Metadata } from "next";
import Leaderboard from "@/components/Leaderboard";

export const metadata: Metadata = {
  title: "最速老司机 · 刹车练习模拟器",
};

export default function LeaderboardPage() {
  return (
    <main className="app">
      <Leaderboard />
    </main>
  );
}
