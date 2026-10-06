import { useEffect, useState } from "react";

export function useNativeSearchParams(): URLSearchParams {
  const [params, setParams] = useState<URLSearchParams>(
    () => new URLSearchParams(),
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      setParams(new URLSearchParams(window.location.search));
    }
  }, []);

  return params;
}
