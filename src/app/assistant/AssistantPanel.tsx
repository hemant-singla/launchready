// "Ask LaunchReady": a chat panel that answers questions about the plan by
// calling tools over the live workspace. It can offer changes (a what-if, a
// recovery approval) as buttons; only the user's click applies them.
//
// Two modes: Claude (through the proxy, or the visitor's own key) and free
// mode, the default without either, which answers common questions straight
// from the plan with no AI (agent/offline.ts).
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type Anthropic from '@anthropic-ai/sdk';
import { ArrowUp, Check, ChevronRight, KeyRound, Loader2, RotateCcw, Sparkles, Square, Wrench, X } from 'lucide-react';
import { runTurn, type TurnEnd } from '../../agent/loop';
import { runAssistantTool, type AgentContext, type Proposal, type ToolOutcome } from '../../agent/runAssistantTool';
import { answerOffline } from '../../agent/offline';
import { recoveryOptions } from '../../engine/recovery';
import { useWorkspace, type Workspace } from '../state/workspace';
import { useToast } from '../components/useToast';
import { Markdown } from './Markdown';
import { createStream, describeError, forgetKey, PROXY_URL, saveKey, savedConnection, type Connection } from './connection';

type Part =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; name: string; input: unknown; outcome?: ToolOutcome }
  | { kind: 'proposal'; id: string; proposal: Proposal; status: 'pending' | 'done' | 'dismissed' };
type Turn = { role: 'user'; text: string } | { role: 'assistant'; parts: Part[]; end?: TurnEnd | 'error'; error?: string };

const TOOL_LABEL: Record<string, string> = {
  get_plan_overview: 'Read the plan',
  get_launch_details: 'Looked up a launch',
  get_platform_software: 'Checked a platform',
  get_part_supply: 'Checked a part',
  find_shipments: 'Searched shipments',
  simulate_what_if: 'Simulated a what-if',
  get_recovery_options: 'Ran the recovery search',
  explain_rules: 'Read the rules',
  propose_what_if: 'Prepared a what-if',
  propose_recovery: 'Prepared an approval',
};

const END_NOTE: Partial<Record<TurnEnd, string>> = {
  refusal: "I can't help with that one. Try asking about the launch plan.",
  max_tokens: 'The answer was cut off. Ask me to continue or narrow the question.',
  round_limit: 'That needed more lookups than one answer allows. Try a narrower question.',
};

/** The note each question starts with, so the model knows the current state. */
function stateNote(ws: Workspace, view: string): string {
  const d = ws.disruptions.length ? ws.disruptions.join(' | ') : 'none (original plan)';
  return `[App state] Disruptions: ${d}. Approved recovery actions: ${ws.state.decisions.actions.length}. User is viewing: ${view}.`;
}

function suggestions(ws: Workspace): string[] {
  const hit = ws.affected.models.map((id) => ws.result.models.find((m) => m.id === id)!.name);
  if (hit.length) {
    return [`Why is ${hit[0]} at risk now?`, 'What are my options to recover, and which do you recommend?', 'What happens if we do nothing?', 'Which teams need to act, and by when?'];
  }
  return [
    'Which launches need attention right now, and why?',
    'What happens if the USB 3.2 controller shipment for Volga-X is 5 weeks late?',
    'Why are the Zenith 55" and 65" at risk?',
    'How is the software-ready date calculated?',
  ];
}

export default function AssistantPanel({ open, onClose, view }: { open: boolean; onClose: () => void; view: string }) {
  const ws = useWorkspace();
  const toast = useToast();
  const [conn, setConn] = useState<Connection | null>(() => savedConnection());
  const [connecting, setConnecting] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<Anthropic.Beta.BetaMessageParam[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const wsRef = useRef(ws);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Tools always read the workspace as it is when they run.
  useEffect(() => { wsRef.current = ws; }, [ws]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [turns]);

  const updateLast = (fn: (parts: Part[]) => Part[], patch: Partial<Extract<Turn, { role: 'assistant' }>> = {}) =>
    setTurns((t) => {
      const last = t.at(-1);
      if (!last || last.role !== 'assistant') return t;
      return [...t.slice(0, -1), { ...last, ...patch, parts: fn(last.parts) }];
    });

  const agentContext = (): AgentContext => {
    const w = wsRef.current;
    return { base: w.base, baseline: w.baseline, state: { scenarios: w.state.scenarios, lab: w.state.lab, actions: w.state.decisions.actions } };
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setDraft('');
    if (!conn) {
      // Free mode: answer from the plan directly, no model call.
      const a = answerOffline(q, agentContext());
      const parts: Part[] = [
        ...a.steps.filter((st) => !st.outcome.proposal).map((st): Part => ({ kind: 'tool', id: st.id, name: st.name, input: st.input, outcome: st.outcome })),
        { kind: 'text', text: a.text },
        ...a.steps.filter((st) => st.outcome.proposal).map((st): Part => ({ kind: 'proposal', id: st.id, proposal: st.outcome.proposal!, status: 'pending' })),
      ];
      setTurns((t) => [...t, { role: 'user', text: q }, { role: 'assistant', parts, end: 'answered' }]);
      return;
    }
    setBusy(true);
    setTurns((t) => [...t, { role: 'user', text: q }, { role: 'assistant', parts: [] }]);
    const controller = new AbortController();
    abort.current = controller;
    const userMsg: Anthropic.Beta.BetaMessageParam = { role: 'user', content: [{ type: 'text', text: `${stateNote(wsRef.current, view)}\n\n${q}` }] };
    try {
      const r = await runTurn([...history, userMsg], createStream(conn, controller.signal), (name, input) => runAssistantTool(name, input, agentContext()), {
        onText: (delta) => updateLast((parts) => {
          const last = parts.at(-1);
          return last?.kind === 'text' ? [...parts.slice(0, -1), { ...last, text: last.text + delta }] : [...parts, { kind: 'text', text: delta }];
        }),
        onToolStart: (call) => updateLast((parts) => [...parts, { kind: 'tool', id: call.id, name: call.name, input: call.input }]),
        onToolEnd: (call) => updateLast((parts) => {
          const next = parts.map((p) => (p.kind === 'tool' && p.id === call.id ? { ...p, outcome: call.outcome } : p));
          return call.outcome.proposal ? [...next, { kind: 'proposal', id: call.id, proposal: call.outcome.proposal, status: 'pending' }] : next;
        }),
      });
      setHistory(r.messages);
      updateLast((p) => p, { end: r.end });
    } catch (err) {
      updateLast((p) => p, { end: 'error', error: describeError(err, conn) });
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };

  const applyProposal = (id: string, proposal: Proposal) => {
    const w = wsRef.current;
    if (proposal.kind === 'what-if') {
      w.setLab(proposal.lab);
      toast(`Applied: ${proposal.summary}`);
    } else {
      const opt = recoveryOptions(w.baseline, w.disrupted, w.state.decisions.actions).options.find((o) => o.key === proposal.optionKey);
      if (!opt) {
        toast('That option no longer applies to the current plan');
        return;
      }
      const restored = opt.models.filter((m) => m.restored).map((m) => m.name);
      w.approve(opt, restored.length ? `${restored.join(', ')} back on plan (approved from the assistant)` : 'Partial improvement (approved from the assistant)');
      toast(`Approved: ${proposal.summary}`, { label: 'Undo', run: w.undo });
    }
    setTurns((t) => t.map((turn) => (turn.role === 'assistant' ? { ...turn, parts: turn.parts.map((p) => (p.kind === 'proposal' && p.id === id ? { ...p, status: 'done' } : p)) } : turn)));
  };
  const dismissProposal = (id: string) =>
    setTurns((t) => t.map((turn) => (turn.role === 'assistant' ? { ...turn, parts: turn.parts.map((p) => (p.kind === 'proposal' && p.id === id ? { ...p, status: 'dismissed' } : p)) } : turn)));

  const clear = () => {
    abort.current?.abort();
    setTurns([]);
    setHistory([]);
  };

  const ideas = useMemo(() => suggestions(ws), [ws]);

  return (
    <aside className={`assistant${open ? ' open' : ''}`} aria-label="Ask LaunchReady" aria-hidden={!open} inert={!open}>
      <header className="assistant-head">
        <Sparkles size={16} className="accent" />
        <h2>Ask LaunchReady</h2>
        <span className={`badge ${conn ? 'accent' : 'neutral'}`} title={conn ? 'Answers written by Claude' : 'Answers built from the plan, no AI'}>{conn ? 'Claude' : 'Free mode'}</span>
        <span style={{ flex: 1 }} />
        {turns.length > 0 && <button className="btn ghost sm icon" onClick={clear} aria-label="New conversation" title="New conversation"><RotateCcw size={15} /></button>}
        {conn?.mode === 'key' && <button className="btn ghost sm icon" onClick={() => { forgetKey(); setConn(null); clear(); }} aria-label="Forget API key and use free mode" title="Forget API key and use free mode"><KeyRound size={15} /></button>}
        <button className="btn ghost sm icon" onClick={onClose} aria-label="Close assistant"><X size={16} /></button>
      </header>

      {connecting ? (
        <ConnectForm onConnect={(key) => { setConn(saveKey(key)); setConnecting(false); clear(); }} onCancel={() => setConnecting(false)} />
      ) : (
        <>
          <div className="assistant-body" ref={listRef} aria-live="polite">
            {turns.length === 0 && (
              <div className="assistant-empty">
                <p>Ask about any launch, part, platform or what-if. I look everything up in the plan you're viewing, including any disruption you've applied, and I can set up a what-if or an approval for you to confirm.</p>
                {!conn && <p className="faint" style={{ fontSize: 13, marginTop: 8 }}>Free mode answers common questions instantly from the plan, with no AI and no cost.</p>}
                <div className="assistant-ideas">
                  {ideas.map((s) => <button key={s} className="chip idea" onClick={() => void ask(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {turns.map((t, i) =>
              t.role === 'user' ? (
                <div key={i} className="bubble user">{t.text}</div>
              ) : (
                <div key={i} className="bubble assistant-msg">
                  {t.parts.map((p, j) => {
                    if (p.kind === 'text') return <Markdown key={j} text={p.text} />;
                    if (p.kind === 'tool') return <ToolChip key={j} part={p} />;
                    return <ProposalCard key={j} part={p} onApply={() => applyProposal(p.id, p.proposal)} onDismiss={() => dismissProposal(p.id)} />;
                  })}
                  {busy && i === turns.length - 1 && <span className="typing"><Loader2 size={14} className="spin" /> Working…</span>}
                  {t.end && END_NOTE[t.end as TurnEnd] && <p className="assistant-note">{END_NOTE[t.end as TurnEnd]}</p>}
                  {t.end === 'error' && (
                    <p className="assistant-note error">
                      {t.error}{' '}
                      {t.error !== 'Stopped.' && <button className="linklike" onClick={() => { const q = turns[i - 1]; if (q?.role === 'user') { setTurns((all) => all.slice(0, i - 1)); void ask(q.text); } }}>Retry</button>}
                    </p>
                  )}
                </div>
              ),
            )}
          </div>
          <form className="assistant-input" onSubmit={submit}>
            <textarea
              ref={inputRef}
              rows={2}
              value={draft}
              placeholder="Ask about the plan…"
              aria-label="Ask a question"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(draft); }
                if (e.key === 'Escape') onClose();
              }}
              maxLength={1000}
            />
            {busy ? (
              <button type="button" className="btn icon" onClick={() => abort.current?.abort()} aria-label="Stop answering"><Square size={14} /></button>
            ) : (
              <button type="submit" className="btn primary icon" disabled={!draft.trim()} aria-label="Send"><ArrowUp size={16} /></button>
            )}
          </form>
          <p className="assistant-foot">
            {conn ? (
              <>AI answers can be wrong; numbers come from the app's engine, and changes only happen when you click.</>
            ) : (
              <>Free mode: answers come straight from the plan, no AI. For open-ended questions, <button className="linklike" onClick={() => setConnecting(true)}>use Claude with your own API key</button>.</>
            )}
          </p>
        </>
      )}
    </aside>
  );
}

function ToolChip({ part }: { part: Extract<Part, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false);
  const failed = part.outcome?.isError;
  const arg = Object.values((part.input ?? {}) as Record<string, unknown>).filter((v) => typeof v === 'string' && v).join(' · ');
  return (
    <div className={`tool-chip${failed ? ' failed' : ''}`}>
      <button className="tool-chip-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {part.outcome ? (failed ? <X size={12} /> : <Wrench size={12} />) : <Loader2 size={12} className="spin" />}
        <span>{TOOL_LABEL[part.name] ?? part.name}</span>
        {arg && <span className="faint">{arg}</span>}
        <ChevronRight size={12} className="chev" style={{ transform: open ? 'rotate(90deg)' : undefined }} />
      </button>
      {open && <pre className="tool-chip-body">{JSON.stringify({ input: part.input, result: part.outcome?.result }, null, 2)}</pre>}
    </div>
  );
}

function ProposalCard({ part, onApply, onDismiss }: { part: Extract<Part, { kind: 'proposal' }>; onApply: () => void; onDismiss: () => void }) {
  const p = part.proposal;
  return (
    <div className={`proposal ${part.status}`}>
      <div className="proposal-kind">{p.kind === 'what-if' ? 'Apply this what-if?' : 'Approve this recovery?'}</div>
      <div className="proposal-text">{p.summary}</div>
      {part.status === 'pending' ? (
        <div className="proposal-actions">
          <button className="btn primary sm" onClick={onApply}>{p.kind === 'what-if' ? 'Apply' : 'Approve'}</button>
          <button className="btn ghost sm" onClick={onDismiss}>Not now</button>
        </div>
      ) : (
        <div className="faint" style={{ fontSize: 12 }}>{part.status === 'done' ? <><Check size={12} /> Done. Every view is updated.</> : 'Dismissed.'}</div>
      )}
    </div>
  );
}

function ConnectForm({ onConnect, onCancel }: { onConnect: (key: string) => void; onCancel: () => void }) {
  const [key, setKey] = useState('');
  return (
    <form className="assistant-connect" onSubmit={(e) => { e.preventDefault(); if (key.trim()) onConnect(key.trim()); }}>
      <Sparkles size={24} className="accent" />
      <h3>Use Claude</h3>
      <p className="muted">
        {PROXY_URL ? '' : 'Free mode handles common questions. '}
        For open-ended questions, paste an Anthropic API key. It stays in this browser tab and is sent only to Anthropic.
      </p>
      <input className="input" type="password" autoComplete="off" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Anthropic API key" />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" type="submit" disabled={!key.trim()}>Connect</button>
        <button className="btn ghost" type="button" onClick={onCancel}>Back to free mode</button>
      </div>
      <p className="faint" style={{ fontSize: 12 }}>Each question costs your API account a fraction of a cent to a few cents.</p>
    </form>
  );
}
