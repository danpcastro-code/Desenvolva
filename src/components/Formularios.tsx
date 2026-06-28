// components/Formularios.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FormularioInstance, FormularioTemplate, FormularioQuestion,
  Cargo, OrganizationalUnit, Pessoa, Competency,
} from '../types';
import {
  getFormularioInstances, getFormularioTemplates,
  addFormularioInstance, getCargos, getUnits, getPessoas,
  updateFormularioInstance, addFormularioTemplate,
  updateFormularioTemplate, deleteFormularioTemplate,
  getCompetencies,
} from '../services/firebaseService';
import { processAndApplyFormResponses } from '../services/formularioIntegrationService';
import { PlusIcon, PencilIcon, TrashIcon, PaperAirplaneIcon } from './Icons';
import { useUser } from '../contexts/UserContext';

const MAX_NOTAS_5 = 10;

const LoadingSpinner: React.FC<{ text?: string }> = ({ text = 'Aguarde...' }) => (
  <div className="flex items-center justify-center gap-2 p-8">
    <div className="w-2 h-2 rounded-full animate-bounce bg-indigo-500" style={{ animationDelay: '0ms' }} />
    <div className="w-2 h-2 rounded-full animate-bounce bg-indigo-500" style={{ animationDelay: '150ms' }} />
    <div className="w-2 h-2 rounded-full animate-bounce bg-indigo-500" style={{ animationDelay: '300ms' }} />
    <span className="text-sm text-slate-500 ml-2">{text}</span>
  </div>
);

const Toast: React.FC<{ message: string; type: 'success' | 'error' | 'info'; onClose: () => void }> = ({ message, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const colors = { success: 'bg-emerald-50 border-emerald-200 text-emerald-800', error: 'bg-red-50 border-red-200 text-red-800', info: 'bg-indigo-50 border-indigo-200 text-indigo-800' };
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 px-5 py-4 rounded-2xl border shadow-lg max-w-sm ${colors[type]}`}>
      <span className="text-lg">{icons[type]}</span>
      <div className="flex-1 text-sm font-medium leading-relaxed">{message}</div>
      <button onClick={onClose} className="text-current opacity-50 hover:opacity-100 ml-2">✕</button>
    </div>
  );
};

// Cores e labels por nível
const ANCHOR_STYLES: Record<number, { bg: string; border: string; labelColor: string; descColor: string; btnActive: string; btnShadow: string }> = {
  1: { bg: 'bg-red-50',    border: 'border-red-300',    labelColor: 'text-red-800',    descColor: 'text-red-700',    btnActive: 'bg-red-500 border-red-500',       btnShadow: 'shadow-red-100' },
  2: { bg: 'bg-amber-50',  border: 'border-amber-300',  labelColor: 'text-amber-800',  descColor: 'text-amber-700',  btnActive: 'bg-amber-500 border-amber-500',   btnShadow: 'shadow-amber-100' },
  3: { bg: 'bg-green-50',  border: 'border-green-300',  labelColor: 'text-green-800',  descColor: 'text-green-700',  btnActive: 'bg-green-600 border-green-600',   btnShadow: 'shadow-green-100' },
  4: { bg: 'bg-blue-50',   border: 'border-blue-300',   labelColor: 'text-blue-800',   descColor: 'text-blue-700',   btnActive: 'bg-blue-600 border-blue-600',     btnShadow: 'shadow-blue-100' },
  5: { bg: 'bg-indigo-50', border: 'border-indigo-300', labelColor: 'text-indigo-800', descColor: 'text-indigo-700', btnActive: 'bg-indigo-600 border-indigo-600', btnShadow: 'shadow-indigo-100' },
};

const SCALE_LABELS = ['Irrelevante', 'Pouco importante', 'Moderadamente importante', 'Muito importante', 'Crítico / Essencial'];

// ─── Editor de Template ───────────────────────────────────────────────────────
const TemplateEditor: React.FC<{
  template: Partial<FormularioTemplate> | null;
  type: 'cargo' | 'pessoa';
  allCompetencies: Competency[];
  onSave: (template: Omit<FormularioTemplate, 'id'> | FormularioTemplate) => Promise<void>;
  onCancel: () => void;
}> = ({ template, type, allCompetencies, onSave, onCancel }) => {
  const [name, setName] = useState(template?.name || '');
  const [description, setDesc] = useState(template?.description || '');
  const [questions, setQuestions] = useState<FormularioQuestion[]>(template?.questions || []);

  const addQuestion = () => setQuestions(qs => [...qs, { id: `q_${Date.now()}`, type: 'scale', description: '', text: '' }]);
  const updateQ = (i: number, field: keyof FormularioQuestion, val: any) =>
    setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, [field]: val } : q));
  const removeQ = (i: number) => setQuestions(qs => qs.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim()) { alert('O nome do modelo é obrigatório.'); return; }
    await onSave({ ...template, name, description, questions, type } as any);
  };

  return (
    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 max-w-3xl mx-auto">
      <h2 className="text-2xl font-black text-slate-900 mb-6">{template?.id ? 'Editar Modelo' : 'Novo Modelo de Formulário'}</h2>
      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nome do Modelo</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Descrição / Instrução</label>
          <textarea value={description} onChange={e => setDesc(e.target.value)} rows={3} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
        </div>
      </div>
      <div className="border-t border-slate-100 pt-6">
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Perguntas</h3>
        <div className="space-y-4">
          {questions.map((q, i) => (
            <div key={q.id} className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-200">
              <div className="flex items-start justify-between gap-3">
                <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 space-y-2">
                  <input placeholder="Rótulo / título da pergunta" value={q.text || ''} onChange={e => updateQ(i, 'text', e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <textarea placeholder="Descrição / contexto (opcional)" value={q.description || ''} onChange={e => updateQ(i, 'description', e.target.value)} rows={2}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <div className="flex items-center gap-3">
                    <select value={q.type} onChange={e => updateQ(i, 'type', e.target.value)} className="px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm font-medium focus:outline-none">
                      <option value="scale">Escala (1–5)</option>
                      <option value="text">Texto Aberto</option>
                      <option value="list">Lista de Itens</option>
                    </select>
                    {q.type === 'scale' && (
                      <select value={q.competencyId || ''} onChange={e => updateQ(i, 'competencyId', e.target.value || undefined)}
                        className="flex-1 px-3 py-2 bg-white rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400">
                        <option value="">— Vincular à competência do catálogo —</option>
                        {allCompetencies.map(c => <option key={c.id} value={c.id}>[{c.type}] {c.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                <button onClick={() => removeQ(i)} className="text-slate-400 hover:text-red-500 transition-colors mt-0.5">
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addQuestion} className="mt-4 flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
          <PlusIcon className="w-4 h-4" /> Adicionar Pergunta
        </button>
      </div>
      <div className="mt-8 flex justify-end gap-3 border-t border-slate-100 pt-6">
        <button onClick={onCancel} className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all">Cancelar</button>
        <button onClick={handleSave} className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all">Salvar Modelo</button>
      </div>
    </div>
  );
};

// ─── Componente de Âncora Visual ──────────────────────────────────────────────
const AnchorFeedback: React.FC<{ level: number; anchors?: { level: number; label: string; description: string }[] }> = ({ level, anchors }) => {
  const style = ANCHOR_STYLES[level];
  const anchor = anchors?.find(a => a.level === level);
  const label = anchor?.label || `Nível ${level} — ${SCALE_LABELS[level - 1]}`;
  const description = anchor?.description || SCALE_LABELS[level - 1];

  return (
    <div className={`mt-4 p-4 rounded-2xl border-l-4 ${style.bg} ${style.border} animate-fade-in`}>
      <p className={`text-xs font-black uppercase tracking-widest mb-1 ${style.labelColor}`}>{label}</p>
      <p className={`text-sm font-medium leading-relaxed ${style.descColor}`}>{description}</p>
    </div>
  );
};

// ─── Responder Formulário ─────────────────────────────────────────────────────
const FormResponder: React.FC<{
  instance: FormularioInstance;
  template: FormularioTemplate;
  onSave: (instanceId: string, responses: Record<string, string | string[]>) => Promise<void>;
  onAutoSave: (instanceId: string, responses: Record<string, string | string[]>) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}> = ({ instance, template, onSave, onAutoSave, onCancel, isSaving }) => {
  const [responses, setResponses] = useState<Record<string, string | string[]>>(instance.responses || {});
  const [limitAlert, setLimitAlert] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAutoSave = (newResponses: Record<string, string | string[]>) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      onAutoSave(instance.id, newResponses).catch(() => {});
    }, 2500);
  };

  // Conta quantas notas 5 foram atribuídas
  const CONTEXT_QUESTION_IDS = ['q_contexto_equipe', 'q_contexto_maturidade'];

const countNotas5 = useMemo(() => {
    return template.questions
      .filter(q => q.type === 'scale')
      .filter(q => !CONTEXT_QUESTION_IDS.includes(q.id))
      .filter(q => responses[q.id] === '5')
      .length;
  }, [responses, template.questions]);

  const scaleQuestions = template.questions.filter(q => q.type === 'scale');
  const answered = scaleQuestions.filter(q => responses[q.id]).length;
  const pct = scaleQuestions.length > 0 ? Math.round((answered / scaleQuestions.length) * 100) : 0;

  const handleScale = (qId: string, val: string) => {
    if (val === '5' && responses[qId] !== '5' && countNotas5 >= MAX_NOTAS_5) {
      setLimitAlert(`Você já atingiu o limite de ${MAX_NOTAS_5} competências classificadas como "Crítico / Essencial". Para marcar esta, remova a nota 5 de outra pergunta.`);
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

  return (
    <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">{template.name}</h2>
          <p className="text-slate-500 font-medium mt-1">
            {instance.type === 'cargo'
              ? `Mapeamento para ${(instance.cargoIds?.length ?? 1) > 1 ? 'os cargos' : 'o cargo'}: ${instance.cargoName}`
              : `Avaliação de: ${instance.pessoaName}`}
          </p>
        </div>
        <button onClick={onCancel} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Barra de progresso */}
      <div className="mb-6">
        <div className="flex justify-between text-xs font-bold text-slate-400 mb-2">
          <span>Progresso do preenchimento</span>
          <span className="text-indigo-600">{pct}% — {answered}/{scaleQuestions.length} respondidas</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Contador de notas 5 */}
      <div className={`mb-8 flex items-center gap-3 px-5 py-3 rounded-2xl border ${countNotas5 >= MAX_NOTAS_5 ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex gap-1">
          {Array.from({ length: MAX_NOTAS_5 }).map((_, i) => (
            <div key={i} className={`w-3 h-3 rounded-full transition-all ${i < countNotas5 ? 'bg-indigo-600' : 'bg-slate-200'}`} />
          ))}
        </div>
        <span className={`text-xs font-black uppercase tracking-widest ${countNotas5 >= MAX_NOTAS_5 ? 'text-indigo-700' : 'text-slate-500'}`}>
          {countNotas5}/{MAX_NOTAS_5} competências críticas utilizadas
          {countNotas5 >= MAX_NOTAS_5 && ' — limite atingido'}
        </span>
      </div>

      {/* Alerta de limite */}
      {limitAlert && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
          <p className="text-amber-800 text-sm font-medium">{limitAlert}</p>
        </div>
      )}

      {/* Instrução */}
      {template.description && (
        <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100 mb-8">
          <p className="text-indigo-900 text-sm font-medium leading-relaxed whitespace-pre-line">{template.description}</p>
        </div>
      )}

      {/* Perguntas */}
      <div className="space-y-10">
        {template.questions.map((q, idx) => {
          const isSection = q.description &&
            (q.description.startsWith('Bloco') || q.description.startsWith('PARTE') || q.description.startsWith('Orientações'));
          const currentVal = responses[q.id] ? Number(responses[q.id]) : null;

          return (
            <div key={q.id} className={isSection ? 'pt-8 border-t border-slate-100' : ''}>
              {q.description && (
                isSection
                  ? <div className="mb-6">
                      <h3 className="text-xl font-black text-slate-900">{q.description}</h3>
                      <div className="h-1 w-10 bg-indigo-500 rounded-full mt-2" />
                    </div>
                  : <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-2">{q.description}</p>
              )}

              {q.text && (
                <label className="block text-base font-bold text-slate-800 leading-snug mb-4">
                  <span className="text-slate-400 font-normal text-sm mr-2">{idx + 1}.</span>
                  {q.text}
                  {q.competencyId && (
                    <span className="ml-2 inline-flex items-center text-[10px] font-black text-indigo-500 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">vinculada ao catálogo</span>
                  )}
                </label>
              )}

              {/* Escala 1–5 com âncoras */}
              {q.type === 'scale' && (
                <div>
                  <div className="flex flex-wrap gap-3">
                    {[1, 2, 3, 4, 5].map(val => {
                      const style = ANCHOR_STYLES[val];
                      const isSelected = currentVal === val;
                      const isDisabled = val === 5 && currentVal !== 5 && countNotas5 >= MAX_NOTAS_5 && !CONTEXT_QUESTION_IDS.includes(q.id);
                      const btnLabel = (q.id.startsWith('q_contexto_') || q.id.startsWith('cand_'))
                        ? (q.anchors?.find(a => a.level === val)?.label ?? SCALE_LABELS[val - 1])
                        : SCALE_LABELS[val - 1];
                      return (
                        <button key={val} onClick={() => handleScale(q.id, String(val))} disabled={isDisabled}
                          title={isDisabled ? `Limite de ${MAX_NOTAS_5} notas 5 atingido` : btnLabel}
                          className={`flex flex-col items-center p-3 rounded-2xl border-2 transition-all w-28 ${
                            isSelected
                              ? `${style.btnActive} text-white shadow-lg ${style.btnShadow} scale-105`
                              : isDisabled
                                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-50'
                                : 'bg-white text-slate-600 border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30'
                          }`}>
                          <span className="text-xl font-black mb-1">{val}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-tighter text-center leading-tight ${isSelected ? 'text-white/90' : 'text-slate-400'}`}>
                            {btnLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Âncora comportamental — aparece ao selecionar */}
                  {currentVal && (
                    <AnchorFeedback level={currentVal} anchors={q.anchors} />
                  )}

                  {/* Justificativa */}
                  <div className="mt-4">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Justificativa / Observação (opcional)</label>
                    <textarea value={(responses[`${q.id}_justification`] as string) || ''} onChange={e => handleJust(q.id, e.target.value)} rows={2}
                      placeholder="Insira aqui sua observação sobre este comportamento..."
                      className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 transition-all resize-none text-sm" />
                  </div>
                </div>
              )}

              {/* Texto aberto */}
              {q.type === 'text' && (
                <textarea value={(responses[q.id] as string) || ''} onChange={e => handleText(q.id, e.target.value)} rows={4}
                  placeholder="Digite sua resposta aqui..."
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 transition-all resize-none" />
              )}

              {/* Lista */}
              {q.type === 'list' && (
                <div className="space-y-3">
                  {Array.from({ length: q.listItems || 5 }, (_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-black text-sm flex-shrink-0">{i + 1}</div>
                      <input type="text" placeholder={`Item ${i + 1}...`}
                        value={((responses[q.id] as string[]) || [])[i] || ''}
                        onChange={e => handleList(q.id, i, e.target.value)}
                        className="flex-1 p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rodapé */}
      <div className="mt-12 flex items-center justify-between border-t border-slate-100 pt-6">
        <div className="text-sm text-slate-400">
          {answered < scaleQuestions.length && (
            <span className="text-amber-600 font-semibold">⚠️ {scaleQuestions.length - answered} pergunta{scaleQuestions.length - answered > 1 ? 's' : ''} sem resposta</span>
          )}
          {answered === scaleQuestions.length && scaleQuestions.length > 0 && (
            <span className="text-emerald-600 font-semibold">✓ Todas as perguntas respondidas</span>
          )}
        </div>
        <div className="flex gap-4">
          <button onClick={onCancel} className="px-8 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all">Cancelar</button>
          <button onClick={() => onSave(instance.id, responses)} disabled={isSaving}
            className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
            {isSaving ? (<><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Processando...</>) : 'Salvar Respostas'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Modais de envio ──────────────────────────────────────────────────────────
const SendCargoModal: React.FC<{
  template: FormularioTemplate; cargos: Cargo[]; units: OrganizationalUnit[];
  onSend: (template: FormularioTemplate, cargoIds: string[], recipientEmail: string) => void;
  onClose: () => void;
}> = ({ template, cargos, units, onSend, onClose }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [search, setSearch] = useState('');
  const unitMap = useMemo(() => new Map(units.map(u => [u.id, u.name])), [units]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return cargos.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (unitMap.get(c.unitId) || '').toLowerCase().includes(q)
    );
  }, [cargos, search, unitMap]);

  const toggle = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleAll = () =>
    setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map(c => c.id));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <h2 className="text-xl font-black text-slate-900 mb-1">Enviar Formulário de Cargo</h2>
        <p className="text-xs text-slate-400 mb-6">Selecione um ou mais cargos que compartilharão as mesmas respostas.</p>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Busca */}
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar cargos..."
            className="w-full px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {/* Lista com checkboxes */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100" style={{ maxHeight: 280 }}>
            {/* Selecionar todos */}
            {filtered.length > 0 && (
              <label className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 cursor-pointer hover:bg-indigo-50 transition-colors sticky top-0">
                <input
                  type="checkbox"
                  checked={selectedIds.length === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded text-indigo-600"
                />
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  Selecionar todos ({filtered.length})
                </span>
              </label>
            )}
            {filtered.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-sm">Nenhum cargo encontrado.</div>
            )}
            {filtered.map(c => (
              <label key={c.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${selectedIds.includes(c.id) ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.id)}
                  onChange={() => toggle(c.id)}
                  className="w-4 h-4 rounded text-indigo-600"
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{c.name}</div>
                  <div className="text-xs text-slate-400 truncate">{unitMap.get(c.unitId) || c.unitId}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Contador de selecionados */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-xl border border-indigo-100">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-black">{selectedIds.length}</span>
              <span className="text-xs font-semibold text-indigo-700">cargo{selectedIds.length > 1 ? 's' : ''} selecionado{selectedIds.length > 1 ? 's' : ''}</span>
            </div>
          )}

          {/* E-mail */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">E-mail do Responsável</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="responsavel@planejamento.gov.br"
              className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">Cancelar</button>
          <button
            onClick={() => { if (selectedIds.length > 0 && email) onSend(template, selectedIds, email); }}
            disabled={selectedIds.length === 0 || !email}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-200 disabled:opacity-50">
            Enviar para {selectedIds.length > 0 ? selectedIds.length : ''} cargo{selectedIds.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

const SendPessoaModal: React.FC<{
  template: FormularioTemplate; pessoas: Pessoa[];
  onSend: (template: FormularioTemplate, pessoaId: string) => void;
  onClose: () => void;
}> = ({ template, pessoas, onSend, onClose }) => {
  const [pessoaId, setPessoa] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-black text-slate-900 mb-6">Enviar Formulário de Pessoa</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Destinatário</label>
            <select value={pessoaId} onChange={e => setPessoa(e.target.value)} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Selecione uma pessoa...</option>
              {pessoas.map(p => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">Cancelar</button>
          <button onClick={() => { if (pessoaId) onSend(template, pessoaId); }} disabled={!pessoaId}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-200 disabled:opacity-50">Enviar</button>
        </div>
      </div>
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────
const Formularios: React.FC = () => {
  const { isAdmin } = useUser();
  const [view, setView] = useState<'list' | 'responder' | 'editor'>('list');
  const [mainTab, setMainTab] = useState<'cargo' | 'pessoa'>('cargo');
  const [subTab, setSubTab] = useState<'enviados' | 'modelos'>('enviados');
  const [instances, setInstances] = useState<FormularioInstance[]>([]);
  const [templates, setTemplates] = useState<FormularioTemplate[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [units, setUnits] = useState<OrganizationalUnit[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [competencies, setComps] = useState<Competency[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [sendingTemplate, setSending] = useState<FormularioTemplate | null>(null);
  const [respondingInst, setResponding] = useState<FormularioInstance | null>(null);
  const [editingTpl, setEditingTpl] = useState<Partial<FormularioTemplate> | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => setToast({ msg, type });

  const cargoTemplates = useMemo(() => templates.filter(t => t.type === 'cargo' || !t.type), [templates]);
  const pessoaTemplates = useMemo(() => templates.filter(t => t.type === 'pessoa'), [templates]);
  const cargoInst = useMemo(() => instances.filter(i => i.type === 'cargo' || !i.type), [instances]);
  const pessoaInst = useMemo(() => instances.filter(i => i.type === 'pessoa'), [instances]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inst, tpls, cars, uts, pess, comps] = await Promise.all([
        getFormularioInstances(), getFormularioTemplates(), getCargos(), getUnits(), getPessoas(), getCompetencies(),
      ]);
      setInstances(inst); setTemplates(tpls); setCargos(cars);
      setUnits(uts); setPessoas(pess); setComps(comps);
    } catch { setError('Falha ao carregar formulários.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSendCargo = async (tpl: FormularioTemplate, cargoIds: string[], email: string) => {
    if (cargoIds.length === 0) return;
    const selectedCargos = cargos.filter(c => cargoIds.includes(c.id));
    const cargoName = selectedCargos.map(c => c.name).join(', ');
    const unitName = selectedCargos.length === 1
      ? (units.find(u => u.id === selectedCargos[0].unitId)?.name || '')
      : '';
    await addFormularioInstance({
      templateId: tpl.id, templateName: tpl.name, type: 'cargo',
      cargoId: selectedCargos[0].id,   // mantido para compatibilidade com código legado
      cargoIds,
      cargoName,
      unitName,
      recipientEmail: email,
      status: 'Pendente',
      sentDate: new Date().toISOString().split('T')[0],
    });
    setSending(null);
    showToast(`Formulário criado para ${selectedCargos.length} cargo${selectedCargos.length > 1 ? 's' : ''}!`);
    await load();
  };

  const handleSendPessoa = async (tpl: FormularioTemplate, pessoaId: string) => {
    const pessoa = pessoas.find(p => p.id === pessoaId);
    if (!pessoa) return;
    await addFormularioInstance({ templateId: tpl.id, templateName: tpl.name, type: 'pessoa', pessoaId: pessoa.id, pessoaName: pessoa.name, status: 'Pendente', sentDate: new Date().toISOString().split('T')[0] });
    setSending(null); showToast('Formulário enviado para ' + pessoa.name + '!'); await load();
  };

  const handleAutoSave = async (instanceId: string, responses: Record<string, string | string[]>) => {
    try {
      await updateFormularioInstance(instanceId, { responses } as Partial<FormularioInstance>);
    } catch { /* silently ignore */ }
  };

  const handleSaveResponse = async (instanceId: string, responses: Record<string, string | string[]>) => {
    const instance = instances.find(i => i.id === instanceId);
    const template = templates.find(t => t.id === instance?.templateId);
    if (!instance || !template) return;
    setSaving(true);
    try {
      await updateFormularioInstance(instanceId, { ...instance, responses, status: 'Concluído' });

      if (instance.type === 'cargo') {
        // Suporta tanto cargoIds (múltiplos) quanto cargoId (legado)
        const targetIds = instance.cargoIds?.length
          ? instance.cargoIds
          : instance.cargoId ? [instance.cargoId] : [];
        const targetCargos = cargos.filter(c => targetIds.includes(c.id));

        let anySuccess = false;
        for (const cargo of targetCargos) {
          const result = await processAndApplyFormResponses({ responses, template, formType: 'cargo', cargo });
          if (result.success) anySuccess = true;
        }

        if (targetCargos.length > 1) {
          showToast(
            anySuccess
              ? `Competências mapeadas para ${targetCargos.length} cargos com sucesso!`
              : 'Respostas salvas, mas não foi possível mapear competências automaticamente.',
            anySuccess ? 'success' : 'info'
          );
        } else if (targetCargos.length === 1) {
          const result = { success: anySuccess, message: anySuccess ? `Competências mapeadas para ${targetCargos[0].name}.` : 'Respostas salvas, mas sem mapeamento automático.' };
          showToast(result.message, anySuccess ? 'success' : 'info');
        }
      } else {
        const pessoa = instance.pessoaId ? pessoas.find(p => p.id === instance.pessoaId) : undefined;
        const result = await processAndApplyFormResponses({ responses, template, formType: 'pessoa', pessoa });
        if (result.success) showToast(result.message, 'success');
        else showToast('Respostas salvas, mas não foi possível mapear competências automaticamente.', 'info');
      }

      await load(); setView('list'); setResponding(null);
    } catch { showToast('Erro ao salvar respostas. Tente novamente.', 'error'); }
    finally { setSaving(false); }
  };

  const handleSaveTpl = async (tpl: any) => {
    if ('id' in tpl && tpl.id) await updateFormularioTemplate(tpl.id, tpl);
    else await addFormularioTemplate(tpl);
    await load(); setView('list'); setEditingTpl(null); showToast('Modelo salvo com sucesso!');
  };

  const handleDeleteTpl = async (id: string) => {
    if (!confirm('Deseja excluir este modelo?')) return;
    await deleteFormularioTemplate(id); await load(); showToast('Modelo excluído.', 'info');
  };

  const respondingTemplate = useMemo(() => respondingInst ? templates.find(t => t.id === respondingInst.templateId) : null, [respondingInst, templates]);

  const renderInstances = (list: FormularioInstance[], emptyMsg: string) => (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {list.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm font-medium">{emptyMsg}</div>
      ) : (
        <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>{['Formulário', 'Destinatário / Cargo', 'Status', 'Data', ''].map(h => (
              <th key={h} className="px-5 py-3 text-left text-xs font-black text-slate-400 uppercase tracking-wider">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map(inst => (
              <tr key={inst.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-4 font-medium text-slate-800 text-sm">{inst.templateName}</td>
                <td className="px-5 py-4 text-slate-500 text-sm">
                  {inst.type === 'cargo' ? inst.cargoName : inst.pessoaName}
                  {inst.recipientEmail && <div className="text-xs text-slate-400">{inst.recipientEmail}</div>}
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${inst.status === 'Concluído' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${inst.status === 'Concluído' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {inst.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-slate-400 text-sm">{new Date(inst.sentDate).toLocaleDateString('pt-BR')}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-4">
                    <button onClick={() => { setResponding(inst); setView('responder'); }} className="text-indigo-600 hover:text-indigo-800 text-sm font-bold hover:underline">
                      {inst.status === 'Concluído' ? 'Ver respostas' : 'Responder →'}
                    </button>
                    {inst.status === 'Pendente' && inst.publicToken && (
                      <button
                        onClick={async () => {
                          const url = `https://desenvolva-2efaf.web.app/responder?token=${inst.publicToken}`;
                          try {
                            await navigator.clipboard.writeText(url);
                            showToast('Link público copiado para a área de transferência!', 'info');
                          } catch {
                            showToast(`Link: ${url}`, 'info');
                          }
                        }}
                        className="text-emerald-600 hover:text-emerald-800 text-sm font-bold hover:underline"
                        title="Copiar link público do formulário"
                      >
                        Copiar Link
                      </button>
                    )}
                    {isAdmin && (
                    <button
                      onClick={async () => {
                        if (!confirm('Deseja excluir este formulário?')) return;
                        const { deleteFormularioInstance } = await import('../services/firebaseService');
                        await deleteFormularioInstance(inst.id);
                        await load();
                        showToast('Formulário excluído.', 'info');
                      }}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                      title="Excluir formulário"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );

  const renderModelos = (list: FormularioTemplate[]) => (
    <div>
      <div className="flex justify-end mb-4 gap-3">
    <button
        onClick={async () => {
            const json = prompt('Cole o JSON do formulário aqui:');
            if (!json) return;
            try {
                const tpl = JSON.parse(json);
                await addFormularioTemplate(tpl);
                await load();
                showToast('Formulário importado com sucesso!');
            } catch {
                showToast('JSON inválido. Verifique o formato e tente novamente.', 'error');
            }
        }}
        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all">
        <PlusIcon className="w-4 h-4" /> Importar JSON
    </button>
    <button onClick={() => { setEditingTpl(null); setView('editor'); }} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all">
        <PlusIcon className="w-4 h-4" /> Novo Modelo
    </button>
</div>
      {list.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm bg-white rounded-2xl border border-slate-200">Nenhum modelo criado ainda.</div>
      ) : (
        <div className="space-y-3">
          {list.map(tpl => (
            <div key={tpl.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between hover:border-indigo-200 transition-colors">
              <div>
                <h3 className="font-bold text-slate-900">{tpl.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {tpl.questions.length} perguntas · {tpl.questions.filter(q => q.type === 'scale').length} com escala · {tpl.questions.filter(q => q.anchors && q.anchors.length > 0).length} com âncoras comportamentais
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setSending(tpl)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all">
                  <PaperAirplaneIcon className="w-4 h-4" /> Enviar
                </button>
                <button onClick={() => { setEditingTpl(tpl); setView('editor'); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button onClick={() => handleDeleteTpl(tpl.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (isLoading) return <LoadingSpinner text="Carregando formulários..." />;
  if (error) return <p className="text-red-500 text-center py-10">{error}</p>;

  if (view === 'editor') {
    return <TemplateEditor template={editingTpl} type={mainTab} allCompetencies={competencies} onSave={handleSaveTpl} onCancel={() => { setView('list'); setEditingTpl(null); }} />;
  }

  if (view === 'responder' && respondingInst && respondingTemplate) {
    return (
      <>
        <FormResponder instance={respondingInst} template={respondingTemplate} onSave={handleSaveResponse} onAutoSave={handleAutoSave} onCancel={() => { setView('list'); setResponding(null); }} isSaving={isSaving} />
        {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      </>
    );
  }

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {sendingTemplate && mainTab === 'cargo' && <SendCargoModal template={sendingTemplate} cargos={cargos} units={units} onSend={handleSendCargo} onClose={() => setSending(null)} />}
      {sendingTemplate && mainTab === 'pessoa' && <SendPessoaModal template={sendingTemplate} pessoas={pessoas} onSend={handleSendPessoa} onClose={() => setSending(null)} />}

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-slate-900">Formulários & Avaliações</h1>
        <div className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full font-medium">
          {instances.filter(i => i.status === 'Pendente').length} pendente{instances.filter(i => i.status === 'Pendente').length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-8">
          {([['cargo', 'Formulários de Cargo'], ['pessoa', 'Formulários de Pessoa']] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => { setMainTab(tab); setSubTab('enviados'); }}
              className={`pb-4 px-1 border-b-2 font-bold text-sm transition-colors ${mainTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              {label}
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${mainTab === tab ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                {tab === 'cargo' ? cargoInst.length : pessoaInst.length}
              </span>
            </button>
          ))}
        </nav>
      </div>

      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-8">
          {([['enviados', 'Formulários Enviados'], ['modelos', 'Modelos']] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setSubTab(tab)}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${subTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {mainTab === 'cargo'  && subTab === 'enviados' && renderInstances(cargoInst,  'Nenhum formulário de cargo enviado.')}
        {mainTab === 'cargo'  && subTab === 'modelos'  && renderModelos(cargoTemplates)}
        {mainTab === 'pessoa' && subTab === 'enviados' && renderInstances(pessoaInst, 'Nenhum formulário de pessoa enviado.')}
        {mainTab === 'pessoa' && subTab === 'modelos'  && renderModelos(pessoaTemplates)}
      </div>
    </div>
  );
};

export default Formularios;
