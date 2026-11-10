import { useParams } from "react-router-dom";
import { MaterialForm } from "../materials/MaterialForm";
import { NewMaterialButton } from "../materials/NewMaterialButton";
import { MobileLayout } from "./MobileLayout";

/** 모바일 자재 등록/수정 (PC 와 같은 입력 폼). 저장하면 모바일 상세 화면으로 간다. */
export function MobileMaterialFormPage() {
  const { id } = useParams();
  return (
    <MobileLayout title={id ? "자재 수정" : "자재 등록"} backTo={id ? `/m/materials/${id}` : "/m/materials"} hideTabs right={id ? <NewMaterialButton mobile /> : undefined}>
      <MaterialForm basePath="/m/materials" />
    </MobileLayout>
  );
}
