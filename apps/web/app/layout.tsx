import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  description: 'CRM Orchestrator beta control plane.',
  title: 'CRM Orchestrator',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
