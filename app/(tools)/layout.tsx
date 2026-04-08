import { Header } from "../components/Header";
import { Footer } from "../components/Footer";

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      {children}
      <Footer />
    </div>
  );
}
