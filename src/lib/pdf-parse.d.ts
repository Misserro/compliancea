declare module "pdf-parse" {
  function pdfParse(dataBuffer: Buffer, options?: any): Promise<{ text: string; numpages: number; info: any }>;
  export = pdfParse;
}
