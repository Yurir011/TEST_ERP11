import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

interface MainLayoutProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function MainLayout({ title, description, actions, children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-10 py-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-text">{title}</h1>
            {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}
