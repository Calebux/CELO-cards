"use client";

import { useEffect, useState } from "react";

type ProviderComponent = React.ComponentType<{ children: React.ReactNode }>;

export function AppProviders({
  children,
  isMiniPayUA,
}: {
  children: React.ReactNode;
  isMiniPayUA: boolean;
}) {
  const [ProviderComponent, setProviderComponent] = useState<ProviderComponent | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProvider = async () => {
      if (isMiniPayUA) {
        const module = await import("../minipay-providers");
        if (!cancelled) {
          setProviderComponent(() => module.MiniPayProviders);
        }
      } else {
        const module = await import("../providers");
        if (!cancelled) {
          setProviderComponent(() => module.Providers);
        }
      }
    };

    void loadProvider();

    return () => {
      cancelled = true;
    };
  }, [isMiniPayUA]);

  if (!ProviderComponent) return null;

  return <ProviderComponent>{children}</ProviderComponent>;
}
