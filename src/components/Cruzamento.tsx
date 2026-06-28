// components/Cruzamento.tsx
// Cruzamento exploratório Pessoa × Cargo.
// Cálculo local instantâneo via calcularGapAnalysis(); análise textual sob demanda.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Pessoa, Cargo, Competency } from '../types';
import { getPessoas, getCargos, getCompetencies } from '../services/firebaseService';
import { calcularGapAnalysis } from '../services/gapAnalysisService';
import { analyzePessoaCompetencyGap } from '../services/geminiService';
import GapAnalysisResult from './GapAnalysisResult';

const Cruzamento: React.FC = () => {
  const [pessoas, setPessoas]         = useState<Pessoa[]>([]);
  const [cargos, setCargos]           = useState<Cargo[]>([]);
  const [competencias, setCompetencias] = useState<Competency[]>([]);
  const [isLoading, setIsLoading]     = useState(true);

  const [pessoaId, setPessoaId] = useState('');
  const [cargoId, setCargoId]   = useState('');

  const [result, setResult]           = useState<ReturnType<typeof calcularGapAnalysis> | null>(null);
  const [aiText, setAiText]           = useState<string | undefined>(undefined);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  useEffect(() => {
    Promise.all([getPessoas(), getCargos(), getCompetencies()])
      .then(([p, c, comp]) => { setPessoas(p); setCargos(c); setCompetencias(comp); })
      .finally(() => setIsLoading(false));
  }, []);

  // Filtra apenas registros com dados úteis
  const pessoasFiltradas = useMemo(
    () => pessoas.filter(p => (p.individualCompetencies?.length ?? 0) > 0),
    [pessoas]
  );
  const cargosFiltrados = useMemo(
    () => cargos.filter(c => (c.competencyProfile?.length ?? 0) > 0),
    [cargos]
  );

  const pessoaSel = useMemo(() => pessoas.find(p => p.id === pessoaId) ?? null, [pessoas, pessoaId]);
  const cargoSel  = useMemo(() => cargos.find(c => c.id === cargoId)   ?? null, [cargos, cargoId]);

  // Zera resultado e texto ao trocar seleção
  useEffect(() => { setResult(null); setAiText(undefined); }, [pessoaId, cargoId]);

  const handleComparar = useCallback(() => {
    if (!pessoaSel || !cargoSel) return;
    setResult(calcularGapAnalysis(pessoaSel, cargoSel, competencias));
  }, [pessoaSel, cargoSel, competencias]);

  const handleRequestAi = useCallback(async () => {
    if (!pessoaSel || !cargoSel) return;
    setIsGeneratingAi(true);
    try {
      const required = competencias.filter(c =>
        cargoSel.competencyProfile?.some(r => r.competencyId === c.id)
      );
      const text = await analyzePessoaCompetencyGap(pessoaSel, required, cargoSel.name);
      setAiText(text);
    } catch (err) {
      console.error('[Cruzamento] Erro ao gerar análise textual:', err);
      setAiText('Não foi possível gerar a análise textual. Tente novamente.');
    } finally {
      setIsGeneratingAi(false);
    }
  }, [pessoaSel, cargoSel, competencias]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24">
        {[0, 150, 300].map(d => (
          <div key={d} className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />
        ))}
        <span className="text-sm text-slate-400 ml-2">Carregando dados...</span>
      </div>
    );
  }

  return (
    <div>

      {/* Cabeçalho */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Cruzamento Pessoa × Cargo</h1>
        <p className="text-slate-500 font-medium mt-1 text-sm">
          Compare o perfil de competências de um servidor com as exigências de qualquer cargo cadastrado.
        </p>
      </div>

      {/* Seletores */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">

          {/* Servidor */}
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
              Servidor
              <span className="ml-2 font-normal normal-case text-slate-300">
                ({pessoasFiltradas.length} com autoavaliação preenchida)
              </span>
            </label>
            <select
              value={pessoaId}
              onChange={e => setPessoaId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Selecione o servidor...</option>
              {pessoasFiltradas.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.individualCompetencies.length} competência{p.individualCompetencies.length !== 1 ? 's' : ''} avaliadas
                </option>
              ))}
            </select>
            {pessoas.length > 0 && pessoasFiltradas.length === 0 && (
              <p className="text-xs text-amber-600 mt-2">
                Nenhum servidor possui perfil de competências. Aplique um formulário de autoavaliação primeiro.
              </p>
            )}
          </div>

          {/* Cargo */}
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
              Cargo
              <span className="ml-2 font-normal normal-case text-slate-300">
                ({cargosFiltrados.length} com perfil de competências definido)
              </span>
            </label>
            <select
              value={cargoId}
              onChange={e => setCargoId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Selecione o cargo...</option>
              {cargosFiltrados.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.dasLevel ? ` (${c.dasLevel})` : ''} — {c.competencyProfile!.length} requisito{c.competencyProfile!.length !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
            {cargos.length > 0 && cargosFiltrados.length === 0 && (
              <p className="text-xs text-amber-600 mt-2">
                Nenhum cargo possui perfil de competências. Aplique um formulário de mapeamento primeiro.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleComparar}
            disabled={!pessoaId || !cargoId}
            className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" />
            </svg>
            Comparar
          </button>
        </div>
      </div>

      {/* Resultado */}
      {result && pessoaSel && cargoSel && (
        <div className="space-y-6">
          {/* Contexto */}
          <div className="flex items-center gap-3 text-sm font-medium text-slate-500 px-1">
            <span className="font-bold text-slate-900">{pessoaSel.name}</span>
            <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" />
            </svg>
            <span className="font-bold text-slate-900">{cargoSel.name}{cargoSel.dasLevel ? ` · ${cargoSel.dasLevel}` : ''}</span>
          </div>

          <GapAnalysisResult
            pessoa={pessoaSel}
            cargo={cargoSel}
            result={result}
            competencias={competencias}
            aiMode="on-demand"
            aiText={aiText}
            isGeneratingAi={isGeneratingAi}
            onRequestAiText={handleRequestAi}
          />

          <p className="text-xs text-slate-300 text-center pb-2">
            Cruzamento por <code>competencyId</code> · <code>calcularGapAnalysis()</code> ·
            badge T/D via <code>analysis.simplifiedCompetencies[].name</code>
          </p>
        </div>
      )}

      {/* Estado inicial */}
      {!result && (
        <div className="py-24 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" />
          </svg>
          <p className="text-sm font-medium text-slate-400">
            Selecione um servidor e um cargo e clique em <strong>Comparar</strong>.
          </p>
        </div>
      )}
    </div>
  );
};

export default Cruzamento;
