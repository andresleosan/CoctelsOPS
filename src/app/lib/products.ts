import { PlaceHolderImages } from '@/lib/placeholder-images';
import type { Product } from '@/types/catalog';

export type { Product } from '@/types/catalog';

export const PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Fresa Salvaje',
    description: 'Granizado de fresa natural con un toque de limón y fruta fresca picada.',
    price: 10000,
    image: PlaceHolderImages.find(img => img.id === 'product-strawberry')?.imageUrl || '',
    category: 'granizado',
    availableSizes: [
      { name: '8 oz', price: 10000 },
      { name: '16 oz', price: 15000 },
      { name: '24 oz', price: 25000 },
    ],
    availableFlavors: ['Fresa', 'Mora', 'Limón'],
    availableAddOns: [
      { name: 'Leche Condensada', price: 1000 },
      { name: 'Gomitas', price: 1500 },
      { name: 'Fruta Picada Extra', price: 2000 }
    ],
    stock: 100,
    active: true,
    featured: true,
  },
  {
    id: '2',
    name: 'Mango Biche Special',
    description: 'El clásico sabor colombiano: mango biche con sal, limón y un toque de pimienta.',
    price: 10000,
    image: PlaceHolderImages.find(img => img.id === 'product-mango')?.imageUrl || '',
    category: 'granizado',
    availableSizes: [
      { name: '8 oz', price: 10000 },
      { name: '16 oz', price: 15000 },
      { name: '24 oz', price: 25000 },
    ],
    availableFlavors: ['Mango Biche', 'Limón'],
    availableAddOns: [
      { name: 'Sal de Gusano', price: 1500 },
      { name: 'Chile en Polvo', price: 1000 }
    ],
    stock: 100,
    active: true,
    featured: true,
  },
  {
    id: '3',
    name: 'Coco Loco Tropical',
    description: 'Combinación refrescante de coco y piña, ideal para los días de sol.',
    price: 15000,
    image: PlaceHolderImages.find(img => img.id === 'product-coco')?.imageUrl || '',
    category: 'cocktail',
    availableSizes: [
      { name: '14 oz', price: 15000 },
    ],
    availableFlavors: ['Coco', 'Piña', 'Maracuyá'],
    availableAddOns: [
      { name: 'Coco Rallado', price: 1000 },
      { name: 'Cereza', price: 500 }
    ],
    stock: 100,
    active: true,
    featured: true,
  },
  {
    id: '4',
    name: 'Explosión de Maracuyá',
    description: 'Sabor intenso a fruta de la pasión con semillas crocantes.',
    price: 10000,
    image: PlaceHolderImages.find(img => img.id === 'product-maracuya')?.imageUrl || '',
    category: 'granizado',
    availableSizes: [
      { name: '8 oz', price: 10000 },
      { name: '16 oz', price: 15000 },
      { name: '24 oz', price: 25000 },
    ],
    availableFlavors: ['Maracuyá', 'Hierbabuena'],
    availableAddOns: [
      { name: 'Leche Condensada', price: 1000 },
      { name: 'Miel', price: 1500 }
    ],
    stock: 100,
    active: true,
    featured: false,
  },
  {
    id: '5',
    name: 'Lulo Refrescante',
    description: 'Granizado tradicional de lulo con ese toque ácido que te despierta.',
    price: 10000,
    image: PlaceHolderImages.find(img => img.id === 'product-lulo')?.imageUrl || '',
    category: 'granizado',
    availableSizes: [
      { name: '8 oz', price: 10000 },
      { name: '16 oz', price: 15000 },
      { name: '24 oz', price: 25000 },
    ],
    availableFlavors: ['Lulo', 'Limón'],
    availableAddOns: [
      { name: 'Hierbabuena', price: 500 }
    ],
    stock: 100,
    active: true,
    featured: false,
  }
];
