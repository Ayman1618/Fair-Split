import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fair Split - Intelligent & Deterministic Receipt Splitter',
  description: 'AI-interpreted, code-calculated fair bill splitter with auditable reconciliation and settle-up.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
