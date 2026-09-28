// ============================================================
// SECUREX — Landing Page (redirects to login or dashboard)
// ============================================================

import { redirect } from 'next/navigation';

export default function RootPage() {
  // In real implementation, check session and redirect appropriately
  // For now, redirect to login
  redirect('/auth/login');
}
