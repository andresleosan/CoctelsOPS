import { Suspense } from "react";
import LoginContent from "@/components/auth/LoginContent";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center text-sm text-muted-foreground">
          Cargando acceso...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
