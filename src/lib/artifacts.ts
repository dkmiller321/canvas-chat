import { and, asc, desc, eq, max } from "drizzle-orm";
import { db } from "@/db/client";
import { artifactVersions, artifacts } from "@/db/schema";

export type ArtifactKind = "document" | "diagram" | "code";
export type Author = "user" | "ai";

export type VersionDto = { versionNo: number; author: Author; content: string; createdAt: string };
export type ArtifactDto = {
  id: string;
  conversationId: string;
  kind: ArtifactKind;
  title: string;
  /** Code artifacts only. */
  language: string | null;
  currentVersion: VersionDto | null;
};
export type ArtifactSummary = { id: string; kind: ArtifactKind; title: string; version: number };

export class VersionConflictError extends Error {}

const toVersionDto = (v: typeof artifactVersions.$inferSelect): VersionDto => ({
  versionNo: v.versionNo,
  author: v.author,
  content: v.content,
  createdAt: v.createdAt.toISOString(),
});

export async function getArtifact(id: string): Promise<ArtifactDto | null> {
  const [row] = await db
    .select({ artifact: artifacts, version: artifactVersions })
    .from(artifacts)
    .leftJoin(artifactVersions, eq(artifactVersions.id, artifacts.currentVersionId))
    .where(eq(artifacts.id, id));
  if (!row) return null;
  const { artifact, version } = row;
  return {
    id: artifact.id,
    conversationId: artifact.conversationId,
    kind: artifact.kind,
    title: artifact.title,
    language: artifact.language,
    currentVersion: version ? toVersionDto(version) : null,
  };
}

export async function listVersions(artifactId: string): Promise<VersionDto[]> {
  const rows = await db
    .select()
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifactId))
    .orderBy(asc(artifactVersions.versionNo));
  return rows.map(toVersionDto);
}

export async function listArtifactSummaries(conversationId: string): Promise<ArtifactSummary[]> {
  const rows = await db
    .select({ id: artifacts.id, kind: artifacts.kind, title: artifacts.title, version: artifactVersions.versionNo })
    .from(artifacts)
    .leftJoin(artifactVersions, eq(artifactVersions.id, artifacts.currentVersionId))
    .where(eq(artifacts.conversationId, conversationId))
    .orderBy(asc(artifacts.createdAt));
  return rows.map((r) => ({ ...r, version: r.version ?? 0 }));
}

/** New artifact. `content` null leaves it without versions (a diagram awaiting Mermaid conversion). */
export async function createArtifact(input: {
  conversationId: string;
  kind: ArtifactKind;
  title: string;
  content: string | null;
  author: Author;
  language?: string | null;
}): Promise<{ id: string; versionNo: number }> {
  const [artifact] = await db
    .insert(artifacts)
    .values({
      conversationId: input.conversationId,
      kind: input.kind,
      title: input.title,
      language: input.language ?? null,
    })
    .returning({ id: artifacts.id });
  if (!artifact) throw new Error("artifact insert returned nothing");
  if (input.content === null) return { id: artifact.id, versionNo: 0 };
  const version = await addVersion(artifact.id, input.content, input.author);
  return { id: artifact.id, versionNo: version.versionNo };
}

/**
 * Append an immutable version and make it current. Serialised per artifact with a
 * row lock. With `baseVersionNo`, fails if someone else saved in between.
 */
export async function addVersion(
  artifactId: string,
  content: string,
  author: Author,
  opts: { baseVersionNo?: number } = {},
): Promise<VersionDto> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .for("update");
    if (!locked) throw new Error(`Artifact ${artifactId} not found`);
    const [{ latest } = { latest: 0 }] = await tx
      .select({ latest: max(artifactVersions.versionNo) })
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId));
    const current = latest ?? 0;
    if (opts.baseVersionNo !== undefined && opts.baseVersionNo !== current) {
      throw new VersionConflictError(`Version ${current} is newer than ${opts.baseVersionNo}`);
    }
    const [version] = await tx
      .insert(artifactVersions)
      .values({ artifactId, versionNo: current + 1, content, author })
      .returning();
    if (!version) throw new Error("version insert returned nothing");
    await tx.update(artifacts).set({ currentVersionId: version.id }).where(eq(artifacts.id, artifactId));
    return toVersionDto(version);
  });
}

export async function getVersion(artifactId: string, versionNo: number): Promise<VersionDto | null> {
  const [row] = await db
    .select()
    .from(artifactVersions)
    .where(and(eq(artifactVersions.artifactId, artifactId), eq(artifactVersions.versionNo, versionNo)));
  return row ? toVersionDto(row) : null;
}

/** Restore = a new version authored by the user whose content equals the chosen one (A3). */
export async function restoreVersion(artifactId: string, versionNo: number): Promise<VersionDto | null> {
  const old = await getVersion(artifactId, versionNo);
  if (!old) return null;
  return addVersion(artifactId, old.content, "user");
}

export async function updateArtifact(id: string, patch: { title?: string; language?: string }) {
  const [row] = await db.update(artifacts).set(patch).where(eq(artifacts.id, id)).returning({ id: artifacts.id });
  return row ? getArtifact(row.id) : null;
}

export async function deleteArtifact(id: string): Promise<boolean> {
  const rows = await db.delete(artifacts).where(eq(artifacts.id, id)).returning({ id: artifacts.id });
  return rows.length > 0;
}

/** Branch (A3): a new artifact in the same conversation whose version 1 is a copy of the chosen version. */
export async function branchArtifact(id: string, versionNo: number): Promise<ArtifactDto | null> {
  const source = await getArtifact(id);
  const version = source ? await getVersion(id, versionNo) : null;
  if (!source || !version) return null;
  const copy = await createArtifact({
    conversationId: source.conversationId,
    kind: source.kind,
    title: `${source.title} (v${versionNo} copy)`,
    content: version.content,
    author: "user",
    language: source.language,
  });
  return getArtifact(copy.id);
}

export async function latestArtifactOfKind(conversationId: string, kind: ArtifactKind) {
  const [row] = await db
    .select({ id: artifacts.id })
    .from(artifacts)
    .where(and(eq(artifacts.conversationId, conversationId), eq(artifacts.kind, kind)))
    .orderBy(desc(artifacts.createdAt))
    .limit(1);
  return row?.id ?? null;
}
