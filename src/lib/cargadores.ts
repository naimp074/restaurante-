/**
 * Librerías pesadas que solo se usan al importar o exportar archivos. Se descargan la
 * primera vez que hacen falta, así el sistema abre rápido en las tablets del salón.
 */
export type Xlsx = typeof import('xlsx');

export const cargarXlsx = (): Promise<Xlsx> => import('xlsx');

export const cargarPdf = async () => {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
  }
  return pdfjs;
};

export const cargarOcr = () => import('tesseract.js');
