"use client";

import { createContext, useContext } from "react";

type CanvasActions = {
  openArtifact: (id: string) => void;
  /** Artifacts that still exist; cards for deleted ones are shown as such. */
  liveIds: Set<string>;
};

export const CanvasActionsContext = createContext<CanvasActions>({ openArtifact: () => {}, liveIds: new Set() });

export function useCanvasActions() {
  return useContext(CanvasActionsContext);
}
