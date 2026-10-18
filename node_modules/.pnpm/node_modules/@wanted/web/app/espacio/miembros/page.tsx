"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MembersRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/espacio/ajustes#usuarios");
  }, [router]);

  return null;
}
