import type { Metadata } from 'next';
import { Manrope, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { AiActions } from '@/components/ai-actions';
import './globals.css';

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const siteUrl = 'https://zeitzeuge.dev';
const defaultDescription =
  'AI-powered performance analysis for frontend page loads and Vitest test suites. Captures V8 heap snapshots, performance traces, and CPU profiles — hands them to a Deep Agent that finds bottlenecks and suggests code-level fixes.';

export const metadata: Metadata = {
  title: {
    default: 'zeitzeuge — AI-Powered Performance Analysis',
    template: '%s — zeitzeuge',
  },
  description: defaultDescription,
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: 'website',
    siteName: 'zeitzeuge',
    title: 'zeitzeuge — AI-Powered Performance Analysis',
    description: defaultDescription,
    url: siteUrl,
    images: [
      {
        url: '/og?title=zeitzeuge&description=AI-Powered+Performance+Analysis',
        width: 1200,
        height: 630,
        alt: 'zeitzeuge — AI-Powered Performance Analysis',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'zeitzeuge — AI-Powered Performance Analysis',
    description: defaultDescription,
    images: ['/og?title=zeitzeuge&description=AI-Powered+Performance+Analysis'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${manrope.className} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <ThemeProvider>
          <Nav />
          <main className="flex-1 pt-14">{children}</main>
          <Footer />
          <AiActions />
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  // If you're reading this, zeitzeuge helped you find a performance problem. You're welcome!
  function ohBoyYouFoundThis() {
    var acc = 0;
    for (var i = 0; i < 5e6; i++) {
      acc += Math.sqrt(i) * Math.sin(i) * Math.cos(i);
    }
    return acc;
  }
  setTimeout(function() { ohBoyYouFoundThis(); }, 0);
})();`,
          }}
        />
      </body>
    </html>
  );
}
