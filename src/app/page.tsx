
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Truck, MessageSquare, MapPin } from 'lucide-react';
import ProductCard from '@/components/products/ProductCard';
import CocktailCarousel from '@/components/products/CocktailCarousel';
import { getFeaturedProducts } from '@/lib/catalog/home';
import { getStoreConfiguration } from '@/lib/firestore/configuration';
import { buildWhatsAppLink } from '@/lib/orders/whatsapp-message';
import { PlaceHolderImages } from '@/lib/placeholder-images';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [featuredProducts, configuration] = await Promise.all([
    getFeaturedProducts(),
    getStoreConfiguration().catch(() => null),
  ]);
  const whatsappHref = configuration ? buildWhatsAppLink(configuration.whatsappNumber) : null;
  
  const heroImage = PlaceHolderImages.find(img => img.id === 'hero-granizado')?.imageUrl || '/catalog-placeholder.svg';
  const logoImage = PlaceHolderImages.find(img => img.id === 'logo-ops')?.imageUrl || '/catalog-placeholder.svg';
  return (
    <div className="flex flex-col gap-12 md:gap-20 pb-20 bg-background text-white">
      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden py-8">
        <div className="absolute inset-0 z-0">
          <Image
            src={heroImage}
            alt="Ambiente nocturno OPS"
            fill
            className="object-cover opacity-30 grayscale-[0.2]"
            priority
            data-ai-hint="neon cocktail"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/80 to-black"></div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10 text-center space-y-6 animate-fade-in flex flex-col items-center justify-center min-h-full">
          <div className="flex justify-center w-full">
            <div className="relative w-44 h-44 md:w-72 md:h-72 rounded-full border-4 border-primary p-1 shadow-[0_0_40px_rgba(233,30,99,0.5)] bg-black overflow-hidden group transition-all flex items-center justify-center">
              <Image 
                src={logoImage} 
                alt="COCTELS OPS OFICIAL" 
                fill 
                className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
                priority
                data-ai-hint="neon logo"
              />
            </div>
          </div>
          
          <div className="space-y-3">
            <p className="text-accent font-black tracking-[0.3em] uppercase text-[10px] md:text-xs animate-pulse neon-text-cyan">
              LOS ORIGINALES
            </p>
            <h1 className="text-5xl md:text-8xl font-headline font-bold leading-tight tracking-tighter uppercase">
              COCTELS <span className="text-primary italic neon-text-magenta">OPS</span>
            </h1>
            <p className="text-sm md:text-xl text-white/70 max-w-xl mx-auto font-light tracking-wide px-2 leading-relaxed">
              ¡¡ QUE CHIMBA UN OPS !! <br />
              La experiencia refrescante más potente de Medellín.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2 px-4">
            <Button size="lg" className="rounded-full h-14 md:h-16 px-8 bg-primary text-white hover:bg-primary/90 neon-shadow-magenta font-black uppercase tracking-widest text-sm" asChild>
              <Link href="/menu">
                VER EL MENÚ <ArrowRight className="ml-1 w-4 h-4" />
              </Link>
            </Button>
            {whatsappHref && (
              <Button size="lg" variant="outline" className="rounded-full h-14 md:h-16 px-8 border-accent text-accent hover:bg-accent/10 font-bold uppercase tracking-widest text-sm" asChild>
                <Link href={whatsappHref} target="_blank">
                  <MessageSquare className="mr-2 w-4 h-4" /> WHATSAPP
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Domicilios Info */}
      <section className="container mx-auto px-4">
        <div className="bg-card/40 border border-primary/20 rounded-[2rem] p-6 md:p-12 backdrop-blur-xl relative overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-3xl md:text-5xl font-headline font-bold tracking-tighter neon-text-magenta uppercase">DOMICILIOS</h2>
                <div className="h-1.5 w-16 bg-accent shadow-[0_0_10px_rgba(0,188,212,0.8)]"></div>
              </div>
              
              <div className="grid gap-3">
                {whatsappHref && (
                  <Link
                    href={whatsappHref}
                    target="_blank"
                    className="flex items-center gap-4 p-5 rounded-2xl bg-black/60 border border-primary/20 group hover:border-primary/60 transition-all active:scale-95"
                  >
                    <div className="bg-primary/20 p-3 rounded-xl text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-[0_0_15px_rgba(233,30,99,0.3)]">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.2em] text-accent mb-0.5 font-bold">Pide por WhatsApp</p>
                      <p className="text-xl font-bold text-white tracking-tight">{configuration?.whatsappNumber}</p>
                    </div>
                  </Link>
                )}

                <div className="flex items-center gap-4 p-5 rounded-2xl bg-black/60 border border-accent/20">
                  <div className="bg-accent/20 p-3 rounded-xl text-accent shadow-[0_0_15px_rgba(0,188,212,0.3)]">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-bold">También en</p>
                    <div className="flex gap-3 items-center">
                      <span className="font-black text-xs text-[#FF4D00]">DiDi Food</span>
                      <span className="text-white/20">|</span>
                      <span className="font-black text-xs text-[#FF441F]">Rappi</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 border-l-4 border-accent bg-accent/5 rounded-r-2xl">
                <MapPin className="w-5 h-5 text-accent shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-xs text-white font-medium">Carrera 37 # 66 D 36, Villa Hermosa</p>
                  <p className="text-[10px] text-muted-foreground italic tracking-wide">&quot;Llegamos frío y potente a todo el barrio.&quot;</p>
                </div>
              </div>
            </div>

            <div className="relative aspect-square rounded-2xl overflow-hidden shadow-2xl border border-white/5 order-first md:order-last">
              <CocktailCarousel products={featuredProducts} />
            </div>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-3">
          <div className="space-y-0.5">
            <h2 className="text-3xl md:text-5xl font-headline font-bold uppercase tracking-tight">LOS MÁS <span className="text-primary italic neon-text-magenta">TOP</span></h2>
            <p className="text-muted-foreground tracking-[0.2em] uppercase text-[8px]">Mezclas exclusivas de la casa</p>
          </div>
          <Button variant="outline" className="border-primary text-primary rounded-full hover:bg-primary/10 px-6 h-10 uppercase font-black text-[10px]" asChild>
            <Link href="/menu">VER TODO EL MENÚ <ArrowRight className="ml-1 w-3 h-3" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}
