import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

/**
 * Extrai o texto de um PDF fornecido como string base64.
 * Para PDFs de duas colunas, ordena os itens por posição vertical (y)
 * para aproximar a ordem de leitura.
 */
export async function extractTextFromPdfBase64(base64: string): Promise<string> {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Ordena por y decrescente (topo → base) para preservar ordem de leitura
    const items = (content.items as TextItem[])
      .filter(item => item.str?.trim())
      .sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 3) return yDiff;    // linhas diferentes
        return a.transform[4] - b.transform[4];    // mesma linha → esquerda → direita
      });

    const pageText = items.map(item => item.str).join(' ');
    if (pageText.trim()) pageTexts.push(pageText);
  }

  return pageTexts.join('\n\n');
}
