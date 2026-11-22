export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect x="2" y="2" width="11" height="11" rx="3" fill="#ea4335" />
      <rect x="15" y="2" width="11" height="11" rx="5.5" fill="#fbbc04" />
      <rect x="2" y="15" width="11" height="11" rx="5.5" fill="#34a853" />
      <rect x="15" y="15" width="11" height="11" rx="3" fill="#4285f4" />
    </svg>
  );
}
