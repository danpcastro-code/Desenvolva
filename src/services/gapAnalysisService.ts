// services/gapAnalysisService.ts
// Gap analysis por NÍVEL de proficiência.
// Substitui a lógica de presença/ausência simples pelo cálculo real:
//   nível atual do servidor vs. nível mínimo esperado pelo cargo.
//
// Também gera o score de aderência (0–100%) e classifica os gaps por severidade.

import {
  Pessoa,
  Cargo,
  Competency,
  CompetencyGap,
  PessoaAnalysis,
  CargoCompetencyRequirement,
  IndividualCompetency,
} from '../types';
import { callGemini } from './geminiService';

// ─── Cálculo de severidade do gap ────────────────────────────────────────────

function classificarSeveridade(gap: number, importanceLevel: number = 3): CompetencyGap['severity'] {
  if (gap <= 0 && Math.abs(gap) >= 1) return 'acima';  // acima do esperado
  if (gap === 0) return 'ok';                            // exatamente no nível
  // Gap positivo = abaixo do esperado
  const pesoImportancia = importanceLevel >= 4 ? 1.5 : 1;
  const gapPonderado = gap * pesoImportancia;
  if (gapPonderado >= 3) return 'crítico';
  if (gapPonderado >= 2) return 'moderado';
  return 'leve';
}

// ─── Score de aderência (0–100%) ─────────────────────────────────────────────
// Fórmula ponderada pela importância:
//   Para cada competência requerida:
//     - Peso = importanceLevel (1–5)
//     - Pontos obtidos = min(currentLevel, requiredLevel) / requiredLevel × peso
//   Score = (soma pontos obtidos / soma pesos totais) × 100

function calcularScore(gaps: CompetencyGap[], requirements: CargoCompetencyRequirement[]): number {
  if (requirements.length === 0) return 0;

  const reqMap = new Map(requirements.map(r => [r.competencyId, r]));
  let totalPeso = 0;
  let totalObtido = 0;

  for (const gap of gaps) {
    const req = reqMap.get(gap.competencyId);
    const peso = req?.importanceLevel ?? 3;
    const nivelObtido = Math.min(gap.currentLevel, gap.requiredLevel);
    const pontos = gap.requiredLevel > 0
      ? (nivelObtido / gap.requiredLevel) * peso
      : peso;

    totalPeso += peso;
    totalObtido += Math.max(0, pontos);
  }

  // Inclui competências requeridas não avaliadas (peso cheio, 0 pontos)
  for (const req of requirements) {
    const jaContado = gaps.some(g => g.competencyId === req.competencyId);
    if (!jaContado) {
      totalPeso += req.importanceLevel;
      // 0 pontos (competência ausente)
    }
  }

  if (totalPeso === 0) return 0;
  return Math.round((totalObtido / totalPeso) * 100);
}

// ─── Função principal de gap analysis ────────────────────────────────────────

/**
 * Calcula o gap analysis completo entre o perfil de uma pessoa e as exigências
 * de proficiência de um cargo.
 *
 * Funciona em dois modos:
 *  - Com perfil de proficiência definido (competencyProfile no cargo): cálculo preciso por nível
 *  - Sem perfil (cargo sem mapeamento): fallback para presença/ausência
 */
export function calcularGapAnalysis(
  pessoa: Pessoa,
  cargo: Cargo,
  todasCompetencias: Competency[]
): {
  gaps:              CompetencyGap[];
  scoreAderencia:    number;
  adherentes:        Competency[];
  aDesenvolver:      Competency[];
  ausentes:          Competency[];
} {
  const compMap = new Map(todasCompetencias.map(c => [c.id, c]));
  const pessoaMap = new Map<string, IndividualCompetency>(
    pessoa.individualCompetencies.map(ic => [ic.competencyId, ic])
  );

  const gaps: CompetencyGap[] = [];
  const adherentes: Competency[] = [];
  const aDesenvolver: Competency[] = [];
  const ausentes: Competency[] = [];

  const requirements: CargoCompetencyRequirement[] = cargo.competencyProfile || [];

  if (requirements.length === 0) {
    // ── Modo fallback: sem perfil de proficiência definido ──────────────────
    // Usa o analysis do cargo (competências sugeridas pela IA) como referência
    const refCompetencias = cargo.analysis?.simplifiedCompetencies
      || cargo.analysis?.formMacroCompetencies
      || [];

    for (const ref of refCompetencias) {
      // Tenta encontrar a competência no catálogo pelo nome
      const catalogComp = todasCompetencias.find(c =>
        c.name.toLowerCase() === ref.name.toLowerCase() ||
        c.name.toLowerCase().includes(ref.name.toLowerCase().substring(0, 10))
      );

      const pessoaComp = catalogComp ? pessoaMap.get(catalogComp.id) : undefined;
      const requiredLevel = ref.requiredProficiency || 3;
      const currentLevel = pessoaComp?.proficiencyLevel || 0;
      const gap = requiredLevel - currentLevel;

      if (catalogComp) {
        gaps.push({
          competencyId:   catalogComp.id,
          competencyName: catalogComp.name,
          competencyType: catalogComp.type,
          requiredLevel,
          currentLevel,
          gap,
          importanceLevel: ref.importanceLevel || 3,
          severity: classificarSeveridade(gap, ref.importanceLevel),
        });

        if (gap <= 0) adherentes.push(catalogComp);
        else if (currentLevel > 0) aDesenvolver.push(catalogComp);
        else ausentes.push(catalogComp);
      }
    }

    const score = calcularScore(gaps, requirements);
    return { gaps, scoreAderencia: score, adherentes, aDesenvolver, ausentes };
  }

  // ── Modo principal: perfil de proficiência definido ───────────────────────
  for (const req of requirements) {
    const catalogComp = compMap.get(req.competencyId);
    const pessoaComp  = pessoaMap.get(req.competencyId);
    const currentLevel = pessoaComp?.proficiencyLevel || 0;
    const gap = req.requiredLevel - currentLevel;

    gaps.push({
      competencyId:   req.competencyId,
      competencyName: req.competencyName,
      competencyType: req.competencyType,
      requiredLevel:  req.requiredLevel,
      currentLevel,
      gap,
      importanceLevel: req.importanceLevel,
      severity: classificarSeveridade(gap, req.importanceLevel),
    });

    if (catalogComp) {
      if (gap <= 0) adherentes.push(catalogComp);
      else if (currentLevel > 0) aDesenvolver.push(catalogComp);
      else ausentes.push(catalogComp);
    }
  }

  // Ordena: críticos primeiro, depois por importância
  gaps.sort((a, b) => {
    const orden = { crítico: 0, moderado: 1, leve: 2, ok: 3, acima: 4 };
    const diff = (orden[a.severity] || 5) - (orden[b.severity] || 5);
    if (diff !== 0) return diff;
    return (b.importanceLevel || 0) - (a.importanceLevel || 0);
  });

  const score = calcularScore(gaps, requirements);
  return { gaps, scoreAderencia: score, adherentes, aDesenvolver, ausentes };
}

// ─── Geração da análise completa (salva na pessoa) ───────────────────────────

export async function gerarAnaliseCompleta(
  pessoa: Pessoa,
  cargo: Cargo,
  todasCompetencias: Competency[]
): Promise<PessoaAnalysis> {

  const { gaps, scoreAderencia, adherentes, aDesenvolver, ausentes } =
    calcularGapAnalysis(pessoa, cargo, todasCompetencias);

  // Monta contexto para o Gemini gerar o resumo narrativo
  const pessoaComps = pessoa.individualCompetencies.map(ic => {
    const comp = todasCompetencias.find(c => c.id === ic.competencyId);
    return comp ? { ...comp } : null;
  }).filter(Boolean) as Competency[];

  const cargoComps = (cargo.competencyProfile || []).map(r => {
    const comp = todasCompetencias.find(c => c.id === r.competencyId);
    return comp ? { ...comp } : null;
  }).filter(Boolean) as Competency[];

  // Prompt aprimorado para o Gemini considerar os níveis
  const gapSummary = await gerarResumoNarrativo(
    pessoa, cargo, gaps, scoreAderencia, pessoaComps, cargoComps
  );

  const analise: PessoaAnalysis = {
    comparisonTarget:      'cargo',
    targetId:              cargo.id,
    targetName:            cargo.name,
    analysisDate:          new Date().toISOString(),
    scoreAderencia,
    adherentCompetencies:  adherentes,
    competenciesToDevelop: aDesenvolver,
    competenciesAbsent:    ausentes,
    competencyGaps:        gaps,
    gapSummary,
  };

  return analise;
}

// ─── Resumo narrativo com contexto de níveis ─────────────────────────────────

async function gerarResumoNarrativo(
  pessoa: Pessoa,
  cargo: Cargo,
  gaps: CompetencyGap[],
  score: number,
  pessoaComps: Competency[],
  cargoComps: Competency[]
): Promise<string> {

  const criticos  = gaps.filter(g => g.severity === 'crítico');
  const moderados = gaps.filter(g => g.severity === 'moderado');
  const acima     = gaps.filter(g => g.severity === 'acima');

  const gapLinhas = gaps.slice(0, 8).map(g => {
    if (g.severity === 'acima') return `${g.competencyName}: supera o nível exigido`;
    if (g.severity === 'ok')    return `${g.competencyName}: atende plenamente`;
    return `${g.competencyName}: lacuna ${g.severity} (distância de ${g.gap} nível${g.gap !== 1 ? 'is' : ''})`;
  }).join('\n');

  const prompt = `Você é especialista em gestão de competências no serviço público brasileiro.

Redija um parecer qualitativo sobre a aderência do servidor ${pessoa.name} ao cargo de ${cargo.name}${cargo.dasLevel ? ` (${cargo.dasLevel})` : ''}.

FORMATO OBRIGATÓRIO — siga rigorosamente:
- Texto corrido em português, 3 a 4 parágrafos de 3 a 5 frases cada.
- Tom profissional e objetivo, sem subjetivismo excessivo.
- PROIBIDO: emojis, Markdown (##, **, *, backticks, hífens como marcadores), tabelas com pipe, listas numeradas ou com marcadores, timelines, cronogramas, planos detalhados com metas trimestrais.
- NÃO repita níveis numéricos, percentuais ou o score no texto — a interface já exibe essa informação visualmente. Foque na interpretação qualitativa.
- O cargo representa expectativas do papel institucional, não uma avaliação definitiva da pessoa.

ESTRUTURA DOS PARÁGRAFOS:
Parágrafo 1: Leitura geral do perfil — como o servidor se posiciona em relação ao conjunto de exigências do cargo, considerando a proporção de competências atendidas, com lacunas e destaques positivos.
Parágrafo 2: Pontos de alinhamento — competências onde o servidor demonstra convergência e por que são relevantes para as responsabilidades do papel.
Parágrafo 3: Lacunas prioritárias — as competências com maior distância em relação ao esperado e qual o impacto prático no exercício das atribuições do cargo. Destaque especialmente as lacunas críticas, se houver.
Parágrafo 4: Síntese de prontidão — frase conclusiva sobre o grau de preparação atual e o eixo de desenvolvimento mais estratégico, sem julgamento definitivo.

DADOS PARA ANÁLISE:
Servidor: ${pessoa.name}
Cargo: ${cargo.name}${cargo.dasLevel ? ` (${cargo.dasLevel})` : ''}
Posição em cada competência requerida:
${gapLinhas || 'Nenhum dado de gap disponível — perfil de proficiência não definido para este cargo.'}
${criticos.length > 0 ? `Lacunas críticas: ${criticos.map(g => g.competencyName).join(', ')}` : 'Sem lacunas críticas.'}
${acima.length > 0 ? `Supera o esperado em: ${acima.map(g => g.competencyName).join(', ')}` : ''}`.trim();

  try {
    return await callGemini(prompt);
  } catch {
    // Fallback local se a IA falhar
    return `Score de aderência: ${score}%. ` +
      (criticos.length > 0
        ? `Gaps críticos identificados em: ${criticos.map(g => g.competencyName).join(', ')}. `
        : 'Nenhum gap crítico identificado. ') +
      `Recomenda-se priorizar o desenvolvimento das competências com maior lacuna em relação ao nível esperado pelo cargo.`;
  }
}

// ─── Helpers para exibição ────────────────────────────────────────────────────

export const SEVERITY_CONFIG = {
  crítico:  { label: 'Crítico',   color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500'     },
  moderado: { label: 'Moderado',  color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
  leve:     { label: 'Leve',      color: 'text-yellow-700',  bg: 'bg-yellow-50',  border: 'border-yellow-200',  dot: 'bg-yellow-400'  },
  ok:       { label: 'Adequado',  color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  acima:    { label: 'Acima',     color: 'text-indigo-700',  bg: 'bg-indigo-50',  border: 'border-indigo-200',  dot: 'bg-indigo-500'  },
} as const;

/** Converte score (0–100) em classificação textual. */
export function classificarScore(score: number): {
  label: string;
  color: string;
  description: string;
} {
  if (score >= 85) return { label: 'Alta aderência',   color: 'text-emerald-700', description: 'Perfil altamente alinhado ao cargo.' };
  if (score >= 65) return { label: 'Boa aderência',    color: 'text-indigo-700',  description: 'Perfil adequado com pontos de desenvolvimento.' };
  if (score >= 40) return { label: 'Aderência parcial',color: 'text-amber-700',   description: 'Lacunas relevantes que demandam plano de desenvolvimento.' };
  return               { label: 'Aderência baixa',     color: 'text-red-700',     description: 'Perfil com lacunas críticas em relação ao cargo.' };
}
