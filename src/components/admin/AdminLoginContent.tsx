"use client";

import { useSearchParams } from "next/navigation";

import { AuthLoginCard } from "@/components/auth/AuthLoginCard";

export default function AdminLoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? undefined;

  return (
    <AuthLoginCard
      initialRole="staff"
      redirectTo={redirectTo}
      staffRedirectTo="/admin/dashboard"
    />
  );
}
