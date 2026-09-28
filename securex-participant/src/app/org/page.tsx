// ============================================================
// SECUREX — /org root redirect
// ============================================================

import { redirect } from 'next/navigation';

export default function OrgRootPage() {
  redirect('/org/auth/login');
}
