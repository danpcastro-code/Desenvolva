// components/PublicFormResponder.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.config';
import { FormularioInstance, FormularioTemplate } from '../types';
import { getFormularioInstanceByToken } from '../services/firebaseService';

const MAX_NOTAS_5 = 10;

const ANCHOR_STYLES: Record<number, { bg: string; border: string; labelColor: string; descColor: string; btnActive: string; btnShadow: string }> = {
  1: { bg: 'bg-red-50',    border: 'border-red-300',    labelColor: 'text-red-800',    descColor: 'text-red-700',    btnActive: 'bg-red-500 border-red-500',       btnShadow: 'shadow-red-100' },
  2: { bg: 'bg-amber-50',  border: 'border-amber-300',  labelColor: 'text-amber-800',  descColor: 'text-amber-700',  btnActive: 'bg-amber-500 border-amber-500',   btnShadow: 'shadow-amber-100' },
  3: { bg: 'bg-green-50',  border: 'border-green-300',  labelColor: 'text-green-800',  descColor: 'text-green-700',  btnActive: 'bg-green-600 border-green-600',   btnShadow: 'shadow-green-100' },
  4: { bg: 'bg-blue-50',   border: 'border-blue-300',   labelColor: 'text-blue-800',   descColor: 'text-blue-700',   btnActive: 'bg-blue-600 border-blue-600',     btnShadow: 'shadow-blue-100' },
  5: { bg: 'bg-indigo-50', border: 'border-indigo-300', labelColor: 'text-indigo-800', descColor: 'text-indigo-700', btnActive: 'bg-indigo-600 border-indigo-600', btnShadow: 'shadow-indigo-100' },
};

const SCALE_LABELS = ['Irrelevante', 'Pouco importante', 'Moderadamente importante', 'Muito importante', 'Crítico / Essencial'];

type PageState = 'loading' | 'not_found' | 'already_done' | 'form' | 'submitted';

const CONTEXT_QUESTION_IDS = ['q_contexto_equipe', 'q_contexto_maturidade'];

const PublicFormResponder: React.FC = () => {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [instance, setInstance] = useState<FormularioInstance | null>(null);
  const [template, setTemplate] = useState<FormularioTemplate | null>(null);
  const [responses, setResponses] = useState<Record<string, string | string[]>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [limitAlert, setLimitAlert] = useState<string | null>(null);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const instanceRef = useRef<FormularioInstance | null>(null);

  const token = useMemo(() => new URLSearchParams(window.location.search).get('token'), []);

  useEffect(() => {
    if (!token) { setPageState('not_found'); return; }

    const load = async () => {
      try {
        const inst = await getFormularioInstanceByToken(token);
        if (!inst) { setPageState('not_found'); return; }
        if (inst.status === 'Concluído') { setPageState('already_done'); return; }

        const tplDoc = await getDoc(doc(db, 'form_templates', inst.templateId));
        if (!tplDoc.exists()) { setPageState('not_found'); return; }

        instanceRef.current = inst;
        setInstance(inst);
        setResponses(inst.responses || {});
        setTemplate({ id: tplDoc.id, ...tplDoc.data() } as FormularioTemplate);
        setPageState('form');
      } catch {
        setPageState('not_found');
      }
    };

    load();
  }, [token]);

  const scheduleAutoSave = (newResponses: Record<string, string | string[]>) => {
    if (!instanceRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (!instanceRef.current) return;
      try {
        await updateDoc(doc(db, 'form_instances', instanceRef.current.id), {
          responses: newResponses,
          updatedAt: serverTimestamp(),
        });
      } catch { /* silently ignore */ }
    }, 2500);
  };

  const countNotas5 = useMemo(() => {
    if (!template) return 0;
    return template.questions
      .filter(q => q.type === 'scale')
      .filter(q => !CONTEXT_QUESTION_IDS.includes(q.id))
      .filter(q => responses[q.id] === '5')
      .length;
  }, [responses, template]);

  const handleScale = (qId: string, val: string) => {
    if (val === '5' && responses[qId] !== '5' && countNotas5 >= MAX_NOTAS_5 && !CONTEXT_QUESTION_IDS.includes(qId)) {
      setLimitAlert(`Você já atingiu o limite de ${MAX_NOTAS_5} competências "Crítico / Essencial". Para marcar esta, remova a nota 5 de outra.`);
      setTimeout(() => setLimitAlert(null), 5000);
      return;
    }
    setLimitAlert(null);
    const next = { ...responses, [qId]: val };
    setResponses(next);
    scheduleAutoSave(next);
  };

  const handleText = (qId: string, val: string) => {
    const next = { ...responses, [qId]: val };
    setResponses(next);
    scheduleAutoSave(next);
  };
  const handleJust = (qId: string, val: string) => {
    const next = { ...responses, [`${qId}_justification`]: val };
    setResponses(next);
    scheduleAutoSave(next);
  };
  const handleList = (qId: string, idx: number, val: string) => {
    const list = Array.isArray(responses[qId]) ? [...(responses[qId] as string[])] : [];
    list[idx] = val;
    const next = { ...responses, [qId]: list };
    setResponses(next);
    scheduleAutoSave(next);
  };

  const handleSubmit = async () => {
    if (!instance) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'form_instances', instance.id), {
        responses,
        status: 'Concluído',
        updatedAt: serverTimestamp(),
      });
      setPageState('submitted');
    } catch {
      alert('Erro ao enviar as respostas. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const pageWrapper = (children: React.ReactNode) => (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f8fafc; color: #0f172a; font-family: 'DM Sans', sans-serif; }
        input, textarea, select { color: #0f172a !important; background-color: #ffffff !important; border: 1px solid #cbd5e1 !important; }
        input::placeholder, textarea::placeholder { color: #94a3b8 !important; }
        input:focus, textarea:focus, select:focus { outline: none !important; border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.12) !important; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        @keyframes pfr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pfr-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
      `}</style>
      <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(99,102,241,0.3)', flexShrink: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>D+</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>Desenvolva+ ColaboraGOV</div>
            <div style={{ fontSize: 10, fontWeight: 500, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>SSC / MGI</div>
          </div>
        </div>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 16px 64px' }}>
          {children}
        </div>
      </div>
    </>
  );

  if (pageState === 'loading') {
    return pageWrapper(
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 6 }}>
        {[0, 150, 300].map(delay => (
          <div key={delay} style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', animation: `pfr-bounce 0.9s ${delay}ms infinite` }} />
        ))}
        <span style={{ marginLeft: 10, fontSize: 14, color: '#94a3b8' }}>Carregando formulário...</span>
      </div>
    );
  }

  if (pageState === 'not_found' || pageState === 'already_done') {
    const isAlreadyDone = pageState === 'already_done';
    return pageWrapper(
      <div style={{ textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>{isAlreadyDone ? '✅' : '🔗'}</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>
          {isAlreadyDone ? 'Formulário já respondido' : 'Formulário não encontrado'}
        </h2>
        <p style={{ color: '#64748b', fontSize: 15, maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
          {isAlreadyDone
            ? 'Este formulário já foi respondido e não está mais disponível para preenchimento.'
            : 'O link que você acessou é inválido ou este formulário não está mais disponível.'}
        </p>
      </div>
    );
  }

  if (pageState === 'submitted') {
    return pageWrapper(
      <div style={{ textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 10px', letterSpacing: '-0.02em' }}>Obrigado pela sua contribuição!</h2>
        <p style={{ color: '#64748b', fontSize: 15, maxWidth: 440, margin: '0 auto 24px', lineHeight: 1.6 }}>
          Suas respostas foram registradas com sucesso e serão analisadas pela equipe responsável.
        </p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#15803d', fontSize: 13, fontWeight: 600 }}>
          <span>✓</span> Respostas salvas com sucesso
        </div>
      </div>
    );
  }

  if (!template || !instance) return null;

  const scaleQuestions = template.questions.filter(q => q.type === 'scale');
  const answered = scaleQuestions.filter(q => responses[q.id]).length;
  const pct = scaleQuestions.length > 0 ? Math.round((answered / scaleQuestions.length) * 100) : 0;

  return pageWrapper(
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-0.02em' }}>{template.name}</h1>
        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
          {instance.type === 'cargo'
            ? `Mapeamento para o cargo: ${instance.cargoName}`
            : `Avaliação de: ${instance.pessoaName}`}
        </p>
      </div>

      <div style={{ background: '#ffffff', borderRadius: 24, border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        {/* Progresso */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>
            <span>Progresso do preenchimento</span>
            <span style={{ color: '#6366f1' }}>{pct}% — {answered}/{scaleQuestions.length} respondidas</span>
          </div>
          <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#6366f1', borderRadius: 99, width: `${pct}%`, transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {/* Contador notas 5 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, border: `1px solid ${countNotas5 >= MAX_NOTAS_5 ? '#c7d2fe' : '#e2e8f0'}`, background: countNotas5 >= MAX_NOTAS_5 ? '#eef2ff' : '#f8fafc', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: MAX_NOTAS_5 }).map((_, i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < countNotas5 ? '#6366f1' : '#e2e8f0', transition: 'background 0.2s' }} />
            ))}
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: countNotas5 >= MAX_NOTAS_5 ? '#4f46e5' : '#64748b' }}>
            {countNotas5}/{MAX_NOTAS_5} competências críticas{countNotas5 >= MAX_NOTAS_5 ? ' — limite atingido' : ''}
          </span>
        </div>

        {limitAlert && (
          <div style={{ marginBottom: 20, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0 }}>⚠️</span>
            <p style={{ color: '#92400e', fontSize: 13, fontWeight: 500, margin: 0 }}>{limitAlert}</p>
          </div>
        )}

        {template.description && (
          <div style={{ padding: '16px 20px', background: 'rgba(99,102,241,0.04)', borderRadius: 12, border: '1px solid #e0e7ff', marginBottom: 32 }}>
            <p style={{ color: '#3730a3', fontSize: 13, fontWeight: 500, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' }}>{template.description}</p>
          </div>
        )}

        {/* Perguntas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {template.questions.map((q, idx) => {
            const isSection = q.description &&
              (q.description.startsWith('Bloco') || q.description.startsWith('PARTE') || q.description.startsWith('Orientações'));
            const currentVal = responses[q.id] ? Number(responses[q.id]) : null;

            return (
              <div key={q.id} style={isSection ? { paddingTop: 32, borderTop: '1px solid #f1f5f9' } : {}}>
                {q.description && (
                  isSection
                    ? <div style={{ marginBottom: 24 }}>
                        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>{q.description}</h3>
                        <div style={{ height: 4, width: 40, background: '#6366f1', borderRadius: 99 }} />
                      </div>
                    : <p style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 8, marginTop: 0 }}>{q.description}</p>
                )}

                {q.text && (
                  <label style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#1e293b', lineHeight: 1.4, marginBottom: 16 }}>
                    <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 13, marginRight: 6 }}>{idx + 1}.</span>
                    {q.text}
                    {q.competencyId && (
                      <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em', background: '#eef2ff', padding: '2px 8px', borderRadius: 99, border: '1px solid #e0e7ff' }}>
                        vinculada ao catálogo
                      </span>
                    )}
                  </label>
                )}

                {q.type === 'scale' && (
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {[1, 2, 3, 4, 5].map(val => {
                        const st = ANCHOR_STYLES[val];
                        const isSelected = currentVal === val;
                        const isDisabled = val === 5 && currentVal !== 5 && countNotas5 >= MAX_NOTAS_5 && !CONTEXT_QUESTION_IDS.includes(q.id);
                        const btnLabel = (q.id.startsWith('q_contexto_') || q.id.startsWith('cand_'))
                          ? (q.anchors?.find(a => a.level === val)?.label ?? SCALE_LABELS[val - 1])
                          : SCALE_LABELS[val - 1];
                        return (
                          <button key={val}
                            onClick={() => handleScale(q.id, String(val))}
                            disabled={isDisabled}
                            title={isDisabled ? `Limite de ${MAX_NOTAS_5} notas 5 atingido` : btnLabel}
                            style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center',
                              padding: '12px', borderRadius: 16, width: 112, border: '2px solid',
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              transition: 'all 0.15s',
                              transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                              background: isSelected ? (val === 1 ? '#ef4444' : val === 2 ? '#f59e0b' : val === 3 ? '#16a34a' : val === 4 ? '#2563eb' : '#4f46e5') : isDisabled ? '#f8fafc' : '#ffffff',
                              borderColor: isSelected ? (val === 1 ? '#ef4444' : val === 2 ? '#f59e0b' : val === 3 ? '#16a34a' : val === 4 ? '#2563eb' : '#4f46e5') : isDisabled ? '#f1f5f9' : '#f1f5f9',
                              color: isSelected ? '#ffffff' : isDisabled ? '#cbd5e1' : '#475569',
                              opacity: isDisabled ? 0.5 : 1,
                              fontFamily: "'DM Sans', sans-serif",
                            }}
                          >
                            <span style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{val}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', textAlign: 'center', lineHeight: 1.2, color: isSelected ? 'rgba(255,255,255,0.9)' : '#94a3b8' }}>
                              {btnLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {currentVal && (() => {
                      const st = ANCHOR_STYLES[currentVal];
                      const anchor = q.anchors?.find(a => a.level === currentVal);
                      const label = anchor?.label || `Nível ${currentVal} — ${SCALE_LABELS[currentVal - 1]}`;
                      const description = anchor?.description || SCALE_LABELS[currentVal - 1];
                      return (
                        <div className={`mt-4 p-4 rounded-2xl border-l-4 ${st.bg} ${st.border}`}>
                          <p className={`text-xs font-black uppercase tracking-widest mb-1 ${st.labelColor}`}>{label}</p>
                          <p className={`text-sm font-medium leading-relaxed ${st.descColor}`}>{description}</p>
                        </div>
                      );
                    })()}

                    <div style={{ marginTop: 16 }}>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 6 }}>Justificativa / Observação (opcional)</label>
                      <textarea
                        value={(responses[`${q.id}_justification`] as string) || ''}
                        onChange={e => handleJust(q.id, e.target.value)}
                        rows={2}
                        placeholder="Insira aqui sua observação sobre este comportamento..."
                        style={{ width: '100%', padding: '14px 16px', background: '#f8fafc', border: 'none', borderRadius: 16, fontSize: 14, fontWeight: 500, color: '#334155', resize: 'none', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
                      />
                    </div>
                  </div>
                )}

                {q.type === 'text' && (
                  <textarea
                    value={(responses[q.id] as string) || ''}
                    onChange={e => handleText(q.id, e.target.value)}
                    rows={4}
                    placeholder="Digite sua resposta aqui..."
                    style={{ width: '100%', padding: '14px 16px', background: '#f8fafc', border: 'none', borderRadius: 16, fontSize: 14, fontWeight: 500, color: '#334155', resize: 'none', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
                  />
                )}

                {q.type === 'list' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from({ length: q.listItems || 5 }, (_, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{i + 1}</div>
                        <input
                          type="text"
                          placeholder={`Item ${i + 1}...`}
                          value={((responses[q.id] as string[]) || [])[i] || ''}
                          onChange={e => handleList(q.id, i, e.target.value)}
                          style={{ flex: 1, padding: '12px 16px', background: '#f8fafc', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 500, color: '#334155', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ fontSize: 13 }}>
            {answered < scaleQuestions.length && scaleQuestions.length > 0 && (
              <span style={{ color: '#d97706', fontWeight: 600 }}>
                ⚠️ {scaleQuestions.length - answered} pergunta{scaleQuestions.length - answered > 1 ? 's' : ''} sem resposta
              </span>
            )}
            {answered === scaleQuestions.length && scaleQuestions.length > 0 && (
              <span style={{ color: '#059669', fontWeight: 600 }}>✓ Todas as perguntas respondidas</span>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            style={{
              padding: '13px 32px',
              background: isSaving ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: isSaving ? 'none' : '0 4px 14px rgba(99,102,241,0.3)',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {isSaving ? (
              <>
                <svg style={{ width: 16, height: 16, animation: 'pfr-spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Enviando...
              </>
            ) : 'Enviar Respostas'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PublicFormResponder;
