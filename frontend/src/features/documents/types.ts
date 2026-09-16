export type DocumentType = "employment" | "career" | "employment_en";

export interface DocumentRecord {
  id: number;
  user_id: number;
  doc_type: DocumentType;
  purpose: string | null;
  issued_at: string;
}

export const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  employment: "재직증명서",
  career: "경력증명서",
  employment_en: "재직증명서 (영문)",
};
