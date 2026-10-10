import type { Metadata } from 'next';
import { DM_Mono, DM_Sans } from 'next/font/google';
import './globals.css';

// DM Sans for the interface, DM Mono for anything that is a number or an identifier.
// The direction pairs them, and the split is load-bearing rather than decorative:
// tabular figures are what make a column of money line up.
const dmSans = DM_Sans({ variable: '--font-app-sans', subsets: ['latin'] });
const dmMono = DM_Mono({ weight: ['400', '500'], variable: '--font-app-mono', subsets: ['latin'] });

const appName = process.env.APP_NAME ?? 'app';

export const metadata: Metadata = {
  title: appName,
  description: `${appName} — a TypeScript monorepo.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
