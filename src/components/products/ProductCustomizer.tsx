"use client";

import { useMemo, useState, useEffect } from "react";
import Image from "next/image";

import type { Product } from "@/types/catalog";
import { getProductSizes } from "@/lib/catalog/presentations";
import { useCart } from "@/context/cart-context";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

interface ProductCustomizerProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ProductCustomizer({ product, open, onOpenChange }: ProductCustomizerProps) {
  const { addItem } = useCart();
  const { toast } = useToast();

  const sizes = useMemo(() => getProductSizes(product), [product]);

  // Selección inicial inteligente: preferir 16 oz si existe, o la primera presentación
  const defaultSizeName = useMemo(() => {
    const found16oz = sizes.find((s) => s.name === "16 oz");
    return found16oz ? found16oz.name : sizes[0]?.name ?? "16 oz";
  }, [sizes]);

  const [size, setSize] = useState<string>(defaultSizeName);
  const [selectedFlavors, setSelectedFlavors] = useState<string[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);

  // Sincronizar selección al abrir o cambiar de producto
  useEffect(() => {
    if (open) {
      setSize((prevSize) => {
        const match = sizes.find((s) => s.name === prevSize);
        return match ? prevSize : defaultSizeName;
      });
      setSelectedFlavors([]);
      setSelectedAddOns([]);
    }
  }, [open, sizes, defaultSizeName]);

  const selectedPresentation = useMemo(() => {
    return sizes.find((s) => s.name === size) ?? sizes[0] ?? { name: size, price: product.price };
  }, [sizes, size, product.price]);

  const addOnPrices = useMemo(() => {
    return product.availableAddOns
      .filter((addon) => selectedAddOns.includes(addon.name))
      .reduce((sum, addon) => sum + addon.price, 0);
  }, [product.availableAddOns, selectedAddOns]);

  const finalPrice = selectedPresentation.price + addOnPrices;

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      name: product.name,
      price: finalPrice,
      quantity: 1,
      image: product.image,
      customization: {
        size: selectedPresentation.name,
        flavors: selectedFlavors,
        addOns: selectedAddOns,
      },
    });

    toast({
      title: "¡Agregado al carrito!",
      description: `${product.name} (${selectedPresentation.name}) listo para refrescarte.`,
    });

    onOpenChange(false);
  };

  const toggleFlavor = (flavor: string) => {
    setSelectedFlavors((prev) =>
      prev.includes(flavor) ? prev.filter((f) => f !== flavor) : [...prev, flavor]
    );
  };

  const toggleAddOn = (addon: string) => {
    setSelectedAddOns((prev) =>
      prev.includes(addon) ? prev.filter((a) => a !== addon) : [...prev, addon]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] max-h-[90vh] overflow-y-auto border-white/10 bg-slate-950/95 backdrop-blur-xl p-5 sm:p-6 rounded-2xl shadow-2xl">
        <DialogHeader>
          <div className="relative w-full h-44 rounded-xl overflow-hidden mb-3 border border-white/5 bg-secondary/20">
            <Image
              src={product.image || "/catalog-placeholder.svg"}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, 440px"
              className="object-cover"
            />
          </div>
          <DialogTitle className="text-2xl font-headline font-black uppercase tracking-tight text-primary">
            {product.name}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {product.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Selector de Presentación / Tamaño Real Carta Canva */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-sm sm:text-base font-bold text-foreground">
                Tamaño / Presentación
              </Label>
              <span className="text-[11px] font-semibold text-accent uppercase tracking-wider">
                Carta Oficial
              </span>
            </div>

            <RadioGroup
              value={size}
              onValueChange={setSize}
              className={`grid gap-2.5 ${sizes.length === 2 ? "grid-cols-2" : sizes.length >= 3 ? "grid-cols-3" : "grid-cols-1"}`}
            >
              {sizes.map((s) => {
                const isSelected = size === s.name;
                return (
                  <div key={s.name}>
                    <RadioGroupItem
                      value={s.name}
                      id={`size-${s.name}`}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={`size-${s.name}`}
                      className={`flex flex-col items-center justify-center rounded-xl border-2 p-3 min-h-[56px] cursor-pointer text-center transition-all duration-200 select-none ${
                        isSelected
                          ? "border-primary bg-primary/10 shadow-[0_0_12px_rgba(229,25,110,0.25)] text-foreground"
                          : "border-white/10 bg-card/60 hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="text-sm font-bold">{s.name}</span>
                      <span
                        className={`text-xs font-semibold mt-0.5 ${
                          isSelected ? "text-primary font-black" : "text-muted-foreground"
                        }`}
                      >
                        ${s.price.toLocaleString("es-CO")}
                      </span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          {/* Sabores Disponibles */}
          {product.availableFlavors.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm sm:text-base font-bold text-foreground">
                Sabores Disponibles
              </Label>
              <div className="grid grid-cols-2 gap-2.5">
                {product.availableFlavors.map((flavor) => {
                  const isChecked = selectedFlavors.includes(flavor);
                  return (
                    <div
                      key={flavor}
                      onClick={() => toggleFlavor(flavor)}
                      className={`flex items-center space-x-2.5 p-3 rounded-xl border min-h-[48px] cursor-pointer transition-colors ${
                        isChecked
                          ? "border-accent/60 bg-accent/10 text-foreground"
                          : "border-white/10 bg-card/40 hover:bg-white/5 text-muted-foreground"
                      }`}
                    >
                      <Checkbox
                        id={`flavor-${flavor}`}
                        checked={isChecked}
                        onCheckedChange={() => toggleFlavor(flavor)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Label
                        htmlFor={`flavor-${flavor}`}
                        className="text-xs sm:text-sm font-medium cursor-pointer flex-grow select-none"
                      >
                        {flavor}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Toppings y Adiciones */}
          {product.availableAddOns.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm sm:text-base font-bold text-foreground">
                Toppings y Adiciones
              </Label>
              <div className="grid gap-2">
                {product.availableAddOns.map((addon) => {
                  const isChecked = selectedAddOns.includes(addon.name);
                  return (
                    <div
                      key={addon.name}
                      onClick={() => toggleAddOn(addon.name)}
                      className={`flex items-center justify-between p-3 rounded-xl border min-h-[48px] cursor-pointer transition-colors ${
                        isChecked
                          ? "border-primary/50 bg-primary/10"
                          : "border-white/10 bg-card/40 hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <Checkbox
                          id={`addon-${addon.name}`}
                          checked={isChecked}
                          onCheckedChange={() => toggleAddOn(addon.name)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Label
                          htmlFor={`addon-${addon.name}`}
                          className="text-xs sm:text-sm font-medium cursor-pointer select-none"
                        >
                          {addon.name}
                        </Label>
                      </div>
                      <span className="text-xs font-bold text-primary">
                        +${addon.price.toLocaleString("es-CO")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button
            onClick={handleAddToCart}
            disabled={product.stock <= 0}
            className="w-full text-base sm:text-lg font-bold h-12 sm:h-14 rounded-full bg-primary hover:bg-primary/90 neon-shadow-magenta transition-all active:scale-95 disabled:opacity-50"
          >
            {product.stock > 0
              ? `Agregar al Carrito • $${finalPrice.toLocaleString("es-CO")}`
              : "Agotado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
