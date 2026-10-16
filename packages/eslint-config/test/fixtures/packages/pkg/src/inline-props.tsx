// A component whose props shape has no name. It must fail lint.
export function Probe({ label }: { label: string }) {
  return <span>{label}</span>;
}
