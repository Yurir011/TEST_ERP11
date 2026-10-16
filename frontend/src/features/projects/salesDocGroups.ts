import type { SalesDocument } from "./types";

// 견적서+거래명세서는 같은 set_id 로 묶여 한 세트로 보여준다.
export interface DocSetGroup {
  setId: number;
  estimate?: SalesDocument;
  statement?: SalesDocument;
}

export function groupBySet(documents: SalesDocument[]): DocSetGroup[] {
  const map = new Map<number, DocSetGroup>();
  for (const doc of documents) {
    const group = map.get(doc.set_id) ?? { setId: doc.set_id };
    if (doc.doc_type === "estimate") group.estimate = doc;
    else group.statement = doc;
    map.set(doc.set_id, group);
  }
  return Array.from(map.values()).sort((a, b) => b.setId - a.setId);
}
