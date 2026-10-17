export type ReviewProfile = {
 closed_at?: string | null;
 review_status: string;
 review_after?: string | null;
 last_contact_at?: string | null;
 activity_known?: number | boolean;
 last_active_at: string;
};

// Derived from activity, independently of an administrator's follow-up deadline.
export function inactivityReviewDate(profile: ReviewProfile): string | null {
 if (!profile.activity_known || profile.closed_at || profile.review_status === 'closed') return null;
 const date = new Date(profile.last_active_at);
 if (!Number.isFinite(date.getTime())) return null;
 const day = date.getUTCDate();
 date.setUTCDate(1);
 date.setUTCMonth(date.getUTCMonth() + 24);
 const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
 date.setUTCDate(Math.min(day, lastDay));
 return date.toISOString();
}

export function privacyReviewStatus(profile: ReviewProfile, now = new Date()) {
 if (profile.closed_at || profile.review_status === 'closed') return 'closed';
 if (profile.review_status === 'pendingErasure') return 'pendingErasure';
 const today = now.toISOString().slice(0, 10);
 if (profile.review_status === 'contacted') {
  // Existing contacts without a deadline get 30 days from the recorded contact.
  const fallback = new Date(profile.last_contact_at ?? '');
  fallback.setUTCDate(fallback.getUTCDate() + 30);
  const deadline = profile.review_after || (Number.isFinite(fallback.getTime()) ? fallback.toISOString().slice(0, 10) : null);
  return deadline && deadline > today ? 'contacted' : 'pending';
 }
 if (profile.review_after) return profile.review_after > today ? 'active' : 'pending';
 const threshold = new Date(now);
 threshold.setUTCMonth(threshold.getUTCMonth() - 24);
 return profile.activity_known && new Date(profile.last_active_at) > threshold ? 'active' : 'pending';
}
