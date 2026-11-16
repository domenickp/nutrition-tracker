export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" role="status" aria-label={label} />
    </div>
  );
}
