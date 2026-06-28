import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Pessoa, Cargo, OrganizationalUnit, Competency, IndividualCompetency, PessoaAnalysis } from '../types';
import { getPessoas, addPessoa, updatePessoa, deletePessoa, getCargos, getUnits, getCompetencies } from '../services/firebaseService';
import { analyzePessoaCompetencyGap, extractCompetenciesFromResume } from '../services/geminiService';
import { calcularGapAnalysis } from '../services/gapAnalysisService';
import GapAnalysisResult from './GapAnalysisResult';
import { PlusIcon, PencilIcon, TrashIcon, UserCircleIcon, BeakerIcon, CheckIcon, PrinterIcon, ArrowUpTrayIcon, DocumentTextIcon } from './Icons';

const LoadingSpinner: React.FC<{text?: string}> = ({ text = "Aguarde..." }) => (
    <div className="flex items-center justify-center space-x-2 p-4">
        <div className="w-4 h-4 rounded-full animate-pulse bg-indigo-500"></div>
        <span className="text-sm text-gray-500">{text}</span>
    </div>
);

// Form for creating/editing people
const PessoaForm: React.FC<{
    pessoa: Partial<Pessoa> | null;
    cargos: Cargo[];
    units: OrganizationalUnit[];
    onSave: (pessoa: Omit<Pessoa, 'id'> | Pessoa) => Promise<void>;
    onCancel: () => void;
}> = ({ pessoa, cargos, units, onSave, onCancel }) => {
    const [name, setName] = useState(pessoa?.name || '');
    const [email, setEmail] = useState(pessoa?.email || '');
    const [cargoId, setCargoId] = useState(pessoa?.cargoId || '');
    const [cargoSearch, setCargoSearch] = useState(
        () => cargos.find(c => c.id === pessoa?.cargoId)?.name || ''
    );
    const [showCargoDrop, setShowCargoDrop] = useState(false);
    const [resumeFile, setResumeFile] = useState<Pessoa['resumeFile']>(pessoa?.resumeFile);
    const [resumeText, setResumeText] = useState(pessoa?.resumeText || '');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const unitId = useMemo(() => {
        return cargos.find(c => c.id === cargoId)?.unitId || '';
    }, [cargoId, cargos]);

    const unitMap = useMemo(() => new Map(units.map(u => [u.id, u.name])), [units]);

    const normStr = (s: string) =>
        s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    const filteredCargos = useMemo(() => {
        const q = normStr(cargoSearch.trim());
        if (!q) return cargos.slice(0, 8);
        return cargos
            .filter(c => normStr(c.name).includes(q) || normStr(c.dasLevel || '').includes(q))
            .slice(0, 8);
    }, [cargoSearch, cargos]);

    const handleCargoSelect = (c: Cargo) => {
        setCargoId(c.id);
        setCargoSearch(c.name);
        setShowCargoDrop(false);
    };

    const handleCargoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCargoSearch(e.target.value);
        setCargoId('');
        setShowCargoDrop(true);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = (event.target?.result as string).split(',')[1];
            setResumeFile({
                name: file.name,
                data: base64,
                mimeType: file.type
            });
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        if (!name || !email || !cargoId) {
            alert('Nome, e-mail e cargo são obrigatórios.');
            return;
        }
        const pessoaData = { 
            ...pessoa, 
            name, 
            email, 
            cargoId, 
            unitId,
            resumeFile,
            resumeText,
            individualCompetencies: pessoa?.individualCompetencies || [],
            analysis: pessoa?.analysis || null
        } as Omit<Pessoa, 'id'> | Pessoa;
        await onSave(pessoaData);
    };

    return (
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 animate-fade-in max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                        {pessoa?.id ? 'Editar Pessoa' : 'Nova Pessoa'}
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">
                        {pessoa?.id ? 'Atualize as informações do colaborador no sistema.' : 'Cadastre um novo colaborador para iniciar o mapeamento.'}
                    </p>
                </div>
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                    <UserCircleIcon className="w-6 h-6" />
                </div>
            </div>

            <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Nome Completo</label>
                        <input 
                            type="text" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            placeholder="Ex: João Silva..."
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none font-medium text-slate-700" 
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">E-mail Institucional</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={e => setEmail(e.target.value)} 
                            placeholder="joao.silva@orgao.gov.br"
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none font-medium text-slate-700" 
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="relative">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Cargo</label>
                        <input
                            type="text"
                            value={cargoSearch}
                            onChange={handleCargoInput}
                            onFocus={() => setShowCargoDrop(true)}
                            onBlur={() => setTimeout(() => setShowCargoDrop(false), 150)}
                            placeholder="Digite para buscar cargo..."
                            autoComplete="off"
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none font-medium text-slate-700"
                        />
                        {showCargoDrop && (
                            <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                                {filteredCargos.length > 0 ? filteredCargos.map(c => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onMouseDown={() => handleCargoSelect(c)}
                                        className={`w-full px-4 py-3 text-left flex items-baseline gap-2 hover:bg-indigo-50 transition-colors ${cargoId === c.id ? 'bg-indigo-50' : ''}`}
                                    >
                                        <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{c.name}</span>
                                        {c.dasLevel && (
                                            <span className="text-xs font-bold text-indigo-500 flex-shrink-0">{c.dasLevel}</span>
                                        )}
                                    </button>
                                )) : (
                                    <div className="px-4 py-3 text-sm text-slate-400">Nenhum cargo encontrado.</div>
                                )}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Unidade Organizacional</label>
                        <div className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-500">
                            {unitMap.get(unitId) || 'Selecione um cargo acima'}
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 ml-1">Currículo e Experiência</label>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="cursor-pointer group relative flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50 hover:bg-white hover:border-indigo-300 transition-all"
                            >
                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                                    <ArrowUpTrayIcon className="w-6 h-6 text-indigo-500" />
                                </div>
                                <p className="text-sm font-bold text-slate-700">
                                    {resumeFile ? 'Alterar Arquivo' : 'Anexar Currículo'}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">PDF, Imagem ou TXT</p>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handleFileChange} 
                                    accept=".pdf,image/*,.txt" 
                                    className="hidden" 
                                />
                                {resumeFile && (
                                    <div className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold">
                                        <DocumentTextIcon className="w-4 h-4" />
                                        <span className="truncate max-w-[150px]">{resumeFile.name}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <textarea 
                                value={resumeText} 
                                onChange={e => setResumeText(e.target.value)} 
                                className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[2rem] focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none font-medium text-slate-700 leading-relaxed resize-none h-full min-h-[180px]" 
                                placeholder="Ou cole o texto do currículo aqui para análise direta pela IA..."
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-10 pt-8 border-t border-slate-100 flex justify-end gap-4">
                <button 
                    onClick={onCancel} 
                    className="px-8 py-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all"
                >
                    Cancelar
                </button>
                <button 
                    onClick={handleSave} 
                    className="px-8 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
                >
                    Salvar Colaborador
                </button>
            </div>
        </div>
    );
};

// Detail view for a single person
const PessoaDetail: React.FC<{
    pessoa: Pessoa;
    cargoName: string;
    unitName: string;
    allCargos: Cargo[];
    allUnits: OrganizationalUnit[];
    allCompetencies: Competency[];
    onBack: () => void;
    onEdit: (pessoa: Pessoa) => void;
    onProfileUpdate: (pessoa: Pessoa) => Promise<void>;
}> = ({ pessoa, cargoName, unitName, allCargos, allUnits, allCompetencies, onBack, onEdit, onProfileUpdate }) => {
    
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Cargo atual da pessoa (null quando pessoa não tem cargoId ou cargo não encontrado)
    const cargoAtual = useMemo(
        () => allCargos.find(c => c.id === pessoa.cargoId) ?? null,
        [allCargos, pessoa.cargoId]
    );

    // Resultado estruturado do cálculo — preenchido ao clicar "Analisar com IA"
    // ou restaurado automaticamente ao montar se já existe análise salva + cargo disponível
    const [analysisResult, setAnalysisResult] = useState<ReturnType<typeof calcularGapAnalysis> | null>(null);

    useEffect(() => {
        if (pessoa.analysis && cargoAtual && !analysisResult) {
            try {
                setAnalysisResult(calcularGapAnalysis(pessoa, cargoAtual, allCompetencies));
            } catch {
                // Cargo sem perfil — analysisResult permanece null; UI mostra aviso
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cargoAtual]);

    const handleExtractCompetencies = async () => {
        if (!pessoa.resumeFile && !pessoa.resumeText) {
            alert("Anexe um currículo ou cole o texto do currículo primeiro.");
            return;
        }

        setIsExtracting(true);
        setError(null);
        try {
            let resumeInput = pessoa.resumeText || '';

            // Extrai texto do PDF via pdf.js (importação dinâmica para não inflar o bundle)
            if (pessoa.resumeFile?.mimeType === 'application/pdf') {
                const { extractTextFromPdfBase64 } = await import('../utils/pdfExtractor');
                const pdfText = await extractTextFromPdfBase64(pessoa.resumeFile.data);
                if (pdfText.trim()) {
                    console.log('[Currículo PDF] texto extraído (primeiros 500 chars):', pdfText.substring(0, 500));
                    resumeInput = pdfText + (resumeInput ? '\n\n' + resumeInput : '');
                } else {
                    throw new Error('Não foi possível ler o texto do PDF. O arquivo pode estar em formato de imagem (escaneado). Tente colar o texto manualmente no campo de currículo.');
                }
            }

            if (!resumeInput.trim()) {
                alert("Nenhum texto disponível para análise. Cole o texto do currículo manualmente.");
                return;
            }

            const extractedNames = await extractCompetenciesFromResume(resumeInput, allCompetencies);

            if (extractedNames.length === 0) {
                alert("Nenhuma competência foi identificada no currículo.");
                return;
            }

            // Matching tolerante: normaliza acentos e case; fallback por substring
            const norm = (s: string) =>
                s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

            const newCompetencies: IndividualCompetency[] = extractedNames.flatMap(name => {
                const n = norm(name);
                const comp =
                    allCompetencies.find(c => norm(c.name) === n) ??
                    allCompetencies.find(c => norm(c.name).includes(n) || n.includes(norm(c.name)));
                if (!comp) {
                    console.warn(`[Extração] nome retornado pela IA não encontrado no catálogo: "${name}"`);
                    return [];
                }
                return [{
                    competencyId: comp.id,
                    competencyName: comp.name,
                    competencyType: comp.type,
                    proficiencyLevel: 3
                }];
            });

            if (newCompetencies.length === 0) {
                alert("A IA identificou competências mas nenhuma casou com o catálogo. Verifique o console para detalhes.");
                return;
            }

            // Merge com existentes: substitui por nome, adiciona novas
            const merged = [...pessoa.individualCompetencies];
            newCompetencies.forEach(newComp => {
                const index = merged.findIndex(c => c.competencyName === newComp.competencyName);
                if (index >= 0) {
                    merged[index] = newComp;
                } else {
                    merged.push(newComp);
                }
            });

            await onProfileUpdate({ ...pessoa, individualCompetencies: merged });
            alert(`${newCompetencies.length} competências extraídas e atualizadas no perfil.`);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsExtracting(false);
        }
    };

    const handleAnalysis = async () => {
        if (!cargoAtual) {
            setError("Cargo atual não encontrado. Vincule o servidor a um cargo com perfil de competências.");
            return;
        }

        setIsAnalyzing(true);
        setError(null);
        try {
            // 1. Cálculo local instantâneo — exibe cards/radar enquanto IA processa
            const result = calcularGapAnalysis(pessoa, cargoAtual, allCompetencies);
            setAnalysisResult(result);

            // 2. Texto narrativo da IA
            const requiredCompetencies = allCompetencies.filter(c =>
                cargoAtual.competencyProfile?.some(r => r.competencyId === c.id)
            );
            const gapSummary = await analyzePessoaCompetencyGap(pessoa, requiredCompetencies, cargoAtual.name);

            // 3. Persiste no Firestore
            const newAnalysis: PessoaAnalysis = {
                comparisonTarget: 'cargo',
                targetId:         cargoAtual.id,
                targetName:       cargoAtual.name,
                scoreAderencia:   result.scoreAderencia,
                adherentCompetencies:  result.adherentes,
                competenciesToDevelop: result.aDesenvolver,
                competenciesAbsent:    result.ausentes,
                competencyGaps:        result.gaps,
                gapSummary,
            };
            await onProfileUpdate({ ...pessoa, analysis: newAnalysis });

        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handlePrint = () => {
        if (!pessoa.analysis) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert("Não foi possível abrir a janela de impressão. Verifique se o seu navegador está bloqueando pop-ups.");
            return;
        }

        const { analysis } = pessoa;
        const { competencyGaps } = analysis;

        const generateTableRows = () => {
            if (!competencyGaps || competencyGaps.length === 0) {
                return '<tr><td colspan="5" style="text-align: center; padding: 16px;">Nenhum gap de competência encontrado.</td></tr>';
            }
            return competencyGaps.map(item => `
                <tr>
                    <td>${item.competencyName}</td>
                    <td>${item.competencyType}</td>
                    <td style="text-align: center;">${item.requiredLevel}</td>
                    <td style="text-align: center;">${item.currentLevel}</td>
                    <td style="text-align: center;">
                         <span style="padding: 4px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: bold; ${
                             item.gap > 0 
                                 ? 'background-color: #FEE2E2; color: #991B1B;' 
                                 : 'background-color: #D1FAE5; color: #065F46;'
                         }">
                            ${item.gap > 0 ? `-${item.gap}` : (item.gap === 0 ? '0' : `+${Math.abs(item.gap)}`)}
                         </span>
                    </td>
                </tr>
            `).join('');
        };

        const content = `
            <html>
                <head>
                    <title>Análise de Competências - ${pessoa.name}</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 800px; margin: 20px auto; padding: 20px; }
                        h1, h2 { color: #111827; }
                        h1 { font-size: 24px; border-bottom: 2px solid #E5E7EB; padding-bottom: 10px; }
                        h2 { font-size: 20px; margin-top: 30px; color: #4F46E5; }
                        p { margin-bottom: 10px; }
                        .header-info { background-color: #F9FAFB; border: 1px solid #E5E7EB; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                        .summary { font-style: italic; background-color: #F3F4F6; padding: 15px; border-left: 4px solid #6366F1; border-radius: 4px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #E5E7EB; padding: 12px; text-align: left; }
                        th { background-color: #F9FAFB; font-weight: 600; }
                        tr:nth-child(even) { background-color: #F9FAFB; }
                        @media print {
                            body { margin: 0; }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Relatório de Análise de Competências</h1>
                        
                        <div class="header-info">
                            <strong>Pessoa:</strong> ${pessoa.name}<br>
                            <strong>Cargo:</strong> ${cargoName}<br>
                            <strong>Unidade:</strong> ${unitName}<br>
                            <strong>Data da Análise:</strong> ${new Date().toLocaleDateString('pt-BR')}
                        </div>

                        <h2>Resumo da Análise (vs. ${analysis.comparisonTarget === 'cargo' ? 'Cargo: ' : analysis.comparisonTarget === 'unit' ? 'Unidade: ' : ''}${analysis.targetName})</h2>
                        <p class="summary">${analysis.gapSummary.split('\n\n').filter((p: string) => p.trim()).map((p: string) => p.trim()).join('<br><br>')}</p>

                        <h2>Matriz de Gaps de Competências</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th>Competência</th>
                                    <th>Tipo</th>
                                    <th style="text-align: center;">Nível Exigido</th>
                                    <th style="text-align: center;">Nível Atual</th>
                                    <th style="text-align: center;">Gap</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${generateTableRows()}
                            </tbody>
                        </table>
                    </div>
                </body>
            </html>
        `;

        printWindow.document.write(content);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    };


    return (
        <div className="animate-fade-in space-y-8">
            <button 
                onClick={onBack} 
                className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-indigo-600 transition-colors group"
            >
                <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center group-hover:border-indigo-200 group-hover:bg-indigo-50 transition-all">
                    &larr;
                </div>
                Voltar para a lista
            </button>

            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-10 border-b border-slate-100 bg-slate-50/30">
                    <div className="flex justify-between items-start flex-wrap gap-6">
                        <div className="flex items-center gap-6">
                            <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                                <UserCircleIcon className="w-10 h-10" />
                            </div>
                            <div>
                                <h1 className="text-4xl font-black text-slate-900 tracking-tight">{pessoa.name}</h1>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 uppercase tracking-wider">
                                        {cargoName}
                                    </span>
                                    <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                                    <span className="text-sm font-bold text-indigo-600">{unitName}</span>
                                </div>
                                <p className="text-sm font-medium text-slate-400 mt-2">{pessoa.email}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {pessoa.analysis && (
                                <button 
                                    onClick={handlePrint} 
                                    className="flex items-center px-6 py-3 bg-white border border-slate-200 text-sm font-bold rounded-2xl text-slate-700 hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                                >
                                    <PrinterIcon className="w-5 h-5 mr-2 text-slate-400"/>Imprimir
                                </button>
                            )}
                            <button 
                                onClick={() => onEdit(pessoa)} 
                                className="flex items-center px-6 py-3 bg-indigo-600 text-white text-sm font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                            >
                                <PencilIcon className="w-5 h-5 mr-2"/>Editar Perfil
                            </button>
                        </div>
                    </div>
                </div>
                
                <div className="p-10">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Perfil de Competências</h2>
                            <p className="text-slate-500 font-medium mt-1">Mapeamento individual baseado em currículo e avaliações.</p>
                        </div>
                        <div className="flex gap-3">
                            {(pessoa.resumeFile || pessoa.resumeText) && (
                                <button 
                                    onClick={handleExtractCompetencies} 
                                    disabled={isExtracting}
                                    className="flex items-center px-6 py-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-bold rounded-2xl hover:bg-emerald-100 disabled:opacity-50 transition-all"
                                >
                                    <BeakerIcon className="w-5 h-5 mr-2"/>
                                    {isExtracting ? "Extraindo..." : "Extrair do Currículo"}
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {pessoa.resumeFile && (
                        <div className="mb-8 p-6 bg-indigo-50/50 border border-indigo-100 rounded-[2rem] flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                                    <DocumentTextIcon className="w-6 h-6 text-indigo-500" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-900">Currículo Anexado</p>
                                    <p className="text-xs font-medium text-slate-500">{pessoa.resumeFile.name}</p>
                                </div>
                            </div>
                            <span className="px-4 py-1.5 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-full">
                                Pronto para análise
                            </span>
                        </div>
                    )}

                    {pessoa.individualCompetencies.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                           {pessoa.individualCompetencies.map(ic => (
                               <div key={ic.competencyId} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group hover:bg-white hover:shadow-md transition-all">
                                   <div className="flex items-center gap-3">
                                       <div className={`w-2 h-2 rounded-full ${
                                           ic.competencyType === 'Técnica' ? 'bg-blue-500' :
                                           ic.competencyType === 'Gerencial' ? 'bg-emerald-500' :
                                           'bg-amber-500'
                                       }`}></div>
                                       <span className="text-sm font-bold text-slate-700">{ic.competencyName}</span>
                                   </div>
                                   <span className="text-[10px] font-black bg-white px-2 py-1 rounded-lg border border-slate-200 text-slate-500">
                                       NÍVEL {ic.proficiencyLevel}
                                   </span>
                               </div>
                           ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                            <p className="text-slate-400 font-bold italic">Nenhum perfil de competências preenchido.</p>
                        </div>
                    )}
                </div>

                <div className="p-10 bg-slate-50 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Análise de Aderência</h2>
                            <p className="text-slate-500 font-medium mt-1">
                                {cargoAtual
                                    ? `vs. ${cargoAtual.name}${cargoAtual.dasLevel ? ` (${cargoAtual.dasLevel})` : ''}`
                                    : 'Comparação entre perfil individual e requisitos do cargo.'}
                            </p>
                        </div>
                        <button
                            onClick={handleAnalysis}
                            disabled={isAnalyzing || !cargoAtual}
                            title={!cargoAtual ? 'Nenhum cargo vinculado a este servidor' : undefined}
                            className="flex items-center px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                            <BeakerIcon className="w-5 h-5 mr-2" />
                            {isAnalyzing ? "Analisando..." : "Analisar com IA"}
                        </button>
                    </div>

                    {error && (
                        <div className="p-6 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-4 text-red-700 mb-6">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-red-500 shadow-sm">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <p className="font-bold">{error}</p>
                        </div>
                    )}

                    {/* Aviso defensivo: cargo não encontrado */}
                    {!cargoAtual && !error && (
                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800 mb-6 flex items-start gap-3">
                            <span className="text-lg flex-shrink-0">⚠️</span>
                            <span>Este servidor não está vinculado a um cargo com perfil de competências definido. Edite o cadastro para vincular um cargo e, em seguida, execute a análise de IA no módulo de Cargos.</span>
                        </div>
                    )}

                    {/* Resultado: mostra GapAnalysisResult quando há resultado calculado */}
                    {analysisResult && cargoAtual ? (
                        <GapAnalysisResult
                            pessoa={pessoa}
                            cargo={cargoAtual}
                            result={analysisResult}
                            competencias={allCompetencies}
                            aiMode="auto"
                            aiText={pessoa.analysis?.gapSummary}
                            isGeneratingAi={isAnalyzing}
                        />
                    ) : !isAnalyzing && cargoAtual && (
                        <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-300 shadow-sm">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <BeakerIcon className="w-10 h-10 text-slate-300" />
                            </div>
                            <p className="text-slate-900 font-bold text-xl mb-2">Sem análise realizada</p>
                            <p className="text-slate-500 font-medium max-w-sm mx-auto">
                                Clique em "Analisar com IA" para identificar os gaps de competência deste servidor em relação ao cargo.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ImportModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    status: 'idle' | 'processing' | 'results';
    results: { successCount: number; errors: string[] } | null;
}> = ({ isOpen, onClose, status, results }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Importar Pessoas</h2>
                        <p className="text-slate-500 font-medium text-sm mt-1">Alimentação em lote via arquivo CSV.</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-xl hover:bg-slate-200 flex items-center justify-center text-slate-400 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="p-8 overflow-y-auto flex-grow">
                    {status === 'idle' && (
                        <div className="space-y-6">
                            <div className="p-6 bg-amber-50 border border-amber-100 rounded-[2rem]">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-amber-600 shadow-sm">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    </div>
                                    <h4 className="font-black text-amber-900 text-sm uppercase tracking-wider">Formato Obrigatório</h4>
                                </div>
                                <p className="text-sm text-amber-800 font-medium mb-4">O arquivo deve ser um CSV com cabeçalho e as seguintes colunas, nesta ordem exata:</p>
                                <div className="bg-white/50 p-4 rounded-xl font-mono text-xs text-amber-900 border border-amber-200 mb-4">
                                    NOME,CARGO,EMAIL,UNIDADE
                                </div>
                                <ul className="space-y-2">
                                    {[
                                        { label: 'NOME', desc: 'Nome completo (evite vírgulas).' },
                                        { label: 'CARGO', desc: 'Nome exato de um cargo cadastrado.' },
                                        { label: 'EMAIL', desc: 'E-mail único institucional.' },
                                        { label: 'UNIDADE', desc: 'Nome exato de uma unidade cadastrada.' }
                                    ].map((item, i) => (
                                        <li key={i} className="flex items-start gap-2 text-xs text-amber-800/80 font-medium">
                                            <span className="mt-1 w-1 h-1 bg-amber-400 rounded-full flex-shrink-0"></span>
                                            <span><strong className="text-amber-900">{item.label}:</strong> {item.desc}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <p className="text-sm text-slate-500 text-center italic">A importação apenas adicionará novas pessoas. Registros com e-mails já existentes serão ignorados.</p>
                        </div>
                    )}

                    {status === 'processing' && (
                        <div className="py-12">
                            <LoadingSpinner text="Processando arquivo CSV e validando dados..." />
                        </div>
                    )}

                    {status === 'results' && results && (
                        <div className="space-y-6">
                            <div className={`p-8 rounded-[2rem] border ${results.errors.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                                <div className="flex items-center gap-4 mb-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${results.errors.length > 0 ? 'bg-white text-amber-600' : 'bg-white text-emerald-600'}`}>
                                        {results.errors.length > 0 ? <BeakerIcon className="w-6 h-6" /> : <PlusIcon className="w-6 h-6" />}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 tracking-tight">Resultado da Importação</h3>
                                        <p className={`text-sm font-bold ${results.errors.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                            {results.successCount} pessoa(s) importada(s) com sucesso.
                                        </p>
                                    </div>
                                </div>
                                
                                {results.errors.length > 0 && (
                                    <p className="text-sm font-medium text-red-600 bg-white/50 px-4 py-2 rounded-xl border border-red-100 inline-block">
                                        {results.errors.length} linha(s) apresentaram erros e foram ignoradas.
                                    </p>
                                )}
                            </div>

                            {results.errors.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Detalhes dos Erros</h4>
                                    <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-6 max-h-64 overflow-y-auto">
                                        <ul className="space-y-2">
                                            {results.errors.map((error, index) => (
                                                <li key={index} className="flex items-start gap-3 text-sm font-medium text-red-700 bg-red-50/50 p-3 rounded-xl border border-red-100">
                                                    <span className="mt-1.5 w-1.5 h-1.5 bg-red-400 rounded-full flex-shrink-0"></span>
                                                    <code>{error}</code>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                
                <div className="p-8 border-t border-slate-100 bg-slate-50/30 flex justify-end">
                    <button 
                        onClick={onClose} 
                        className="px-10 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                    >
                        {status === 'results' ? 'Concluir' : 'Fechar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Main component for Pessoas page
const Pessoas: React.FC = () => {
    const [pessoas, setPessoas] = useState<Pessoa[]>([]);
    const [cargos, setCargos] = useState<Cargo[]>([]);
    const [units, setUnits] = useState<OrganizationalUnit[]>([]);
    const [competencies, setCompetencies] = useState<Competency[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'list' | 'form' | 'detail'>('list');
    const [currentPessoa, setCurrentPessoa] = useState<Pessoa | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importStatus, setImportStatus] = useState<'idle' | 'processing' | 'results'>('idle');
    const [importResults, setImportResults] = useState<{ successCount: number; errors: string[] } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const cargoMap = useMemo(() => new Map(cargos.map(c => [c.id, c.name])), [cargos]);
    const unitMap = useMemo(() => new Map(units.map(u => [u.id, u.name])), [units]);

    const filteredPessoas = useMemo(() => {
        return pessoas.filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [pessoas, searchTerm]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [pessoasData, cargosData, unitsData, competenciesData] = await Promise.all([
                getPessoas(),
                getCargos(),
                getUnits(),
                getCompetencies()
            ]);
            setPessoas(pessoasData);
            setCargos(cargosData);
            setUnits(unitsData);
            setCompetencies(competenciesData);
        } catch(err) {
            setError("Falha ao carregar dados.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async (pessoa: Omit<Pessoa, 'id'> | Pessoa) => {
        if ('id' in pessoa && pessoa.id) {
            await updatePessoa(pessoa.id, pessoa);
        } else {
            await addPessoa(pessoa);
        }
        await loadData();
        setView('list');
        setCurrentPessoa(null);
    };
    
    const handleProfileUpdate = async (pessoa: Pessoa) => {
        await updatePessoa(pessoa.id, pessoa);
        // Update local state for immediate feedback without full reload
        setPessoas(prev => prev.map(p => p.id === pessoa.id ? pessoa : p));
        setCurrentPessoa(pessoa);
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("Tem certeza que deseja excluir esta pessoa?")) {
            await deletePessoa(id);
            await loadData();
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setImportStatus('processing');
        setIsImportModalOpen(true);

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) {
                setImportResults({ successCount: 0, errors: ["Arquivo vazio ou ilegível."] });
                setImportStatus('results');
                return;
            }

            const rows = text.split('\n').map(row => row.trim()).filter(Boolean);
            const header = rows.shift()?.toLowerCase()?.split(',').map(h => h.trim().replace(/"/g, ''));
            
            if (!header || header.join(',') !== 'nome,cargo,email,unidade') {
                 setImportResults({ successCount: 0, errors: [`Cabeçalho inválido. Esperado: "NOME,CARGO,EMAIL,UNIDADE", mas recebido: "${header?.join(',') || ''}"`] });
                 setImportStatus('results');
                 return;
            }

            // Fix: Explicitly type the tuple for Map constructor to ensure correct inference of [string, string]
            const cargoMapLower = new Map(cargos.map(c => [c.name.toLowerCase().trim(), c.id] as [string, string]));
            const unitMapLower = new Map(units.map(u => [u.name.toLowerCase().trim(), u.id] as [string, string]));
            const existingEmails = new Set(pessoas.map(p => p.email.toLowerCase().trim()));
            
            const newPessoas: Omit<Pessoa, 'id'>[] = [];
            const errors: string[] = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const lineNum = i + 2; // +1 for 1-based index, +1 for header
                const columns = row.split(',').map(c => c.trim().replace(/"/g, ''));

                if (columns.length !== 4) {
                    errors.push(`Linha ${lineNum}: Número incorreto de colunas. Esperado: 4, Recebido: ${columns.length}.`);
                    continue;
                }

                const [name, cargoName, email, unitName] = columns;

                if (!name || !cargoName || !email || !unitName) {
                    errors.push(`Linha ${lineNum}: Todos os campos são obrigatórios. A linha contém valores em branco.`);
                    continue;
                }

                const emailLower = email.toLowerCase();
                if (existingEmails.has(emailLower)) {
                    errors.push(`Linha ${lineNum}: E-mail "${email}" já existe no sistema.`);
                    continue;
                }

                // Explicitly cast CSV values to string to prevent type errors.
                const cargoId = cargoMapLower.get(String(cargoName).toLowerCase().trim()) as string;
                if (!cargoId) {
                    errors.push(`Linha ${lineNum}: Cargo "${cargoName}" não foi encontrada.`);
                    continue;
                }

                // Explicitly cast CSV values to string to prevent type errors.
                const unitId = unitMapLower.get(String(unitName).toLowerCase().trim()) as string;
                if (!unitId) {
                    errors.push(`Linha ${lineNum}: Unidade "${unitName}" não foi encontrada.`);
                    continue;
                }
                
                newPessoas.push({
                    name,
                    email,
                    cargoId,
                    unitId,
                    individualCompetencies: [],
                    analysis: null
                });
                existingEmails.add(emailLower);
            }
            
            let successCount = 0;
            if (newPessoas.length > 0) {
                 try {
                    await Promise.all(newPessoas.map(p => addPessoa(p)));
                    successCount = newPessoas.length;
                } catch (apiError) {
                    errors.push(`Erro geral ao salvar os dados: ${(apiError as Error).message}`);
                }
            }

            setImportResults({ successCount, errors });
            setImportStatus('results');
        };

        reader.onerror = () => {
             setImportResults({ successCount: 0, errors: ["Falha ao ler o arquivo."] });
             setImportStatus('results');
        };

        reader.readAsText(file);
        event.target.value = '';
    };

    const closeImportModal = () => {
        setIsImportModalOpen(false);
        if (importResults && importResults.successCount > 0) {
            loadData();
        }
    };
    
    if (isLoading) return <LoadingSpinner text="Carregando pessoas..." />;
    if (error) return <p className="text-red-500 text-center">{error}</p>;

    if (view === 'form') {
        return <PessoaForm pessoa={currentPessoa} cargos={cargos} units={units} onSave={handleSave} onCancel={() => { setView('list'); setCurrentPessoa(null); }} />;
    }

    if (view === 'detail' && currentPessoa) {
        return <PessoaDetail
            pessoa={currentPessoa}
            cargoName={cargoMap.get(currentPessoa.cargoId) || 'N/A'}
            unitName={unitMap.get(currentPessoa.unitId) || 'N/A'}
            allCargos={cargos}
            allUnits={units}
            allCompetencies={competencies}
            onBack={() => setView('list')}
            onEdit={(p) => { setCurrentPessoa(p); setView('form'); }}
            onProfileUpdate={handleProfileUpdate}
        />;
    }

    return (
        <div className="animate-fade-in space-y-8">
             <ImportModal 
                isOpen={isImportModalOpen}
                onClose={closeImportModal}
                status={importStatus}
                results={importResults}
            />
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv"
                className="hidden"
            />
            
            <div className="flex justify-between items-end flex-wrap gap-6">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Pessoas</h1>
                    <p className="text-slate-500 font-medium">Gerencie o quadro de colaboradores e suas competências individuais.</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative group">
                        <input
                            type="text"
                            placeholder="Pesquisar por nome ou e-mail..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full sm:w-72 pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm font-medium text-slate-700 shadow-sm"
                        />
                        <svg className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <button 
                        onClick={handleImportClick} 
                        className="flex items-center px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl text-sm font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                    >
                        <ArrowUpTrayIcon className="w-5 h-5 mr-2 text-slate-400" /> Importar CSV
                    </button>
                    <button 
                        onClick={() => { setCurrentPessoa(null); setView('form'); }} 
                        className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                    >
                        <PlusIcon className="w-5 h-5 mr-2" /> Novo Colaborador
                    </button>
                </div>
            </div>
            
            {filteredPessoas.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-300 shadow-sm">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <UserCircleIcon className="w-10 h-10 text-slate-300" />
                    </div>
                    <p className="text-slate-900 font-bold text-xl mb-2">Nenhum colaborador encontrado.</p>
                    <p className="text-slate-500 font-medium">Comece cadastrando os colaboradores do seu órgão.</p>
                </div>
            ) : (
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Colaborador</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cargo</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Unidade</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Ações</th>
                            </tr>
                        </thead>
                         <tbody className="divide-y divide-slate-50">
                            {filteredPessoas.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-bold text-xs">
                                                {p.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-slate-900">{p.name}</div>
                                                <div className="text-xs font-medium text-slate-400">{p.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider rounded-lg border border-slate-200">
                                            {cargoMap.get(p.cargoId) || 'Não definido'}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="text-sm font-bold text-indigo-600">{unitMap.get(p.unitId) || 'Não definida'}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex justify-end items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => { setCurrentPessoa(p); setView('detail');}} 
                                                className="px-4 py-2 bg-white border border-slate-200 text-indigo-600 text-xs font-bold rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm"
                                            >
                                                Ver Detalhes
                                            </button>
                                            <button 
                                                onClick={() => { setCurrentPessoa(p); setView('form');}} 
                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                                title="Editar"
                                            >
                                                <PencilIcon className="w-5 h-5" />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(p.id)} 
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                                title="Excluir"
                                            >
                                                <TrashIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                         </tbody>
                    </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Pessoas;