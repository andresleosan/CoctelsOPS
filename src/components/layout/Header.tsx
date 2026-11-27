
"use client";

import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart, Menu, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/cart-context';
import { AuthStatus } from '@/components/auth/AuthStatus';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useState } from 'react';
import { usePathname } from 'next/navigation';

export default function Header() {
  const { totalItems } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  if (pathname?.startsWith('/admin') || pathname?.startsWith('/pantalla')) return null;

  const NavItems = () => (
    <>
      <Link href="/menu" className="text-sm font-semibold text-white/85 hover:text-primary transition-colors">
        Menú
      </Link>
      <Link href="/ai-suggest" className="text-sm font-semibold text-white/85 flex items-center gap-1.5 hover:text-accent transition-colors">
        <Sparkles className="w-4 h-4 text-[#D98FD6]" />
        Opsy AI
      </Link>
    </>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/85 backdrop-blur-xl supports-[backdrop-filter]:bg-black/70">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden min-h-[44px] min-w-[44px]" aria-label="Abrir menú de navegación">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] sm:w-[300px] bg-black border-white/10">
              <SheetHeader>
                <SheetTitle className="text-left font-headline text-white flex items-center gap-2.5">
                  <span className="relative h-8 w-8 overflow-hidden rounded-full border border-primary/60 bg-black shrink-0">
                    <Image src="/brand/coctels-ops-logo.png" alt="Coctels OPS" fill sizes="32px" className="object-cover" />
                  </span>
                  <span>
                    Coctels <span className="text-primary">OPS</span>
                  </span>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-4 mt-8" onClick={() => setIsOpen(false)}>
                <NavItems />
                <AuthStatus mobileMenu />
              </nav>
            </SheetContent>
          </Sheet>
          
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="relative h-9 w-9 overflow-hidden rounded-full border border-primary/60 bg-black shadow-[0_0_14px_rgba(233,30,99,0.35)] transition-transform duration-300 group-hover:scale-105 shrink-0">
              <Image src="/brand/coctels-ops-logo.png" alt="Logo Coctels OPS" fill sizes="36px" className="object-cover" priority />
            </span>
            <span className="font-headline font-black text-lg tracking-tight text-white hidden sm:inline-block uppercase">
              Coctels <span className="text-primary neon-text-magenta">OPS</span>
            </span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          <NavItems />
        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          <AuthStatus />
          <Link href="/cart" aria-label="Ver carrito">
            <Button variant="ghost" size="icon" className="relative min-h-[44px] min-w-[44px] hover:bg-white/10">
              <ShoppingCart className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-[0_0_10px_rgba(233,30,99,0.7)]">
                  {totalItems}
                </span>
              )}
            </Button>
          </Link>
          <Button className="hidden sm:flex rounded-full px-5 min-h-[40px] font-bold uppercase tracking-wider text-xs bg-primary hover:bg-primary/90 text-white neon-shadow-magenta active:scale-95 transition-all" asChild>
            <Link href="/menu">Pedir Ahora</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
