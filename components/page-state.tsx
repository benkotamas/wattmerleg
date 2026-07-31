export function PageState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <div className="card p-8 text-center text-slate-500" role="status" aria-live="polite"><span className="mx-auto mb-3 block size-6 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-700" aria-hidden="true"/>Adatok betöltése…</div>;
  if (error) return <div className="status-panel status-danger" role="alert"><b>Az adatok nem tölthetők be.</b><p className="mt-1">{error}</p></div>;
  return null;
}
