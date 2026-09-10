import { MainLayout } from "./MainLayout";

interface PlaceholderPageProps {
  title: string;
  description: string;
  step: string;
}

export function PlaceholderPage({ title, description, step }: PlaceholderPageProps) {
  return (
    <MainLayout title={title} description={description}>
      <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
        <p className="text-sm text-text-muted">{step} 단계에서 구현 예정입니다.</p>
      </div>
    </MainLayout>
  );
}
