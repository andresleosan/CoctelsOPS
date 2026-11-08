"use client";

import { useState } from "react";
import { CheckCircle2, MessageSquare, Send, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import type { OrderRating } from "@/types/orders";

export const RATING_ATTRIBUTE_TAGS = [
  "🍓 Sabor increíble",
  "❄️ Bien frío",
  "⚡ Entrega rápida",
  "✨ Excelente presentación",
  "🥤 Buena porción",
  "👏 Muy amable",
] as const;

interface OrderRatingCardProps {
  orderId: string;
  initialRating?: OrderRating;
  onRatingSuccess?: (rating: OrderRating) => void;
  className?: string;
}

export function OrderRatingCard({
  orderId,
  initialRating,
  onRatingSuccess,
  className = "",
}: OrderRatingCardProps) {
  const { user } = useAuth();
  const [stars, setStars] = useState<number>(initialRating?.stars ?? 0);
  const [hoveredStar, setHoveredStar] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialRating?.tags ?? []);
  const [comment, setComment] = useState<string>(initialRating?.comment ?? "");
  const [showCommentField, setShowCommentField] = useState<boolean>(Boolean(initialRating?.comment));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedRating, setSavedRating] = useState<OrderRating | undefined>(initialRating);
  const [isEditing, setIsEditing] = useState<boolean>(!initialRating);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) {
      setError("Debes iniciar sesión para calificar tu pedido.");
      return;
    }
    if (stars < 1 || stars > 5) {
      setError("Por favor selecciona una calificación de 1 a 5 estrellas.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/pedidos/${encodeURIComponent(orderId)}/rating`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          stars,
          tags: selectedTags,
          comment: comment.trim() || undefined,
        }),
      });

      const body = (await response.json()) as { success?: boolean; rating?: OrderRating; error?: string };

      if (!response.ok || !body.success || !body.rating) {
        throw new Error(body.error || "No se pudo guardar la calificación.");
      }

      setSavedRating(body.rating);
      setIsEditing(false);
      setSuccessMessage("¡Gracias por calificar tu pedido!");
      if (onRatingSuccess) {
        onRatingSuccess(body.rating);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la calificación.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Vista en modo completado/agradecimiento (cuando ya está calificado y no está editando)
  if (savedRating && !isEditing) {
    return (
      <Card
        className={`overflow-hidden border border-emerald-500/30 bg-emerald-950/10 backdrop-blur-sm text-left shadow-lg ${className}`}
        data-testid="order-rating-completed-card"
      >
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <h3 className="font-headline font-bold text-base text-foreground">
                ¡Gracias por tu valoración!
              </h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsEditing(true);
                setSuccessMessage("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
              data-testid="edit-rating-button"
            >
              Modificar
            </Button>
          </div>

          <div className="flex items-center gap-1.5" aria-label={`Calificado con ${savedRating.stars} estrellas`}>
            {[1, 2, 3, 4, 5].map((starIndex) => (
              <Star
                key={starIndex}
                className={`h-5 w-5 ${
                  starIndex <= savedRating.stars
                    ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]"
                    : "text-muted-foreground/30"
                }`}
                aria-hidden="true"
              />
            ))}
            <span className="ml-2 text-sm font-semibold text-foreground">
              {savedRating.stars} de 5
            </span>
          </div>

          {savedRating.tags && savedRating.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {savedRating.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-accent/15 border border-accent/30 px-2.5 py-1 text-xs font-medium text-accent"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {savedRating.comment && (
            <p className="text-xs italic text-muted-foreground bg-muted/30 rounded-lg p-3 border border-border/50">
              &ldquo;{savedRating.comment}&rdquo;
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Vista en modo interactivo (1-tap rating)
  const activeRating = hoveredStar || stars;

  return (
    <Card
      className={`overflow-hidden border border-primary/20 bg-card/90 backdrop-blur-sm text-left shadow-lg ${className}`}
      data-testid="order-rating-card"
    >
      <CardContent className="p-5 sm:p-6 space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="text-xs font-bold uppercase tracking-widest text-accent">
              ¿Qué tal estuvo tu pedido?
            </span>
          </div>
          <h3 className="font-headline text-lg sm:text-xl font-bold text-foreground">
            {stars === 0
              ? "Califica tu experiencia en 1 toque"
              : stars === 5
                ? "¡Excelente! Nos alegra mucho 🎉"
                : stars >= 4
                  ? "¡Muy bueno! Gracias por tu apoyo 👍"
                  : stars >= 3
                    ? "Aceptable, ¡queremos ser aún mejores! 🍹"
                    : "Lamentamos no haber cumplido tus expectativas 💬"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Tu opinión nos ayuda a perfeccionar la preparación y servicio en cada entrega.
          </p>
        </div>

        {/* Selector de 5 estrellas con tap targets >= 44px */}
        <div
          className="flex items-center justify-center gap-2 sm:gap-3 py-2"
          role="radiogroup"
          aria-label="Calificación de 1 a 5 estrellas"
        >
          {[1, 2, 3, 4, 5].map((starIndex) => {
            const isFilled = starIndex <= activeRating;
            return (
              <button
                key={starIndex}
                type="button"
                role="radio"
                aria-checked={stars === starIndex}
                aria-label={`${starIndex} ${starIndex === 1 ? "estrella" : "estrellas"}`}
                onClick={() => {
                  setStars(starIndex);
                  setError("");
                }}
                onMouseEnter={() => setHoveredStar(starIndex)}
                onMouseLeave={() => setHoveredStar(0)}
                className="group relative flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl p-2 transition-all duration-200 active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:bg-amber-400/10"
                data-testid={`star-button-${starIndex}`}
              >
                <Star
                  className={`h-7 w-7 sm:h-8 sm:w-8 transition-all duration-200 ${
                    isFilled
                      ? "fill-amber-400 text-amber-400 scale-110 drop-shadow-[0_0_10px_rgba(251,191,36,0.65)]"
                      : "text-muted-foreground/40 group-hover:text-amber-400/70"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Chips rápidos de atributos (1-tap tags) */}
        {stars > 0 && (
          <div className="space-y-2 pt-1 transition-all duration-300">
            <p className="text-xs font-semibold text-muted-foreground">
              ¿Qué fue lo más destacado? (Opcional)
            </p>
            <div className="flex flex-wrap gap-2">
              {RATING_ATTRIBUTE_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    aria-pressed={isSelected}
                    className={`min-h-[40px] px-3 py-2 rounded-full text-xs font-medium transition-all duration-200 border ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm scale-102"
                        : "bg-muted/40 text-foreground border-border/80 hover:bg-muted hover:border-border"
                    }`}
                    data-testid={`tag-chip-${tag}`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Campo de comentario opcional */}
        {stars > 0 && (
          <div className="space-y-2 pt-1">
            {!showCommentField ? (
              <button
                type="button"
                onClick={() => setShowCommentField(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-accent hover:underline focus:outline-none"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                ¿Deseas agregar un comentario adicional?
              </button>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <label htmlFor={`rating-comment-${orderId}`} className="font-medium">
                    Comentario adicional (opcional):
                  </label>
                  <span>{comment.length}/500</span>
                </div>
                <textarea
                  id={`rating-comment-${orderId}`}
                  rows={3}
                  maxLength={500}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Cuéntanos más detalles sobre tu experiencia..."
                  className="w-full rounded-xl border border-border bg-background/80 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  data-testid="rating-comment-textarea"
                />
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs font-semibold text-destructive">
            {error}
          </p>
        )}

        {successMessage && (
          <p role="status" className="text-xs font-semibold text-emerald-400">
            {successMessage}
          </p>
        )}

        {/* Botón de envío */}
        {stars > 0 && (
          <div className="flex items-center justify-end gap-3 pt-2">
            {savedRating && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setError("");
                }}
                disabled={isSubmitting}
                className="rounded-full text-xs text-muted-foreground"
              >
                Cancelar
              </Button>
            )}
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting || stars === 0}
              className="rounded-full bg-primary text-primary-foreground font-semibold px-6 shadow-md hover:opacity-90 min-h-[44px]"
              data-testid="submit-rating-button"
            >
              <Send className="mr-2 h-4 w-4" />
              {isSubmitting ? "Guardando..." : savedRating ? "Actualizar valoración" : "Enviar valoración"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
