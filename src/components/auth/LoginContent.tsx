"use client";

import { useSearchParams } from "next/navigation";

import { AuthLoginCard } from "@/components/auth/AuthLoginCard";

export default function LoginContent() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? undefined;
  const staff = searchParams.get("staff");
  const role = searchParams.get("role");
  const isStaff = staff === "true" || staff === "1" || role === "staff" || role === "admin";

  return (
    <AuthLoginCard
      initialRole={isStaff ? "staff" : "customer"}
      redirectTo={redirect}
    />
  );
}
