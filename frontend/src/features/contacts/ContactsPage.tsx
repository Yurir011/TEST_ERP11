import { MainLayout } from "../../components/layout/MainLayout";
import { ContactsView } from "./ContactsView";

export function ContactsPage() {
  return (
    <MainLayout title="연락처">
      <ContactsView />
    </MainLayout>
  );
}
