import type {Metadata} from 'next';
import './globals.css';
import { CartProvider } from '@/context/cart-context';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { Toaster } from '@/components/ui/toaster';
import OpsyChat from '@/components/opsy/OpsyChat';
import { FirebaseProvider } from '@/firebase';
import { AuthProvider } from '@/components/auth/AuthProvider';

export const metadata: Metadata = {
  title: 'Coctels OPS | ¡¡ QUE CHIMBA UN OPS !!',
  description: 'Los mejores granizados y cocteles neón en Medellín. Domicilios en Villa Hermosa.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  }, 
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased min-h-screen flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
        <FirebaseProvider>
          <AuthProvider>
            <CartProvider>
              <Header />
              <main className="flex-grow">
                {children}
              </main>
              <Footer />
              <OpsyChat />
              <Toaster />
            </CartProvider>
          </AuthProvider>
        </FirebaseProvider>
      </body>
    </html>
  );
}
