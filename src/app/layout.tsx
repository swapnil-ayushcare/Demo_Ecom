import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Demo_Ecom — a small, honest shop',
    template: '%s · Demo_Ecom',
  },
  description:
    'Everyday spices, steel, soap and paper from a small Indian shop. Prices in rupees, stock kept true.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f7f1e7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
