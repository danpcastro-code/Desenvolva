import {
  Cargo,
  Competency,
  CargoAnalysis,
  FormularioInstance,
  FormularioTemplate,
  Pessoa,
  SuggestedCompetency,
} from '../types';

const WORKER_URL = 'https://desenvolva-production-ded9.up.railway.app/gemini';

async function callGemini(prompt: string, generationConfig?: { maxOutputTokens?: number }): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (generationConfig) body.generationConfig = generationConfig;

  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Erro ao chamar o Worker: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Resposta vazia da IA.');
  return text;
}

function extractJSON(text: string): any {
  // Remove markdown code blocks
  let clean = text
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim();

  // Encontra o primeiro { e o último } para extrair o JSON
  const jsonStart = clean.indexOf('{');
  const jsonEnd = clean.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('Nenhum JSON encontrado na resposta da IA.');
  }

  clean = clean.substring(jsonStart, jsonEnd + 1);
  return JSON.parse(clean);
}

export const generateCargoDescription = async (
  cargoName: string,
  attributions: string[]
): Promise<string> => {
  const prompt = `
    Elabore uma descrição concisa e profissional para o cargo de "${cargoName}".
    As principais atribuições do cargo são:
    ${attributions.map(a => `- ${a}`).join('\n')}
    A descrição deve resumir o propósito geral do cargo, suas responsabilidades centrais e o contexto em que atua.
    Responda apenas com o texto da descrição, sem títulos ou introduções.
  `;
  try {
    return await callGemini(prompt);
  } catch (error) {
    console.error('Error generating cargo description:', error);
    throw new Error('Falha ao gerar descrição com a IA. Tente novamente.');
  }
};

export const generateCompetencyDescription = async (
  competencyName: string,
  competencyType: 'Técnica' | 'Gerencial' | 'Comportamental'
): Promise<string> => {
  const prompt = `
    Crie uma descrição clara e objetiva para a competência "${competencyName}", que é do tipo "${competencyType}".
    A descrição deve explicar o que é a competência e como ela se manifesta no ambiente de trabalho, especialmente no setor público.
    Responda apenas com o texto da descrição, sem títulos ou formatação extra.
  `;
  try {
    return await callGemini(prompt);
  } catch (error) {
    console.error('Error generating competency description:', error);
    throw new Error('Falha ao gerar descrição da competência com a IA. Tente novamente.');
  }
};

export const fetchCompetencyDetails = async (
  competencyName: string
): Promise<string> => {
  const prompt = `
    Forneça detalhes adicionais sobre a competência "${competencyName}".
    Explique sua importância no ambiente de trabalho moderno, dê exemplos de comportamentos observáveis associados a ela e sugira formas de desenvolvê-la.
    Formate a resposta de forma clara e organizada.
  `;
  try {
    return await callGemini(prompt);
  } catch (error) {
    console.error('Error fetching competency details:', error);
    throw new Error('Falha ao buscar detalhes da competência com a IA. Tente novamente.');
  }
};

export const suggestUnitCompetencies = async (
  unitName: string,
  attributionsText: string,
  allCompetencies: Competency[]
): Promise<string[]> => {
  const competencyListText = allCompetencies
    .map(c => ` - ${c.name} (${c.type}): ${c.description}`)
    .join('\n');

  const prompt = `
    Você é um especialista em Gestão de Pessoas e planejamento estratégico no setor público.
    Analise o nome e as atribuições de uma unidade organizacional e sugira quais competências de um catálogo são estratégicas para o sucesso desta unidade.

    ## Unidade a ser Analisada:
    - Nome da Unidade: ${unitName}
    - Atribuições:
    ${attributionsText}

    ## Catálogo de Competências Disponíveis:
    ${competencyListText}

    ## Instruções:
    1. Analise as responsabilidades e o propósito da unidade.
    2. Identifique de 5 a 8 competências do catálogo que são mais cruciais e estratégicas.
    3. Considere um balanço entre competências técnicas, gerenciais e comportamentais.

    Retorne APENAS um objeto JSON válido, sem texto adicional, sem markdown:
    {"competencyNames": ["nome1", "nome2"]}
  `;

  try {
    const text = await callGemini(prompt);
    const result = extractJSON(text);
    return result.competencyNames || [];
  } catch (error) {
    console.error('Error suggesting unit competencies:', error);
    throw new Error('Falha ao sugerir competências com a IA. Tente novamente.');
  }
};

export const analyzeCargoCompetencies = async (
  cargo: Cargo,
  allCompetencies: Competency[],
  formInstance?: FormularioInstance,
  formTemplate?: FormularioTemplate
): Promise<CargoAnalysis> => {
  const competencyListText = allCompetencies
    .map(c => ` - ${c.name} (${c.type}): ${c.description}`)
    .join('\n');

  let formInputContext = '';
  let formInstructions = '';
  if (formInstance && formTemplate && formInstance.responses) {
    formInputContext = '\n## Contexto Adicional do Formulário de Mapeamento:\n';
    formTemplate.questions.forEach((q: any) => {
      const response = formInstance.responses?.[q.id];
      if (response) {
        const questionText = q.text || q.description;
        const answerText = Array.isArray(response) ? response.join(', ') : response;
        formInputContext += `\nPergunta: ${questionText}\nResposta: ${answerText}\n`;
      }
    });
    formInstructions = `

ANÁLISE ADICIONAL DO FORMULÁRIO:
Com base nas respostas do formulário acima (especialmente notas de importância, competências prioritárias, desafios estratégicos e lacunas identificadas), identifique competências de nível MACRO/ESTRATÉGICO do catálogo que sejam GENUINAMENTE relevantes para o cargo segundo as respostas do formulário.

REGRA RÍGIDA E OBRIGATÓRIA: o array "formMacroCompetencies" deve conter NO MÁXIMO 5 ITENS. Esse é um limite técnico do sistema — um 6º item causará erro de processamento e será descartado. Antes de finalizar a resposta, CONTE os itens do array "formMacroCompetencies" e, se houver mais de 5, REMOVA os menos relevantes até restarem no máximo 5. Não preencha 5 artificialmente: se apenas 2 ou 3 competências se destacarem claramente, retorne somente essas.

Essas competências devem ser retornadas no campo "formMacroCompetencies" do JSON, seguindo o mesmo formato de "suggested", com importanceLevel de 1 a 5 conforme a nota atribuída pelo respondente (ou estimada a partir das prioridades e lacunas indicadas).`;
  }

  const prompt = `Você é um especialista sênior em Gestão de Pessoas e Competências no setor público brasileiro. Realize uma análise de competências integrada e contextualizada seguindo rigorosamente a metodologia abaixo.

REGRAS CRÍTICAS — METODOLOGIA DE PRIORIZAÇÃO:

PASSO 1 — Decomponha cada atribuição em três elementos:
- VERBO PRINCIPAL (ação central: planejar, coordenar, executar, fiscalizar, elaborar...)
- OBJETO (sobre o que a ação incide: macroprocessos, contratos, sistemas, orçamento...)
- CONDICIONANTES (contexto adicional: "em conformidade com a legislação", "junto a outros órgãos"...)

PASSO 2 — Gere candidatas a competências nessa ordem de prioridade:
1º) Competência(s) ligada(s) ao VERBO PRINCIPAL (sempre a mais importante)
2º) Competência(s) ligada(s) ao OBJETO
3º) Competência(s) ligada(s) aos CONDICIONANTES

REGRA ESPECIAL — OBJETO/FINALIDADE COM DOMÍNIO TEMÁTICO ESPECÍFICO:
Se o OBJETO ou a FINALIDADE da atribuição nomear especificamente um sistema, órgão, política, norma ou área de conhecimento (ex: "Sipec", "órgãos gestores de carreiras", "políticas de gestão de pessoas", decretos nominados, sistemas de TI específicos), GARANTA que ao menos UMA das competências candidatas reflita esse domínio temático específico — mesmo quando o VERBO PRINCIPAL for de relacionamento/articulação/comunicação genérico (ex: "articular-se", "representar", "coordenar com"). Não permita que os 3 slots de "suggested" sejam monopolizados inteiramente por competências de "tipo de ato" (articulação, comunicação, negociação) quando o texto nomeia explicitamente um domínio temático concreto ao qual essas ações se referem.

PASSO 3 — Para cada candidata, aplique o TESTE DE NECESSIDADE:
"Se o ocupante do cargo NÃO tivesse esta competência, a atribuição poderia ainda ser cumprida, mesmo que com qualidade ou eficiência reduzida?"
- NÃO (indispensável) → candidata a suggested (importanceLevel mais alto)
- SIM, mas com qualidade/eficiência reduzida (relevante) → candidata a suggested (importanceLevel médio) ou unselected
- SIM, sem impacto perceptível → DESCARTE, não inclua

PASSO 4 — Monte os arrays:
- "suggested": ATÉ 3 competências — apenas as que passaram o teste como indispensáveis ou claramente relevantes. NÃO preencha 3 artificialmente; se a atribuição for muito específica e só houver 1 ou 2 competências indispensáveis/relevantes, retorne apenas essas.
- "unselected": ATÉ 3 competências — alternativas plausíveis mas de menor prioridade que as de "suggested". Pode ser vazio se não houver alternativas razoáveis.
- PROIBIDO repetir nível de importância dentro da mesma atribuição
- Se houver 3 suggested: importanceLevel 6, 5 e 4 (decrescente). Se houver 2: importanceLevel 6 e 5. Se houver 1: importanceLevel 6.
- Se houver unselected, seguem a mesma lógica decrescente a partir de 3 (3,2,1 / 3,2 / 3)
- Mapeie TODAS as atribuições sem exceção
- Use análise semântica: associe competências pelo SIGNIFICADO, mesmo que os termos exatos não coincidam

REGRA ESPECIAL — ATRIBUIÇÕES DE NATUREZA APROBATÓRIA/DECISÓRIA:
Se o VERBO PRINCIPAL for de natureza aprobatória, homologatória ou deliberativa dentro de um fluxo de governança (ex: "aprovar", "submeter à apreciação", "homologar", "referendar", "deliberar", "autorizar", "validar"), a competência de maior prioridade (importanceLevel mais alto) DEVE estar ligada ao PROCESSO DECISÓRIO em si — análise crítica, conformidade normativa, julgamento técnico —, e NÃO ao domínio temático do objeto sendo aprovado. Competências ligadas ao domínio temático do objeto (ex: "Gestão de Pessoas" quando o objeto é um processo de RH) devem ser tratadas como SECUNDÁRIAS (importanceLevel mais baixo ou unselected), pois quem aprova avalia conformidade, não executa a gestão daquele domínio.

ESCALA DE PROFICIÊNCIA (1-5) — TRÊS FATORES COMBINADOS:

FATOR 1 — VERBO DA ATRIBUIÇÃO (base):
- Nível 4-5: "definir políticas", "planejamento estratégico", "decidir", "liderar", "elaborar regulamentação"
- Nível 2-3: "coordenar", "supervisionar", "analisar", "propor melhorias"
- Nível 1: "executar procedimentos", "apoiar", "preparar relatórios"

FATOR 2 — NÍVEL HIERÁRQUICO DO CARGO:
Extrair o CCE/FCE do nome do cargo (ex: "Coordenador-Geral (FCE 1.13)" → FCE 1.13). Se presente, aplicar:
- CCE 1.17 / FCE 1.16 ou superior (Secretário/Diretor): elevar nível base em +1 (mínimo 4)
- FCE 1.13 a 1.15 (Coordenador-Geral): manter nível base, mas garantir mínimo 3
- FCE abaixo de 1.13: manter regra do verbo sem correção
- Sem CCE/FCE no nome: manter regra do verbo sem correção

FATOR 3 — AMPLITUDE DO OBJETO DA ATRIBUIÇÃO:
Analisar o objeto sobre o qual a ação recai e aplicar:
- Escopo institucional amplo (ex: "macroprocessos ministeriais", "toda a cadeia de RH", "múltiplos órgãos"): elevar nível em +1
- Escopo médio (ex: "uma coordenação", "um processo específico"): manter nível base
- Escopo restrito (ex: "uma tarefa pontual", "um relatório específico"): reduzir nível em -1

REGRA FINAL: combinar os três fatores; resultado nunca menor que 1 nem maior que 5.

CARGO A ANALISAR:
Nome: ${cargo.name}
Descrição: ${cargo.description || 'Não informada'}
Atribuições:
${cargo.attributions.map((a, i) => `${i + 1}. ${a.text}`).join('\n')}

CATÁLOGO DE COMPETÊNCIAS:
${competencyListText}
${formInputContext}${formInstructions}

INSTRUÇÃO CRÍTICA SOBRE USO DAS RESPOSTAS DO FORMULÁRIO:
As respostas do formulário representam EXPECTATIVAS DA LIDERANÇA SOBRE O CARGO — não uma avaliação do ocupante atual, e não um diagnóstico de lacunas de nenhuma pessoa específica.

REGRAS OBRIGATÓRIAS:
1. Quando o formulário indica uma competência como prioritária ou com nota alta → significa que O CARGO EXIGE aquela competência em alto nível. NÃO interpretar como 'o ocupante já tem essa competência'.
2. Quando o formulário indica uma competência como 'a desenvolver' ou com nota baixa → significa que O CARGO DEMANDA DESENVOLVIMENTO nessa área para quem o ocupar. NÃO interpretar como 'o ocupante atual tem lacuna'.
3. NUNCA usar linguagem que avalie uma pessoa específica.

LINGUAGEM PROIBIDA:
- 'Respondente demonstrou...'
- 'Respondente identificou lacuna...'
- 'Respondente obteve nota...'
- 'Lacuna de competência a ser desenvolvida'
- 'O ocupante atual...'

LINGUAGEM OBRIGATÓRIA:
- 'O formulário indica que o cargo exige...'
- 'A liderança identificou como prioritário para este cargo...'
- 'As respostas indicam que o cargo opera em contexto de...'
- 'O mapeamento aponta que este cargo demanda...'
- 'Para exercer este cargo, é esperado que o ocupante...'
- 'O cargo requer desenvolvimento em...' (nunca 'o ocupante requer')

Retorne APENAS o JSON abaixo, sem texto antes ou depois, sem markdown, sem explicações:
{
  "summary": "resumo executivo de 2-3 frases do perfil de competências ideal para o cargo",
  "mapping": [
    {
      "attribution": "texto exato da atribuição conforme listada acima",
      "suggested": [
        {
          "name": "nome exato da competência do catálogo",
          "type": "Técnica",
          "rationale": "justificativa conectando a competência à atribuição",
          "confidence": "Alta",
          "requiredProficiency": 4,
          "proficiencyRationale": "justificativa do nível de proficiência",
          "importanceLevel": 6,
          "importanceRationale": "justificativa do ranking de importância"
        },
        {
          "name": "nome exato da segunda competência",
          "type": "Comportamental",
          "rationale": "justificativa",
          "confidence": "Alta",
          "requiredProficiency": 3,
          "proficiencyRationale": "justificativa",
          "importanceLevel": 5,
          "importanceRationale": "justificativa"
        },
        {
          "name": "nome exato da terceira competência",
          "type": "Gerencial",
          "rationale": "justificativa",
          "confidence": "Média",
          "requiredProficiency": 3,
          "proficiencyRationale": "justificativa",
          "importanceLevel": 4,
          "importanceRationale": "justificativa"
        }
      ],
      "unselected": [
        {
          "name": "nome exato da quarta competência",
          "type": "Técnica",
          "rationale": "justificativa",
          "confidence": "Média",
          "requiredProficiency": 2,
          "proficiencyRationale": "justificativa",
          "importanceLevel": 3,
          "importanceRationale": "justificativa"
        },
        {
          "name": "nome exato da quinta competência",
          "type": "Comportamental",
          "rationale": "justificativa",
          "confidence": "Média",
          "requiredProficiency": 2,
          "proficiencyRationale": "justificativa",
          "importanceLevel": 2,
          "importanceRationale": "justificativa"
        },
        {
          "name": "nome exato da sexta competência",
          "type": "Gerencial",
          "rationale": "justificativa",
          "confidence": "Baixa",
          "requiredProficiency": 2,
          "proficiencyRationale": "justificativa",
          "importanceLevel": 1,
"importanceRationale": "justificativa"
        }
      ]
    }
  ]${formInstance && formTemplate ? `,
  "formMacroCompetencies": [
    {
      "name": "nome exato da competência do catálogo",
      "type": "Gerencial",
      "rationale": "justificativa conectando a competência às respostas do formulário (prioridades, desafios, lacunas)",
      "confidence": "Alta",
      "requiredProficiency": 4,
      "proficiencyRationale": "justificativa do nível de proficiência",
      "importanceLevel": 5,
      "importanceRationale": "justificativa baseada na nota atribuída no formulário"
    }
  ]` : ''}
}`;

  try {
    const text = await callGemini(prompt);
    const result = extractJSON(text);
    return result as CargoAnalysis;
  } catch (error) {
    console.error('Error analyzing cargo competencies:', error);
    throw new Error('Falha ao analisar competências do cargo com a IA. Tente novamente.');
  }
};

export const simplifyCargoAnalysis = async (
  cargo: Cargo,
  analysis: CargoAnalysis,
  limit: number = 10
): Promise<SuggestedCompetency[]> => {
  const allSuggestions = [
    ...(analysis.mapping?.flatMap(m => m.suggested) || []),
    ...(analysis.formMacroCompetencies || [])
  ];
  const uniqueSuggestions = Array.from(new Map(allSuggestions.map(s => [s.name, s])).values());

  const prompt = `Você é um especialista em Gestão de Pessoas. Selecione ATÉ ${limit} competências mais críticas para o cargo abaixo.

CARGO:
Nome: ${cargo.name}
Descrição: ${cargo.description || 'Não informada'}
Atribuições:
${cargo.attributions.map(a => `- ${a.text}`).join('\n')}

COMPETÊNCIAS CANDIDATAS:
${uniqueSuggestions.map(s => `- ${s.name} (${s.type}): ${s.rationale || ''}`).join('\n')}

INSTRUÇÕES:
1. Selecione ATÉ ${limit} competências — apenas as genuinamente fundamentais para o desempenho global do cargo. NÃO preencha ${limit} artificialmente: se apenas 6, 7 ou 8 competências se destacarem claramente como fundamentais, retorne somente essas.
2. Atribua ranking único decrescente, começando do total selecionado (ex: se selecionar 8, a mais vital recebe importanceLevel 8, a segunda 7, e assim até 1). NAO repita números
3. Forneça justificativa referenciando as atribuições
4. PRESERVAR NÍVEL DE PROFICIÊNCIA: ao selecionar competências para o Top, preservar o requiredProficiency mais alto encontrado para aquela competência em todo o mapping. Se uma competência aparece em múltiplas atribuições com níveis diferentes, usar o nível MAIS ALTO. Nunca rebaixar um nível de proficiência que já foi definido como 5 para 4.
5. Classifique cada competência como:
   - "threshold": competência mínima obrigatória — sem ela o ocupante não consegue exercer o cargo
   - "diferenciadora": competência de excelência — separa um ocupante mediano de um excepcional

Retorne APENAS o JSON abaixo, sem texto antes ou depois, sem markdown:
{
  "competencies": [
    {
      "name": "nome exato da competência",
      "type": "Técnica",
      "rationale": "justificativa de escolha",
      "requiredProficiency": 4,
      "proficiencyRationale": "justificativa do nível",
      "importanceLevel": 8,
      "importanceRationale": "justificativa baseada nas atribuições",
      "confidence": "Alta",
      "competencyClass": "threshold"
    }
  ]
}`;

  try {
    const text = await callGemini(prompt);
    const result = extractJSON(text);
    let competencies: SuggestedCompetency[] = result.competencies || [];

    // Pós-processamento: garante que requiredProficiency nunca seja rebaixado
    // Constrói mapa com o nível mais alto encontrado em todo o mapping para cada competência
    const maxProficiencyMap = new Map<string, number>();
    for (const m of analysis.mapping || []) {
      for (const s of [...(m.suggested || []), ...(m.unselected || [])]) {
        const current = maxProficiencyMap.get(s.name) || 0;
        if ((s.requiredProficiency || 0) > current) {
          maxProficiencyMap.set(s.name, s.requiredProficiency || 0);
        }
      }
    }
    for (const f of analysis.formMacroCompetencies || []) {
      const current = maxProficiencyMap.get(f.name) || 0;
      if ((f.requiredProficiency || 0) > current) {
        maxProficiencyMap.set(f.name, f.requiredProficiency || 0);
      }
    }
    competencies = competencies.map(c => {
      const maxProf = maxProficiencyMap.get(c.name);
      if (maxProf !== undefined && maxProf > (c.requiredProficiency || 0)) {
        return { ...c, requiredProficiency: maxProf };
      }
      return c;
    });

    // Garantia das competências do formulário: compara contra o que a IA selecionou
    // (não contra mapping.suggested completo, que contém quase tudo e esvaziava formOnly)
    const aiSelectedNames = new Set(competencies.map(c => c.name));
    const formGuaranteed = (analysis.formMacroCompetencies || [])
      .filter(f => !aiSelectedNames.has(f.name))
      .sort((a, b) => (b.importanceLevel || 0) - (a.importanceLevel || 0))
      .slice(0, 3);

    if (formGuaranteed.length > 0) {
      const sortedAsc = [...competencies].sort(
        (a, b) => (a.importanceLevel || 0) - (b.importanceLevel || 0)
      );
      const toRemove = Math.min(
        formGuaranteed.length,
        Math.max(0, competencies.length - (limit - formGuaranteed.length))
      );
      const removeNames = new Set(sortedAsc.slice(0, toRemove).map(c => c.name));

      competencies = [
        ...competencies.filter(c => !removeNames.has(c.name)),
        ...formGuaranteed.map(m => ({
          ...m,
          addedManually: false,
          competencyClass: (m.competencyClass || 'diferenciadora') as 'threshold' | 'diferenciadora',
        })),
      ];

      competencies = competencies
        .sort((a, b) => (b.importanceLevel || 0) - (a.importanceLevel || 0))
        .map((c, idx, arr) => ({ ...c, importanceLevel: arr.length - idx }));
    }

    // Fallback geral: garante que nenhuma competência fique sem classificação
    competencies = competencies.map(c => ({
      ...c,
      competencyClass: c.competencyClass || 'diferenciadora',
    }));

    return competencies;
  } catch (error) {
    console.error('Error simplifying cargo analysis:', error);
    throw new Error('Falha ao simplificar análise com a IA. Tente novamente.');
  }
};
export const generateBehaviorProfile = async (
  cargo: Cargo,
  topCompetencies: SuggestedCompetency[]
): Promise<string> => {
  const prompt = `Você é um especialista em Gestão de Pessoas no setor público brasileiro.

Com base nas competências mais cruciais identificadas para o cargo abaixo, escreva um descritivo de 2 a 3 parágrafos sobre o COMPORTAMENTO ESPERADO de quem ocupa este cargo com excelência — como essa pessoa age, decide, se comunica e se relaciona no dia a dia, de forma integrada (não liste competência por competência separadamente, escreva um perfil coeso e narrativo).

CARGO:
Nome: ${cargo.name}
Descrição: ${cargo.description || 'Não informada'}

COMPETÊNCIAS MAIS CRUCIAIS PARA O CARGO:
${topCompetencies.map(c => `- ${c.name} (${c.type}): ${c.rationale || ''}`).join('\n')}

Responda APENAS com o texto do descritivo, em português, sem títulos, sem markdown, sem introduções como "Aqui está" — direto ao texto.`;

  try {
    return await callGemini(prompt);
  } catch (error) {
    console.error('Error generating behavior profile:', error);
    throw new Error('Falha ao gerar descritivo de comportamento com a IA. Tente novamente.');
  }
};
export const analyzePessoaCompetencyGap = async (
  pessoa: Pessoa,
  requiredCompetencies: Competency[]
): Promise<string> => {
  const competencyList = pessoa.individualCompetencies.length > 0
    ? pessoa.individualCompetencies.map(ic => `${ic.competencyName}: ${ic.proficiencyLevel}/5`).join(', ')
    : 'Nenhuma competência avaliada';

  const prompt = `
Analise o gap de competências do servidor em relação às competências requeridas pelo cargo.
Servidor: ${pessoa.name}
Competências do servidor (nome: nível atual/5): ${competencyList}
Competências requeridas pelo cargo: ${requiredCompetencies.map(c => c.name).join(', ')}
Forneça uma análise clara do gap e sugestões de desenvolvimento.
  `.trim();
  try {
    return await callGemini(prompt);
  } catch (error) {
    console.error('Error analyzing pessoa competency gap:', error);
    throw new Error('Falha ao analisar gap de competências. Tente novamente.');
  }
};

export const batchFindCompetencyMatches = async (
  required: { name: string; description: string }[],
  available: { name: string; description: string }[]
): Promise<Map<string, string | null>> => {
  if (required.length === 0 || available.length === 0) return new Map();

  const prompt = `
Você é especialista em mapeamento de competências no serviço público.
Para cada competência REQUERIDA, identifique a competência DISPONÍVEL que melhor corresponde semanticamente.
Se não houver correspondência razoável, use null.

REQUERIDAS:
${required.map(r => `- "${r.name}": ${r.description || 'sem descrição'}`).join('\n')}

DISPONÍVEIS:
${available.map(a => `- "${a.name}": ${a.description || 'sem descrição'}`).join('\n')}

Retorne APENAS JSON válido, sem texto adicional:
{"matches": {"<nome_requerido>": "<nome_disponivel_ou_null>", ...}}
Inclua uma entrada para CADA competência requerida.
  `.trim();

  try {
    const text = await callGemini(prompt);
    const result = extractJSON(text);
    const map = new Map<string, string | null>();
    if (result.matches && typeof result.matches === 'object') {
      for (const [key, val] of Object.entries(result.matches)) {
        map.set(key, typeof val === 'string' ? val : null);
      }
    }
    return map;
  } catch (error) {
    console.error('Error finding competency matches:', error);
    return new Map();
  }
};

export const generateCompetencyProfiles = async (
  cargo: Cargo,
  topCompetencies: SuggestedCompetency[]
): Promise<CargoAnalysis['competencyProfiles']> => {
  if (!topCompetencies.length) return [];

  // Extrai nível hierárquico do nome do cargo
  const hierarchyMatch = cargo.name.match(/\(([^)]+)\)/);
  const hierarchy = hierarchyMatch ? hierarchyMatch[1].trim() : 'Não especificado';

  let hierarchyGuideline = '';
  if (/FCE\s*1\.(1[6-9]|2\d)/i.test(hierarchy)) {
    hierarchyGuideline = `${hierarchy} — Diretor/Secretário: predominantemente níveis 4-5`;
  } else if (/FCE\s*1\.(13|14|15)/i.test(hierarchy)) {
    hierarchyGuideline = `${hierarchy} — Coordenador-Geral/Nível equivalente: níveis 3-5 dependendo da amplitude do objeto`;
  } else if (/FCE|CCE/i.test(hierarchy)) {
    hierarchyGuideline = `${hierarchy} — FCE abaixo de 1.13 ou CCE: níveis 2-4`;
  } else {
    hierarchyGuideline = `${hierarchy} — calibrar pelos verbos e amplitude do objeto das atribuições`;
  }

  const buildPrompt = (competenciesToProcess: SuggestedCompetency[]) => `Você é especialista em mapeamento de competências no setor público brasileiro.
Para o cargo descrito abaixo, gere o perfil detalhado de elementos constitutivos para CADA competência listada.

OBRIGATÓRIO: gerar perfil detalhado para TODAS as competências recebidas, sem exceção. Se houver N competências no Top, o retorno deve ter exatamente N perfis.

CARGO:
Nome: ${cargo.name}
Hierarquia/Nível: ${hierarchyGuideline}
Descrição: ${cargo.description || 'Não informada'}
Atribuições reais:
${cargo.attributions.map((a, i) => `${i + 1}. ${a.text}`).join('\n')}

COMPETÊNCIAS A PROCESSAR:
${competenciesToProcess.map(c => `- ${c.name} (${c.type}) [${c.competencyClass || 'diferenciadora'}]: ${c.rationale || ''}`).join('\n')}

REGRA CRÍTICA — COMO TRANSFORMAR TAREFAS EM ELEMENTOS CONSTITUTIVOS GENUÍNOS:

O erro mais comum é descrever O QUE O OCUPANTE FAZ (tarefa) em vez de O QUE ELE PRECISA SER CAPAZ DE FAZER (capacidade). Veja os pares de contraste abaixo e aplique a mesma transformação:

PAR 1:
❌ ERRADO (tarefa): 'Coordenar macroprocessos de avaliação de desempenho mantendo conformidade legal'
✅ CORRETO (capacidade): 'Capacidade de estruturar sistemas de avaliação que equilibrem objetividade técnica e equidade, gerando feedback formativo para decisões de progressão'

PAR 2:
❌ ERRADO (tarefa): 'Elaborar Plano de Desenvolvimento de Pessoas alinhado ao Decreto nº 9.991'
✅ CORRETO (capacidade): 'Capacidade de traduzir diagnósticos de lacunas de competências em planos de desenvolvimento priorizados por impacto estratégico e viabilidade institucional'

PAR 3:
❌ ERRADO (tarefa): 'Articular-se com órgãos gestores de carreiras e o Sipec para alinhamento de políticas'
✅ CORRETO (capacidade): 'Capacidade de construir consensos entre atores institucionais com interesses e prioridades divergentes, viabilizando alinhamento de políticas sem perder autonomia decisória'

PAR 4:
❌ ERRADO (tarefa): 'Aprovar processos seletivos para pós-graduação com conformidade ao Decreto nº 9.991'
✅ CORRETO (capacidade): 'Capacidade de avaliar criticamente propostas sob pressão de tempo e incerteza normativa, identificando inconformidades antes de deliberar'

PAR 5:
❌ ERRADO (tarefa): 'Gerenciar equipe de 30+ pessoas com autonomia moderada a alta'
✅ CORRETO (capacidade): 'Capacidade de calibrar nível de autonomia delegada conforme maturidade de cada membro da equipe, mantendo coesão e direcionamento sem centralizar decisões'

TESTE OBRIGATÓRIO antes de incluir cada elemento constitutivo:
Pergunta 1: 'Este elemento constitutivo descreve o que o ocupante FAZ ou o que ele precisa SER CAPAZ DE FAZER?'
Pergunta 2: 'Um candidato vindo de outro órgão ou setor poderia ser avaliado nessa capacidade?'
Se a resposta à Pergunta 1 for 'o que faz' ou à Pergunta 2 for 'não' → reescreva partindo da capacidade cognitiva/relacional subjacente.

FORMATO DOS ELEMENTOS CONSTITUTIVOS — VARIAR O PREFIXO:
Não use sempre o mesmo prefixo. Varie naturalmente entre as seguintes opções:
- 'Capacidade de...'
- 'Habilidade de...'
- 'Aptidão para...'
- Sem prefixo explícito (direto ao verbo): ex: 'Diagnosticar lacunas estratégicas e traduzi-las em prioridades de desenvolvimento'
- 'Competência para...'

A variação deve ser natural — não force todos os formatos em cada competência. O objetivo é que a leitura dos 3-4 elementos constitutivos de uma competência não seja monótona.

Verbos recomendados: diagnosticar, estruturar, equilibrar, construir, traduzir, antecipar, calibrar, integrar, avaliar criticamente, mobilizar, articular, priorizar, transformar

O contexto específico do cargo (macroprocessos, legislação, sistemas) pode aparecer APENAS entre parênteses após a capacidade genuína, nunca como parte central do elemento constitutivo.

PROIBIDO incluir referências a atribuições específicas (ex: 'atribuição I', 'atribuição II', 'Art. X') dentro do texto dos elementos constitutivos. Referências documentais pertencem EXCLUSIVAMENTE à Fundamentação. Os elementos constitutivos devem descrever apenas a capacidade, de forma limpa e direta, sem citações documentais.

INSTRUÇÃO SOBRE LIDERANÇA DE EQUIPES:
Quando o cargo tiver subordinados diretos (informação disponível nas respostas do formulário — ex: número de pessoas gerenciadas, nível de autonomia da equipe), a competência 'Gestão de Pessoas' DEVE incluir obrigatoriamente pelo menos UMA subcapacidade relacionada à liderança direta de equipes — não apenas à coordenação de macroprocessos de RH.

Exemplos de subcapacidades de liderança direta:
- 'Conduzir equipes numerosas sob pressão, mantendo engajamento, coesão e direcionamento claro em contexto de alta demanda'
- 'Calibrar nível de autonomia delegada conforme maturidade de cada membro da equipe, desenvolvendo talentos sem abrir mão de resultados'
- 'Criar ambiente psicologicamente seguro que estimule iniciativa e aprendizado contínuo em equipes especializadas'
- 'Identificar e reter talentos em equipes técnicas, construindo planos de desenvolvimento individualizados que equilibrem aspirações e necessidades institucionais'

Esta subcapacidade de liderança direta deve ser diferente das subcapacidades relacionadas a macroprocessos de RH — ela descreve a capacidade de LIDERAR as pessoas da própria equipe, não de coordenar políticas de gestão de pessoas para o ministério.

CALIBRAÇÃO DE NÍVEIS REQUERIDOS:
- Regra hierárquica: ${hierarchyGuideline}
- Regra de amplitude: objeto mais amplo (ex: "toda a cadeia de RH de um ministério", "múltiplos macroprocessos") → nível mais alto dentro da faixa; objeto restrito (ex: "um processo específico") → nível mais baixo da faixa
- Escala: 1=básico/executa procedimentos, 2=operacional, 3=coordena/analisa, 4=define/lidera, 5=estratégico/define política

REGRA DE COERÊNCIA E CRITÉRIOS PARA DEFINIÇÃO DE NÍVEL DOS ELEMENTOS CONSTITUTIVOS:

PRINCÍPIO GERAL: o nível de proficiência da competência representa o teto exigido pelo cargo. Os Elementos Constitutivos devem refletir esse teto — pelo menos os mais críticos devem atingi-lo. NUNCA gerar todos os elementos com o mesmo nível — isso indica falta de diferenciação real.

REGRAS POR NÍVEL DA COMPETÊNCIA:
- requiredProficiency 5: pelo menos 2 elementos devem ter nivelRequerido 5 (os mais críticos); demais entre 3-4
- requiredProficiency 4: elementos entre 3-5, maioria em 4; pelo menos 1 pode ser 5 se for elemento central
- requiredProficiency 3: elementos entre 2-4, maioria em 3
- requiredProficiency 2: elementos entre 1-3, maioria em 2
- requiredProficiency 1: elementos entre 1-2

CRITÉRIOS OBRIGATÓRIOS para definir o nivelRequerido de cada Elemento Constitutivo:
Use a combinação dos três critérios abaixo — não o verbo isolado:

CRITÉRIO 1 — Complexidade cognitiva exigida:
- N1-2: execução de procedimentos conhecidos, aplicação direta de regras estabelecidas
- N3: adaptação a situações variadas, julgamento em contextos conhecidos com alguma ambiguidade
- N4: análise crítica em contextos complexos, decisão sob incerteza, síntese de múltiplas variáveis
- N5: síntese estratégica, criação de soluções inéditas, julgamento em contextos altamente ambíguos sem precedentes claros

CRITÉRIO 2 — Amplitude do impacto:
- N1-2: impacto restrito a uma tarefa ou processo específico
- N3: impacto em uma unidade ou processo completo
- N4: impacto em múltiplas unidades, macroprocessos ou stakeholders
- N5: impacto institucional/ministerial, afeta política pública ou estratégia organizacional ampla

CRITÉRIO 3 — Autonomia e responsabilidade:
- N1-2: executa sob supervisão direta, responsabilidade limitada
- N3: executa com supervisão ocasional, responde pelos próprios resultados
- N4: decide e responde pelos resultados em seu escopo, com accountability perante liderança
- N5: decide com autonomia plena em seu domínio, responde perante instâncias superiores, órgãos de controle ou stakeholders externos

APLICAÇÃO: o nivelRequerido de cada Elemento Constitutivo deve ser determinado pela combinação dos três critérios — não por um único fator. Se dois critérios apontam para N4 e um aponta para N5, o resultado é N4 ou N5 dependendo do peso relativo no contexto do cargo.

REGRAS ESTRUTURAIS:
1. Gere EXATAMENTE um objeto por competência listada — não omita nenhuma.
2. Elementos Constitutivos — REGRA DE QUANTIDADE:
   - Competências classificadas como 'threshold': SEMPRE gerar exatamente 4 elementos constitutivos — nunca 3 ou menos
   - Competências classificadas como 'diferenciadora': gerar 3 ou 4 elementos constitutivos
   - Nunca gerar 5 ou mais em nenhum caso. Se tiver mais de 4 candidatas, selecione apenas as 4 mais importantes e descarte as demais.
   - Devem ser ESPECÍFICOS deste cargo (não genéricos do catálogo).
3. nivelRequerido — REGRA PARA CALIBRAÇÃO:
   Combinar três fatores:
   a) Natureza da subcapacidade: cognitiva complexa → 4-5; técnica aplicada → 3-4; operacional → 1-3
   b) Nível hierárquico do cargo: extrair CCE/FCE do nome — FCE 1.13+ → mínimo 3; FCE 1.16+ → mínimo 4
   c) Amplitude do objeto: escopo ministerial/institucional amplo → elevar nível; escopo restrito → reduzir
   Nunca atribuir N1 ou N2 para cargos FCE 1.13 ou superior, salvo casos excepcionais. Resultado sempre entre 1 e 5.
4. fundamentacao: 1-2 frases citando atribuições reais do cargo e o contexto institucional — explique POR QUE esta competência é necessária PARA ESTE cargo específico.
5. Use linguagem técnica e objetiva compatível com documentos de gestão de pessoas do governo federal.

Retorne APENAS o JSON abaixo, sem texto antes ou depois, sem markdown:
{
  "profiles": [
    {
      "competencyName": "nome exato da competência",
      "competencyClass": "threshold",
      "fundamentacao": "1-2 frases citando atribuições reais...",
      "elementosConstitutivos": [
        { "nome": "Capacidade de avaliar X considerando Y no contexto de Z", "nivelRequerido": 4 },
        { "nome": "Habilidade de construir X entre atores com interesses Y", "nivelRequerido": 3 }
      ]
    }
  ]
}`;

  const doCall = async (comps: SuggestedCompetency[]): Promise<NonNullable<CargoAnalysis['competencyProfiles']>> => {
    const text = await callGemini(buildPrompt(comps), { maxOutputTokens: 16000 });
    const parsed = extractJSON(text);
    return (parsed.profiles || []) as NonNullable<CargoAnalysis['competencyProfiles']>;
  };

  try {
    let profiles = await doCall(topCompetencies);

    // Verifica quais competências estão faltando e faz segunda chamada se necessário
    const generatedNames = new Set(profiles.map(p => p.competencyName));
    const missing = topCompetencies.filter(c => !generatedNames.has(c.name));
    if (missing.length > 0) {
      try {
        const extra = await doCall(missing);
        profiles = [...profiles, ...extra];
      } catch {
        // segunda chamada falhou — retorna o que tem
      }
    }

    return profiles;
  } catch (error) {
    console.error('Error generating competency profiles:', error);
    throw new Error('Falha ao gerar perfil detalhado de competências. Tente novamente.');
  }
};

export const extractCompetenciesFromResume = async (
  resumeText: string,
  allCompetencies: Competency[]
): Promise<string[]> => {
  const catalogList = allCompetencies
    .map(c => `"${c.name}"${c.description ? ` — ${c.description.substring(0, 100)}` : ''}`)
    .join('\n');

  const prompt = `
Você é especialista em mapeamento de competências no serviço público brasileiro.

TAREFA: Analise TODO o conteúdo do currículo abaixo (cargos exercidos, responsabilidades, atribuições, cursos, formações, áreas de interesse e soft skills) e identifique quais competências do CATÁLOGO a pessoa demonstra — por correspondência SEMÂNTICA, não literal.

REGRAS:
- O currículo pode usar nomes diferentes dos do catálogo. Ex: "FOCO NOS RESULTADOS PARA OS CIDADÃOS" pode corresponder a "Orientação a Resultados".
- Considere o histórico completo, não apenas seções rotuladas como "competências".
- Retorne APENAS nomes copiados EXATAMENTE do catálogo (sem alteração de grafia).
- Inclua se houver evidência razoável no currículo; exclua apenas se claramente sem relação.

CATÁLOGO DE COMPETÊNCIAS (use estes nomes exatos no retorno):
${catalogList}

CURRÍCULO:
${resumeText}

Retorne APENAS JSON válido, sem texto adicional:
{"competencyNames": ["nome exato do catálogo 1", "nome exato do catálogo 2"]}
`.trim();

  try {
    const text = await callGemini(prompt);
    const result = extractJSON(text);
    return result.competencyNames || [];
  } catch (error) {
    console.error('Error extracting competencies from resume:', error);
    throw new Error('Falha ao extrair competências do currículo. Tente novamente.');
  }
};