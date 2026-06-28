// GapAnalysisResult — display unificado de gap analysis pessoa × cargo.
// Recebe resultado já calculado por calcularGapAnalysis() — nunca recalcula aqui.
// aiMode='auto'      → texto da IA aparece automaticamente (sem botão)
// aiMode='on-demand' → botão "Gerar análise detalhada"

import React from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Pessoa, Cargo, Competency, CompetencyGap, SuggestedCompetency } from '../types';
import { SEVERITY_CONFIG, classificarScore } from '../services/gapAnalysisService';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface GapAnalysisData {
  gaps:           CompetencyGap[];
  scoreAderencia: number;
  adherentes:     Competency[];
  aDesenvolver:   Competency[];
  ausentes:       Competency[];
}

interface GapAnalysisResultProps {
  pessoa:           Pessoa;
  cargo:            Cargo;
  result:           GapAnalysisData;
  competencias:     Competency[];
  aiMode:           'auto' | 'on-demand';
  aiText?:          string;
  isGeneratingAi?:  boolean;
  onRequestAiText?: () => void;
}

// ─── T/D lookup ──────────────────────────────────────────────────────────────

function lookupTDClass(
  name: string,
  simplified: SuggestedCompetency[] | undefined
): 'threshold' | 'diferenciadora' | null {
  if (!simplified?.length) return null;
  const n = (s: string) => s.toLowerCase().trim();
  const src = n(name);
  const frag = src.substring(0, Math.min(10, src.length));
  const found = simplified.find(c => {
    const cn = n(c.name);
    return cn === src || cn.includes(frag) || src.includes(cn.substring(0, Math.min(10, cn.length)));
  });
  return found?.competencyClass ?? null;
}

// ─── Badges ──────────────────────────────────────────────────────────────────

const TDBadge: React.FC<{ cls: 'threshold' | 'diferenciadora' | null }> = ({ cls }) => {
  if (!cls) return null;
  return cls === 'threshold' ? (
    <span className="flex-shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200" title="Threshold — mínimo obrigatório">T</span>
  ) : (
    <span className="flex-shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200" title="Diferenciadora — marca excelência">D</span>
  );
};

const typeColor: Record<string, string> = {
  Gerencial:      'bg-indigo-50 text-indigo-600',
  Comportamental: 'bg-emerald-50 text-emerald-600',
  Técnica:        'bg-amber-50 text-amber-600',
};

// ─── Radar tooltip ────────────────────────────────────────────────────────────

const RadarTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e293b', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#f1f5f9', minWidth: 140 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#e2e8f0' }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{p.value}/5</span>
        </div>
      ))}
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const GapAnalysisResult: React.FC<GapAnalysisResultProps> = ({
  pessoa,
  cargo,
  result,
  competencias,
  aiMode,
  aiText,
  isGeneratingAi = false,
  onRequestAiText,
}) => {
  const { gaps, scoreAderencia, adherentes, aDesenvolver, ausentes } = result;

  const scoreInfo = classificarScore(scoreAderencia);
  const lacunas   = aDesenvolver.length + ausentes.length;

  // ── Radar ────────────────────────────────────────────────────────────────
  const topComps = cargo.analysis?.simplifiedCompetencies?.slice(0, 10) ?? [];
  const pessoaMap = new Map(
    pessoa.individualCompetencies.map(ic => [ic.competencyId, ic.proficiencyLevel])
  );
  const radarData = topComps.map(tc => {
    const norm = (s: string) => s.toLowerCase();
    const tn   = norm(tc.name);
    const frag = tn.substring(0, Math.min(10, tn.length));
    const cat  =
      competencias.find(c => norm(c.name) === tn) ??
      competencias.find(c => norm(c.name).includes(frag) || tn.includes(norm(c.name).substring(0, Math.min(10, norm(c.name).length))));
    return {
      name:    tc.name.length > 18 ? tc.name.substring(0, 18) + '…' : tc.name,
      exigido: tc.requiredProficiency ?? 3,
      atual:   cat ? (pessoaMap.get(cat.id) ?? 0) : 0,
    };
  });
  const radarOk    = radarData.length >= 3;
  const firstName  = pessoa.name.split(' ')[0];

  // ── Gaps enriquecidos ────────────────────────────────────────────────────
  const enriched = gaps.map(g => ({
    ...g,
    tdClass: lookupTDClass(g.competencyName, cargo.analysis?.simplifiedCompetencies),
  }));

  return (
    <div className="space-y-6">

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <div className={`text-4xl font-black mb-1 ${scoreInfo.color}`}>{scoreAderencia}%</div>
          <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Aderência geral</div>
          <div className="text-xs text-slate-500">{scoreInfo.label}</div>
          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${scoreAderencia}%`,
                background: scoreAderencia >= 85 ? '#059669' : scoreAderencia >= 65 ? '#6366f1' : scoreAderencia >= 40 ? '#d97706' : '#ef4444',
              }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <div className="text-4xl font-black text-emerald-600 mb-1">{adherentes.length}</div>
          <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Atende plenamente</div>
          <div className="text-xs text-slate-500">competência{adherentes.length !== 1 ? 's' : ''} no nível exigido ou acima</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <div className="text-4xl font-black text-red-500 mb-1">{lacunas}</div>
          <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Lacunas</div>
          <div className="text-xs text-slate-500">{aDesenvolver.length} a desenvolver · {ausentes.length} ausente{ausentes.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Radar — com aviso defensivo se ausente/insuficiente */}
      {radarOk ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-6">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">Radar de Competências</h2>
              <p className="text-xs text-slate-400 mt-0.5">Top {radarData.length} competências do cargo · escala 0–5</p>
            </div>
            <div className="flex items-center gap-5 text-xs font-semibold text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-indigo-500 opacity-70" />
                Exigido pelo cargo
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-emerald-400 opacity-80" />
                {firstName}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={360}>
            <RadarChart data={radarData} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis
                dataKey="name"
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
              />
              <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} />
              <Radar name="Exigido pelo cargo" dataKey="exigido" stroke="#6366f1" fill="#6366f1" fillOpacity={0.12} strokeWidth={2} />
              <Radar name={firstName} dataKey="atual" stroke="#10b981" fill="#10b981" fillOpacity={0.18} strokeWidth={2} strokeDasharray="5 2" />
              <Tooltip content={<RadarTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800 flex items-start gap-3">
          <span className="text-lg flex-shrink-0">⚠️</span>
          <div>
            <strong>Radar indisponível.</strong> O cargo ainda não tem Top Competências geradas pela IA
            (<code className="text-xs bg-amber-100 px-1 py-0.5 rounded">analysis.simplifiedCompetencies</code> ausente
            ou com menos de 3 itens). Execute a análise de IA no módulo de Cargos para habilitar o gráfico.
            Os cards de resumo e o detalhamento abaixo permanecem completos.
          </div>
        </div>
      )}

      {/* Detalhamento por competência */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-black text-slate-900">Detalhamento por Competência</h2>
          <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
            {enriched.length} competência{enriched.length !== 1 ? 's' : ''} · maior lacuna primeiro
          </span>
        </div>

        {enriched.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            Nenhuma competência para comparar. O cargo pode não ter perfil de competências definido.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {enriched.map(g => {
              // Fallback defensivo: análises antigas salvas sem severity usam 'ok'
              const sev         = SEVERITY_CONFIG[g.severity] ?? SEVERITY_CONFIG['ok'];
              const statusLabel = (g.severity === 'ok' || g.severity === 'acima')
                ? 'Atende'
                : g.currentLevel === 0
                  ? 'Ausente'
                  : `Lacuna −${g.gap}`;

              return (
                <div
                  key={g.competencyId || g.competencyName}
                  className="flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sev.dot}`} />

                  <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                    <span className="font-semibold text-slate-900 text-sm">{g.competencyName}</span>
                    <TDBadge cls={g.tdClass} />
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeColor[g.competencyType] ?? 'bg-slate-100 text-slate-500'}`}>
                      {g.competencyType}
                    </span>
                  </div>

                  <div className="flex-shrink-0 text-xs text-slate-500 hidden sm:flex items-center gap-1">
                    <span className="font-semibold text-slate-700">Exige {g.requiredLevel}</span>
                    <span className="text-slate-300">/</span>
                    <span className={`font-semibold ${g.currentLevel === 0 ? 'text-slate-400' : 'text-slate-700'}`}>
                      Tem {g.currentLevel}
                    </span>
                  </div>

                  <span className={`flex-shrink-0 text-xs font-bold px-3 py-1 rounded-full border ${sev.bg} ${sev.color} ${sev.border}`}>
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Análise textual da IA */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6">
        <h2 className="text-base font-black text-slate-900 mb-4">Análise Textual da IA</h2>

        {isGeneratingAi ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-slate-400">
            {[0, 150, 300].map(d => (
              <div key={d} className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
            <span>Gerando análise...</span>
          </div>
        ) : aiText ? (
          <div className="relative pl-5">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-full" />
            <div className="space-y-3">
              {aiText.split('\n\n').filter(p => p.trim()).map((para, i) => (
                <p key={i} className="text-sm text-slate-700 leading-relaxed">{para.trim()}</p>
              ))}
            </div>
          </div>
        ) : aiMode === 'on-demand' ? (
          <div className="text-center py-6">
            <button
              onClick={onRequestAiText}
              className="px-6 py-3 bg-indigo-600 text-white text-sm font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
            >
              Gerar análise detalhada com IA
            </button>
            <p className="text-xs text-slate-400 mt-3">
              Identifica padrões de gap e sugere ações de desenvolvimento específicas para este servidor/cargo.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic text-center py-4">
            Clique em "Analisar com IA" para gerar o resumo executivo.
          </p>
        )}
      </div>

    </div>
  );
};

export default GapAnalysisResult;
