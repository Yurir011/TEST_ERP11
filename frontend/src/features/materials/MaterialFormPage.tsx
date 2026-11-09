import { useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { MaterialForm } from "./MaterialForm";

export function MaterialFormPage() {
  const { id } = useParams();
  return (
    <MainLayout title={id ? "자재 수정" : "자재 등록"} showBack>
      <MaterialForm basePath="/materials" />
    </MainLayout>
  );
}
