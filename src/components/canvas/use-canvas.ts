"use client";

import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArtifactDto, ArtifactSummary, VersionDto } from "@/lib/artifacts";
import { mermaidToScene, skeletonToScene } from "@/lib/diagram-client";
import type { CreateCodeOutput, CreateDiagramOutput, CreateDocumentOutput, EditOutput } from "@/lib/tools";

const AUTOSAVE_MS = 800;

export type OpenDoc = {
  artifact: ArtifactDto;
  versions: VersionDto[];
  /** What the editor shows; replaced only on external changes (see contentKey). */
  content: string;
  /** Changes when the editor must load `content` (AI edit, restore, version switch). */
  contentKey: string;
  /** Version being viewed read-only, or null for the current version. */
  viewing: number | null;
};

export type Preview = { title: string; markdown: string };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error((await res.text()) || `${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function toolCallIds(messages: UIMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const m of messages)
    for (const p of m.parts) if (isToolUIPart(p) && p.state === "output-available") ids.add(p.toolCallId);
  return ids;
}

/** Find the create_diagram output for an artifact, to convert it if version 1 was never saved. */
function diagramSource(messages: UIMessage[], artifactId: string): CreateDiagramOutput | null {
  for (const m of messages) {
    for (const p of m.parts) {
      if (isToolUIPart(p) && getToolName(p) === "create_diagram" && p.state === "output-available") {
        const out = p.output as CreateDiagramOutput;
        if (out.artifactId === artifactId) return out;
      }
    }
  }
  return null;
}

export function useCanvas({
  initialArtifacts,
  messages,
}: {
  initialArtifacts: ArtifactSummary[];
  messages: UIMessage[];
}) {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>(initialArtifacts);
  const [openId, setOpenId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);
  /** Autosave status for the open artifact, shown under its title. */
  const [saveState, setSaveState] = useState<"saved" | "unsaved" | "saving">("saved");

  const openIdRef = useRef(openId);
  openIdRef.current = openId;
  const docRef = useRef(doc);
  docRef.current = doc;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ---- loading -------------------------------------------------------------

  const converting = useRef(new Set<string>());

  /** Save version 1 of a diagram from its Mermaid or skeleton source (docs/DECISIONS.md #2). */
  const convertDiagram = useCallback(async (source: CreateDiagramOutput) => {
    if (converting.current.has(source.artifactId)) return;
    converting.current.add(source.artifactId);
    try {
      const content = source.mermaid
        ? await mermaidToScene(source.mermaid)
        : await skeletonToScene(source.elements ?? []);
      const res = await fetch(`/api/artifacts/${source.artifactId}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, author: "ai", baseVersionNo: 0 }),
      });
      // 409: another tab converted it first, which is fine.
      if (!res.ok && res.status !== 409) throw new Error(await res.text());
    } finally {
      converting.current.delete(source.artifactId);
    }
  }, []);

  const load = useCallback(
    async (id: string, viewing: number | null = null) => {
      let artifact = await fetchJson<ArtifactDto>(`/api/artifacts/${id}`);
      if (!artifact.currentVersion && artifact.kind === "diagram") {
        const source = diagramSource(messagesRef.current, id);
        if (!source) throw new Error("This diagram has no content.");
        await convertDiagram(source);
        artifact = await fetchJson<ArtifactDto>(`/api/artifacts/${id}`);
      }
      const versions = await fetchJson<VersionDto[]>(`/api/artifacts/${id}/versions`);
      if (openIdRef.current !== id) return;
      const current = artifact.currentVersion;
      if (!current) throw new Error("This artifact has no content yet.");
      const shown = viewing === null ? current : (versions.find((v) => v.versionNo === viewing) ?? current);
      const isOld = shown.versionNo !== current.versionNo;
      setDoc({
        artifact,
        versions,
        content: shown.content,
        contentKey: `${id}:${shown.versionNo}:${isOld ? "view" : "edit"}`,
        viewing: isOld ? shown.versionNo : null,
      });
      setArtifacts((list) =>
        list.map((a) => (a.id === id ? { ...a, version: current.versionNo, title: artifact.title } : a)),
      );
    },
    [convertDiagram],
  );

  const reload = useCallback(
    (id: string, viewing: number | null = null) => {
      setError(null);
      load(id, viewing).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    },
    [load],
  );

  // ---- autosave ------------------------------------------------------------

  type SaveJob = { id: string; content: string };
  const pending = useRef<{ id: string; get: () => string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const save = useCallback(
    async ({ id, content }: SaveJob) => {
      const current = docRef.current;
      if (!current || current.artifact.id !== id || !current.artifact.currentVersion) return;
      if (content === current.artifact.currentVersion.content) {
        setSaveState("saved");
        return;
      }
      setSaveState("saving");
      const res = await fetch(`/api/artifacts/${id}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, author: "user", baseVersionNo: current.artifact.currentVersion.versionNo }),
      });
      if (res.status === 409) {
        setError("The document changed elsewhere, so your last edit was not saved. Showing the latest version.");
        await load(id);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const version = (await res.json()) as VersionDto;
      // Keep contentKey: the editor already shows this text and must not be reset.
      const next = (d: OpenDoc | null) =>
        d && d.artifact.id === id
          ? { ...d, content, artifact: { ...d.artifact, currentVersion: version }, versions: [...d.versions, version] }
          : d;
      docRef.current = next(docRef.current);
      setDoc(next);
      setArtifacts((list) => list.map((a) => (a.id === id ? { ...a, version: version.versionNo } : a)));
      if (!pending.current) setSaveState("saved");
    },
    [load],
  );

  /**
   * Take the pending edit's content now, while its editor still exists, and queue
   * the save behind any save already in flight.
   */
  const runSave = useCallback(() => {
    const job = pending.current;
    if (!job) return inFlight.current ?? Promise.resolve();
    clearTimeout(job.timer);
    pending.current = null;
    const captured: SaveJob = { id: job.id, content: job.get() };
    const run = (inFlight.current ?? Promise.resolve())
      .then(() => save(captured))
      .catch((e: unknown) => {
        setSaveState("unsaved");
        setError(`Autosave failed: ${e instanceof Error ? e.message : String(e)}`);
      });
    inFlight.current = run;
    return run;
  }, [save]);

  const onUserChange = useCallback(
    (get: () => string) => {
      const id = openIdRef.current;
      if (!id) return;
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = { id, get, timer: setTimeout(runSave, AUTOSAVE_MS) };
      setSaveState("unsaved");
    },
    [runSave],
  );

  /** Save any pending manual edit now, so the model sees it (PRD A5). */
  const flush = useCallback(() => runSave(), [runSave]);

  const openArtifact = useCallback(
    (id: string) => {
      void flush();
      setPanelOpen(true);
      setPreview(null);
      if (openIdRef.current === id && docRef.current) return;
      openIdRef.current = id;
      setOpenId(id);
      setDoc(null);
      reload(id);
    },
    [reload, flush],
  );

  const closePanel = useCallback(() => {
    void flush();
    setPanelOpen(false);
  }, [flush]);

  // ---- versions --------------------------------------------------------------

  const viewVersion = useCallback(
    async (versionNo: number) => {
      const id = openIdRef.current;
      if (!id) return;
      await flush();
      reload(id, versionNo);
    },
    [flush, reload],
  );

  const restoreViewed = useCallback(async () => {
    const current = docRef.current;
    if (!current?.viewing) return;
    const id = current.artifact.id;
    try {
      await fetchJson<VersionDto>(`/api/artifacts/${id}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionNo: current.viewing }),
      });
      await load(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [load]);

  // ---- artifact management (D12, A3) ----------------------------------------

  /** Show an artifact that was just created outside the chat stream (blank, branch). */
  const addArtifact = useCallback(
    (a: ArtifactDto) => {
      setArtifacts((list) => [
        ...list.filter((x) => x.id !== a.id),
        { id: a.id, kind: a.kind, title: a.title, version: a.currentVersion?.versionNo ?? 0 },
      ]);
      openArtifact(a.id);
    },
    [openArtifact],
  );

  const renameOpen = useCallback(async (title: string) => {
    const id = openIdRef.current;
    if (!id || !title.trim()) return;
    try {
      const updated = await fetchJson<ArtifactDto>(`/api/artifacts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      setArtifacts((list) => list.map((a) => (a.id === id ? { ...a, title: updated.title } : a)));
      setDoc((d) => (d && d.artifact.id === id ? { ...d, artifact: { ...d.artifact, title: updated.title } } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const deleteOpen = useCallback(async () => {
    const id = openIdRef.current;
    if (!id) return;
    // Drop any pending autosave for the artifact being deleted.
    if (pending.current?.id === id) {
      clearTimeout(pending.current.timer);
      pending.current = null;
    }
    const res = await fetch(`/api/artifacts/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      setError(await res.text());
      return;
    }
    const rest = artifacts.filter((a) => a.id !== id);
    setArtifacts(rest);
    openIdRef.current = null;
    setOpenId(null);
    setDoc(null);
    // Stay open: the switcher and an empty state show what is left.
    const next = rest.at(-1);
    if (next) openArtifact(next.id);
  }, [artifacts, openArtifact]);

  /** Branch a copy from the version on screen (or the current one). */
  const branchShown = useCallback(async () => {
    const current = docRef.current;
    if (!current?.artifact.currentVersion) return;
    await flush();
    const versionNo = current.viewing ?? current.artifact.currentVersion.versionNo;
    try {
      const copy = await fetchJson<ArtifactDto>(`/api/artifacts/${current.artifact.id}/branch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionNo }),
      });
      addArtifact(copy);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [flush, addArtifact]);

  /** "Ask AI" about selected diagram shapes (G6). */
  const rewriteDiagram = useCallback(
    async (selectedIds: string[], instruction: string, model: string) => {
      const id = openIdRef.current;
      if (!id) return;
      await flush();
      setRewriting(true);
      setError(null);
      try {
        await fetchJson<EditOutput>(`/api/artifacts/${id}/diagram-rewrite`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ selectedIds, instruction, model }),
        });
        await load(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRewriting(false);
      }
    },
    [flush, load],
  );

  /** Redraw the open diagram from edited Mermaid source (G8); saved as a user version. */
  const applyMermaid = useCallback(
    async (mermaid: string): Promise<string | null> => {
      const current = docRef.current;
      if (!current?.artifact.currentVersion) return "Nothing to apply to.";
      await flush();
      try {
        const content = await mermaidToScene(mermaid);
        await fetchJson<VersionDto>(`/api/artifacts/${current.artifact.id}/versions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content, author: "user", baseVersionNo: current.artifact.currentVersion.versionNo }),
        });
        await load(current.artifact.id);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    },
    [flush, load],
  );

  /** Change a code artifact's language (metadata only, not a new version). */
  const setLanguage = useCallback(async (language: string) => {
    const id = openIdRef.current;
    if (!id) return;
    try {
      const updated = await fetchJson<ArtifactDto>(`/api/artifacts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language }),
      });
      setDoc((d) =>
        d && d.artifact.id === id ? { ...d, artifact: { ...d.artifact, language: updated.language } } : d,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  /** The open artifact's saved text, after flushing pending edits. */
  const currentText = useCallback(async () => {
    await flush();
    return docRef.current?.content ?? "";
  }, [flush]);

  /** Reload the open artifact from the server, e.g. after editing its raw Markdown. */
  const reloadOpen = useCallback(async () => {
    await flush();
    const id = openIdRef.current;
    if (id) await load(id);
  }, [flush, load]);

  // ---- highlight-to-edit and quick actions -----------------------------------

  const rewrite = useCallback(
    async (input: { instruction: string; selectedText: string | null; mode: "ask" | "quick"; model: string }) => {
      const id = openIdRef.current;
      if (!id) return;
      await flush();
      setRewriting(true);
      setError(null);
      try {
        await fetchJson<EditOutput>(`/api/artifacts/${id}/rewrite`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        await load(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRewriting(false);
      }
    },
    [flush, load],
  );

  // ---- react to the agent's tool calls ---------------------------------------

  // Tool calls already in the loaded history must not reopen the canvas.
  const handled = useRef<Set<string> | null>(null);
  handled.current ??= toolCallIds(messages);

  useEffect(() => {
    const done = handled.current;
    if (!done) return;
    const last = messages.at(-1);
    for (const m of messages) {
      for (const part of m.parts) {
        if (!isToolUIPart(part) || done.has(part.toolCallId)) continue;
        const name = getToolName(part);

        if (name === "create_code" && (part.state === "input-streaming" || part.state === "input-available")) {
          if (m === last) {
            const input = (part.input ?? {}) as Partial<{ title: string; language: string; code: string }>;
            setPanelOpen(true);
            setOpenId(null);
            openIdRef.current = null;
            setDoc(null);
            setPreview({
              title: input.title ?? "",
              markdown: "```" + (input.language ?? "") + "\n" + (input.code ?? "") + "\n```",
            });
          }
          continue;
        }
        if (name === "create_document" && (part.state === "input-streaming" || part.state === "input-available")) {
          // Stream the draft into the canvas before the tool has run (D3).
          if (m === last) {
            const input = (part.input ?? {}) as Partial<{ title: string; markdown: string }>;
            setPanelOpen(true);
            setOpenId(null);
            openIdRef.current = null;
            setDoc(null);
            setPreview({ title: input.title ?? "", markdown: input.markdown ?? "" });
          }
          continue;
        }
        if (part.state === "output-error") {
          done.add(part.toolCallId);
          setPreview(null);
          continue;
        }
        if (part.state !== "output-available") continue;
        done.add(part.toolCallId);

        if (name === "create_code") {
          const out = part.output as CreateCodeOutput;
          setArtifacts((list) => [
            ...list,
            { id: out.artifactId, kind: "code", title: out.title, version: out.versionNo },
          ]);
          openArtifact(out.artifactId);
        } else if (name === "create_document") {
          const out = part.output as CreateDocumentOutput;
          setArtifacts((list) => [
            ...list,
            { id: out.artifactId, kind: "document", title: out.title, version: out.versionNo },
          ]);
          openArtifact(out.artifactId);
        } else if (name === "create_diagram") {
          const out = part.output as CreateDiagramOutput;
          setArtifacts((list) => [...list, { id: out.artifactId, kind: "diagram", title: out.title, version: 0 }]);
          openIdRef.current = out.artifactId;
          setOpenId(out.artifactId);
          setDoc(null);
          setPanelOpen(true);
          setPreview(null);
          convertDiagram(out)
            .then(() => reload(out.artifactId))
            .catch((e: unknown) =>
              setError(`Could not draw the diagram: ${e instanceof Error ? e.message : String(e)}`),
            );
        } else if (name === "edit_document" || name === "update_diagram" || name === "rewrite_selection") {
          const out = part.output as EditOutput;
          setArtifacts((list) => list.map((a) => (a.id === out.artifactId ? { ...a, version: out.versionNo } : a)));
          if (openIdRef.current === out.artifactId) reload(out.artifactId);
          else openArtifact(out.artifactId);
          setPanelOpen(true);
        }
      }
    }
  }, [messages, openArtifact, convertDiagram, reload]);

  return {
    artifacts,
    openId,
    openIdRef,
    panelOpen,
    closePanel,
    preview,
    doc,
    error,
    rewriting,
    saveState,
    openArtifact,
    onUserChange,
    flush,
    viewVersion,
    restoreViewed,
    rewrite,
    addArtifact,
    renameOpen,
    deleteOpen,
    branchShown,
    currentText,
    reloadOpen,
    setLanguage,
    rewriteDiagram,
    applyMermaid,
  };
}

export type Canvas = ReturnType<typeof useCanvas>;
