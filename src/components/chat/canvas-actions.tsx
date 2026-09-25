"use client";

import { createContext, useContext } from "react";

type CanvasActions = { openArtifact: (id: string) => void };

export const CanvasActionsContext = createContext<CanvasActions>({ openArtifact: () => {} });

export function useCanvasActions() {
  return useContext(CanvasActionsContext);
}
