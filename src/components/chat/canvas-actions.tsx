"use client";

import { createContext, useContext } from "react";

type CanvasActions = {
  openArtifact: (id: string) => void;
  /** Kind of every artifact that still exists; cards for deleted ones are shown as such. */
  kinds: Map<string, "document" | "diagram" | "code">;
};

export const CanvasActionsContext = createContext<CanvasActions>({ openArtifact: () => {}, kinds: new Map() });

export function useCanvasActions() {
  return useContext(CanvasActionsContext);
}
