import "./globals.css";

export const metadata = {
  title: "Rudhra AI — Intelligent Research Assistant",
  description:
    "Rudhra OS: An advanced AI research assistant with web search, image generation, GitHub tools, calendar management, and more.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
