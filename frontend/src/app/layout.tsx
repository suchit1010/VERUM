import type { Metadata } from 'next';
import './globals.css';
import { WalletContextProvider } from '@/components/WalletContextProvider';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'SSS Token Dashboard',
  description: 'Manage and track Solana Stablecoin Standard tokens.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-950 text-slate-100 min-h-screen font-sans" suppressHydrationWarning>
        <WalletContextProvider>
            {children}
            <Toaster position="bottom-right" />
        </WalletContextProvider>
      </body>
    </html>
  );
}
