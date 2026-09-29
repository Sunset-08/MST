'use client';

import { use } from 'react';
import { ChallengeForm } from '@/components/org/ChallengeForm';

export default function EditChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ChallengeForm challengeId={id} />;
}
