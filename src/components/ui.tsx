import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";
export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Area({
  label,
  hint,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea rows={4} {...props} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <span className="notice-dot" />
      <div>{children}</div>
    </div>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}
export function Wave({ active = false }: { active?: boolean }) {
  return (
    <div className={`wave ${active ? "active" : ""}`} aria-hidden="true">
      {Array.from({ length: 37 }, (_, i) => (
        <i
          key={i}
          style={{
            height:
              12 + Math.sin(i * 0.8) ** 2 * 48 + Math.sin(i * 0.31) ** 2 * 30,
            animationDelay: `${i * -0.09}s`,
          }}
        />
      ))}
    </div>
  );
}
