import { getArtifact, listArtifactSummaries } from "@/lib/artifacts";
import { parseScene, summarizeScene } from "@/lib/tools/scene";
import type { ArtifactContext, OpenArtifact } from "./context";

/**
 * Current artifact state for the model, read from the database on every turn so
 * it includes the user's saved manual edits (PRD A5). The open artifact is the one
 * shown in the canvas, else the most recently created one.
 */
export async function loadArtifactContext(
  conversationId: string,
  openArtifactId: string | null,
): Promise<ArtifactContext> {
  const artifacts = (await listArtifactSummaries(conversationId)).filter((a) => a.version > 0);
  const openId =
    (openArtifactId && artifacts.some((a) => a.id === openArtifactId) ? openArtifactId : null) ??
    artifacts.at(-1)?.id ??
    null;
  if (!openId) return { artifacts, open: null };

  const artifact = await getArtifact(openId);
  const version = artifact?.currentVersion;
  if (!artifact || !version) return { artifacts, open: null };
  const listing = { id: artifact.id, title: artifact.title, version: version.versionNo };
  const open: OpenArtifact =
    artifact.kind === "document"
      ? { ...listing, kind: "document", content: version.content }
      : artifact.kind === "code"
        ? { ...listing, kind: "code", language: artifact.language ?? "text", content: version.content }
        : { ...listing, kind: "diagram", elements: summarizeScene(parseScene(version.content)) };
  return { artifacts, open };
}
