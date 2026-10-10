import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { DM_Mono, DM_Sans } from 'next/font/google';
import { parseTheme, THEME_COOKIE } from '@/lib/theme/theme';
import './globals.css';

// DM Sans for the interface, DM Mono for anything that is a number or an identifier.
// The direction pairs them, and the split is load-bearing rather than decorative:
// tabular figures are what make a column of money line up.
const dmSans = DM_Sans({ variable: '--font-app-sans', subsets: ['latin'] });
const dmMono = DM_Mono({ weight: ['400', '500'], variable: '--font-app-mono', subsets: ['latin'] });

const appName = process.env.APP_NAME ?? 'app';

export const metadata: Metadata = {
  title: appName,
  description: `${appName} — a multi-tenant marketplace operations console.`,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read on the server so the first byte is already the right theme. Reading it here
  // rather than in a client effect is the difference between a page that arrives
  // painted and one that flashes the other theme before it is corrected.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" data-theme={theme}>
      <body className={`${dmSans.variable} ${dmMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
