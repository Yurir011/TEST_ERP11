import { ContactsView } from "../contacts/ContactsView";
import { MobileLayout } from "./MobileLayout";

export function MobileContactsPage() {
  return (
    <MobileLayout title="연락처">
      <ContactsView />
    </MobileLayout>
  );
}
