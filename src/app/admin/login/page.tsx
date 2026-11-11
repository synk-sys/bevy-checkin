import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/app/login/LoginForm";

export const metadata: Metadata = { title: "Admin sign-in" };

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm admin />
    </Suspense>
  );
}
