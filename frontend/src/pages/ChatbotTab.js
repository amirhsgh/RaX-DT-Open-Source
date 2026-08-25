import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Send, Bot, User, Plus, X, FileText, Loader2, CheckCircle2,
  AlertCircle, Clock, Activity, Dna, FlaskConical, Target, HelpCircle,
  MessageSquarePlus, MessagesSquare, Trash2
} from 'lucide-react';
import apiService from '../services/apiService';

const MAX_MESSAGES = 100;
const JOB_POLL_MS = 5000;

const FILE_KIND_META = {
  protein: { label: 'Receptor', icon: Dna, cls: 'text-chart-1' },
  ligand: { label: 'Compounds', icon: FlaskConical, cls: 'text-chart-2' },
  ref_ligand: { label: 'Binding-site marker', icon: Target, cls: 'text-chart-3' },
};

const ACTIVE_JOB_STATUSES = ['pending', 'running', 'paused'];

const STATUS_META = {
  running: { icon: Loader2, cls: 'text-chart-1', spin: true, label: 'Running' },
  pending: { icon: Clock, cls: 'text-muted-foreground', label: 'Queued' },
  paused: { icon: Clock, cls: 'text-chart-3', label: 'Paused' },
  completed: { icon: CheckCircle2, cls: 'text-chart-1', label: 'Completed' },
  failed: { icon: AlertCircle, cls: 'text-destructive', label: 'Failed' },
  cancelled: { icon: X, cls: 'text-muted-foreground', label: 'Cancelled' },
};

const WELCOME = `👋 Hi — I'm your Virtual Screening Assistant.

I can actually run things for you, not just explain them:

**1. Give me your compounds** — attach a file (press **+** or drag it in).

**2. Give me a receptor** — attach a structure file (.pdb / .pdbqt).
Optionally add the known bound ligand too; that centres the search on the real pocket.

**3. Ask me to run it** — I'll show you exactly what I'm about to use and wait
for your go-ahead before spending any compute.

The job then appears in the panel on the right and updates itself.

What would you like to do?`;

const newConversation = (userId) => ({
  id: `session_${userId || 'guest'}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  title: 'New chat',
  createdAt: new Date().toISOString(),
  messages: [{ id: Date.now(), type: 'ai', content: WELCOME, timestamp: new Date().toISOString() }],
});

/** Minimal formatter: **bold** and blank lines. Avoids a markdown dependency. */
const renderRich = (text) =>
  String(text).split('\n').map((line, i) => (
    <div key={i} className={line.trim() === '' ? 'h-2' : ''}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
        ) : (
          <span key={j}>{part}</span>
        )
      )}
    </div>
  ));

const ChatbotTab = ({ user }) => {
  const storageKey = `vs_chats_${user?.id || 'guest'}`;

  // All conversations live together; each keeps its own server session id, so
  // the files staged in one chat never leak into another.
  const [conversations, setConversations] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(stored) && stored.length) return stored;
    } catch { /* corrupt history should not break the page */ }
    return [newConversation(user?.id)];
  });
  const [activeId, setActiveId] = useState(() => null);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) || conversations[0],
    [conversations, activeId]
  );
  const sessionId = active?.id;
  const messages = active?.messages || [];

  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState({ protein: [], ligand: [], ref_ligand: [] });
  const [uploading, setUploading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [dragging, setDragging] = useState(false);

  const endRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(conversations.map((c) => ({ ...c, messages: c.messages.slice(-MAX_MESSAGES) })))
      );
    } catch { /* quota full - history is a convenience */ }
  }, [conversations, storageKey]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [inputValue]);

  const patchActive = useCallback((patch) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === sessionId ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c))
    );
  }, [sessionId]);

  const addMessage = useCallback((msg) => {
    patchActive((c) => ({
      messages: [...c.messages, { id: Date.now() + Math.random(), timestamp: new Date().toISOString(), ...msg }],
    }));
  }, [patchActive]);

  const refreshJobs = useCallback(async () => {
    try {
      const res = await apiService.getJobs(0, 20);
      setJobs(res?.jobs || res?.items || []);
    } catch { /* informational panel; a failed poll should stay quiet */ }
  }, []);

  const refreshFiles = useCallback(async () => {
    if (!sessionId) return;
    try { setFiles(await apiService.getChatFiles(sessionId)); }
    catch { /* same */ }
  }, [sessionId]);

  useEffect(() => {
    refreshJobs();
    const t = setInterval(refreshJobs, JOB_POLL_MS);
    return () => clearInterval(t);
  }, [refreshJobs]);

  // Switching chats swaps which staged files are shown.
  useEffect(() => { refreshFiles(); }, [refreshFiles]);

  const handleUpload = async (fileList) => {
    const chosen = Array.from(fileList || []);
    if (!chosen.length) return;
    setUploading(true);
    setError(null);
    for (const f of chosen) {
      try {
        const res = await apiService.uploadChatFile(sessionId, f);
        addMessage({
          type: 'system',
          content: `Attached **${res.filename}** — recognised as your **${res.detected_label}**${
            res.molecule_count ? ` (${res.molecule_count} molecules)` : ''
          }.`,
        });
      } catch (e) {
        addMessage({ type: 'system', isError: true, content: `Couldn't attach **${f.name}** — ${e.message}` });
      }
    }
    setUploading(false);
    refreshFiles();
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    addMessage({ type: 'user', content: text });
    // Name the conversation after the first thing the user actually asked.
    if (active && active.title === 'New chat') {
      patchActive({ title: text.length > 38 ? `${text.slice(0, 38)}…` : text });
    }
    setInputValue('');
    setSending(true);
    setError(null);

    try {
      const res = await apiService.sendChatMessage(sessionId, text);
      // `actions` is verified against the database by the backend, never
      // parsed from the reply text - so a job card cannot show a run that
      // does not exist.
      addMessage({ type: 'ai', content: res.response, startedJob: res.actions?.started_job });
      refreshJobs();
      refreshFiles();
    } catch (e) {
      setError(e.message);
      addMessage({ type: 'ai', isError: true, content: 'Sorry — I hit an error handling that. Please try again.' });
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Depth counting: dragenter/leave fire per child element, so a plain boolean
  // flickers as the pointer crosses the drop zone.
  const onDragEnter = (e) => { e.preventDefault(); dragDepth.current += 1; setDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) setDragging(false); };
  const onDrop = (e) => { e.preventDefault(); dragDepth.current = 0; setDragging(false); handleUpload(e.dataTransfer.files); };

  const startNewChat = () => {
    const c = newConversation(user?.id);
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    setFiles({ protein: [], ligand: [], ref_ligand: [] });
    setInputValue('');
    setError(null);
  };

  const deleteChat = (id, e) => {
    e.stopPropagation();
    setConversations((prev) => {
      const rest = prev.filter((c) => c.id !== id);
      const next = rest.length ? rest : [newConversation(user?.id)];
      if (id === (activeId || prev[0]?.id)) setActiveId(next[0].id);
      return next;
    });
  };

  const attachedCount = Object.values(files).reduce((n, arr) => n + (arr?.length || 0), 0);
  const activeJobs = jobs.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status));
  const doneJobs = jobs.filter((j) => !ACTIVE_JOB_STATUSES.includes(j.status)).slice(0, 5);

  return (
    <div
      className="flex h-[calc(100vh-140px)] gap-4 px-4 pb-6"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/* ---------------- Chat column ---------------- */}
      <div className="relative flex flex-1 flex-col min-w-0">
        {dragging && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
            <div className="text-center">
              <Plus className="mx-auto mb-2 h-8 w-8 text-primary" />
              <p className="font-medium text-foreground">Drop your file here</p>
              <p className="text-sm text-muted-foreground">Receptor, compounds, or a bound ligand — I'll work out which</p>
            </div>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="h-5 w-5 shrink-0 text-primary" />
            <h2 className="truncate text-base font-semibold text-foreground">
              {active?.title === 'New chat' ? 'Screening Assistant' : active?.title}
            </h2>
          </div>
          <button
            onClick={startNewChat}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Start a new chat (files stay with the old one)"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            New chat
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-2">
          {messages.map((m) => {
            if (m.type === 'system') {
              return (
                <div key={m.id} className="flex justify-center">
                  <div
                    className={`flex max-w-[85%] items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                      m.isError
                        ? 'border-destructive/30 bg-destructive/10 text-destructive'
                        : 'border-border bg-muted/60 text-muted-foreground'
                    }`}
                  >
                    {m.isError ? <AlertCircle className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
                    <span className="min-w-0">{renderRich(m.content)}</span>
                  </div>
                </div>
              );
            }

            const isUser = m.type === 'user';
            return (
              <div key={m.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.isError ? 'bg-destructive' : 'bg-primary'}`}>
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : m.isError
                        ? 'rounded-bl-sm border border-destructive/20 bg-destructive/10 text-foreground'
                        : 'rounded-bl-sm border border-border bg-card text-card-foreground'
                  }`}
                >
                  {renderRich(m.content)}
                  {m.startedJob && (
                    <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-chart-1/40 bg-chart-1/10 px-3 py-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-chart-1" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-foreground">
                          Run started: {m.startedJob.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {m.startedJob.total_ligands || 0} compounds · confirmed running
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <User className="h-4 w-4 text-secondary-foreground" />
                  </div>
                )}
              </div>
            );
          })}

          {sending && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Working on it…</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 shrink-0 hover:opacity-70">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ---------------- Prompt box ---------------- */}
        <div className="mt-3">
          <div className="rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm transition-colors focus-within:border-primary/50">
            {/* Scrollbar hidden rather than styled: a native one renders arrow
                buttons inside the box on Windows and breaks the single surface. */}
            <textarea
              ref={inputRef}
              rows={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={sending}
              placeholder="Ask me to dock your compounds…"
              className="block max-h-[200px] w-full resize-none overflow-y-auto border-0 bg-transparent px-1 py-1 text-[15px] leading-6 text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground focus:border-0 focus:outline-none focus:ring-0 disabled:opacity-60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            />

            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  title="Attach a receptor, compound set, or bound ligand"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-4 w-4" />}
                </button>
                {attachedCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {attachedCount} file{attachedCount > 1 ? 's' : ''} attached
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <span className="hidden text-[11px] text-muted-foreground sm:inline">⏎ send · ⇧⏎ newline</span>
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || sending}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
                  title="Send"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdb,.pdbqt,.sdf,.mol,.mol2,.smi,.smiles"
            className="hidden"
            onChange={(e) => { handleUpload(e.target.files); e.target.value = ''; }}
          />
        </div>
      </div>

      {/* ---------------- Right sidebar ---------------- */}
      <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto lg:flex">
        {/* Running jobs */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Activity className="h-4 w-4 text-primary" />
            Running jobs
          </h3>

          {activeJobs.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Nothing running. Add compounds and a receptor, then ask me to start a run.
            </p>
          ) : (
            <div className="space-y-3">
              {activeJobs.map((job) => {
                const meta = STATUS_META[job.status] || STATUS_META.pending;
                const Icon = meta.icon;
                const pct = Math.round(job.progress_percentage || 0);
                return (
                  <div key={job.id} className="rounded-lg border border-border bg-background p-3">
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground" title={job.name}>{job.name}</span>
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.cls} ${meta.spin ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                      <span>{meta.label}</span>
                      <span>{pct}%{job.total_ligands ? ` · ${job.processed_ligands || 0}/${job.total_ligands}` : ''}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {doneJobs.length > 0 && (
            <>
              <h4 className="mb-2 mt-4 text-xs font-medium text-muted-foreground">Recent</h4>
              <div className="space-y-1.5">
                {doneJobs.map((job) => {
                  const meta = STATUS_META[job.status] || STATUS_META.pending;
                  const Icon = meta.icon;
                  return (
                    <div key={job.id} className="flex items-center gap-2 text-xs">
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.cls}`} />
                      <span className="flex-1 truncate text-muted-foreground" title={job.name}>{job.name}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* Files staged in THIS chat */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 text-primary" />
            This chat's files
          </h3>
          {attachedCount === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Nothing yet. Press <strong className="text-foreground">+</strong>, or drag a file in.
            </p>
          ) : (
            <div className="space-y-3">
              {Object.entries(FILE_KIND_META).map(([kind, meta]) => {
                const list = files[kind] || [];
                if (!list.length) return null;
                const Icon = meta.icon;
                return (
                  <div key={kind}>
                    <div className="mb-1 flex items-center gap-1.5">
                      <Icon className={`h-3.5 w-3.5 ${meta.cls}`} />
                      <span className="text-xs font-medium text-foreground">{meta.label}</span>
                    </div>
                    {list.map((name) => (
                      <div key={name} className="truncate pl-5 text-[11px] text-muted-foreground" title={name}>{name}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {attachedCount > 0 && !files.ref_ligand?.length && (
            <p className="mt-3 rounded-md border border-chart-3/30 bg-chart-3/10 px-2 py-1.5 text-[11px] leading-relaxed text-foreground">
              Tip: adding the known bound ligand lets me centre the search on the real binding pocket.
            </p>
          )}
        </section>

        {/* Conversations */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessagesSquare className="h-4 w-4 text-primary" />
            Chats
          </h3>
          <div className="space-y-1">
            {conversations.map((c) => {
              const isActive = c.id === (active?.id);
              return (
                <div
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  <span className="flex-1 truncate" title={c.title}>{c.title}</span>
                  <button
                    onClick={(e) => deleteChat(c.id, e)}
                    title="Delete this chat"
                    className="shrink-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <HelpCircle className="h-4 w-4 text-primary" />
            What I can do
          </h3>
          <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <li>• Recognise your files without you labelling them</li>
            <li>• Start a docking run once you confirm</li>
            <li>• Report how a run is going, in plain language</li>
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            I always show you what I'm about to run and wait for your go-ahead.
          </p>
        </section>
      </aside>
    </div>
  );
};

export default ChatbotTab;
