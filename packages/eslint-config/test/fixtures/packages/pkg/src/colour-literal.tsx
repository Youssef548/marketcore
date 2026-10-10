// A component that names a colour instead of a role. The token layer is the one place a
// value belongs, so this must fail lint — otherwise the design system's own rule ("one
// file is the look") is enforced by whoever remembers to grep.
export function Swatch() {
  return <span className="rounded bg-[#4f46e5] text-[oklch(0.98_0_0)]">swatch</span>;
}
