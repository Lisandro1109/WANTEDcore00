"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { firstModulePath, useSpace } from "./shell";

export default function WorkspaceIndexPage() {
  const space = useSpace();
  const router = useRouter();

  useEffect(() => {
    if (!space) {
      return;
    }
    router.replace(firstModulePath(space.grants));
  }, [router, space]);

  return null;
}
