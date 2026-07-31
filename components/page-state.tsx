export function PageState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <div className="card p-8 text-center text-slate-500">Adatok betöltése…</div>;
  if (error) return <div className="card border-red-200 p-5 text-red-700">Hiba: {error}</div>;
  return null;
}
