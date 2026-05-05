import { createContext, useContext } from "react";

export const AccentColorContext = createContext<string>("#6366f1");

export function useAccentColor(): string {
  return useContext(AccentColorContext);
}
