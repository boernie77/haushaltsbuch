import { type Account, type Category, categoryLabel } from "./types";

// Auswahl "Kategorie ODER Umbuchung auf ein eigenes Konto" (Import-Vorschau
// und Regeln). Umbuchungen werden im <select> als "account:<id>" kodiert.
const ACCOUNT_PREFIX = "account:";

interface Props {
  accounts: Account[];
  ariaLabel: string;
  categories: Category[];
  categoryId: string;
  className?: string;
  disabled?: boolean;
  // Konto, das gerade importiert wird → keine Umbuchung auf sich selbst.
  excludeAccountId?: string;
  onChange: (target: { categoryId: string; transferAccountId: string }) => void;
  placeholder: string;
  required?: boolean;
  transferAccountId: string;
}

export default function TargetSelect({
  accounts,
  ariaLabel,
  categories,
  categoryId,
  className = "input",
  disabled,
  excludeAccountId,
  onChange,
  placeholder,
  required,
  transferAccountId,
}: Props) {
  const value = transferAccountId
    ? `${ACCOUNT_PREFIX}${transferAccountId}`
    : categoryId;
  const transferTargets = accounts.filter((a) => a.id !== excludeAccountId);
  return (
    <select
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value;
        onChange(
          next.startsWith(ACCOUNT_PREFIX)
            ? {
                categoryId: "",
                transferAccountId: next.slice(ACCOUNT_PREFIX.length),
              }
            : { categoryId: next, transferAccountId: "" }
        );
      }}
      required={required}
      value={value}
    >
      <option value="">{placeholder}</option>
      <optgroup label="Kategorien">
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {categoryLabel(c)}
          </option>
        ))}
      </optgroup>
      {transferTargets.length > 0 && (
        <optgroup label="Umbuchung (eigenes Konto, keine Ausgabe)">
          {transferTargets.map((a) => (
            <option key={a.id} value={`${ACCOUNT_PREFIX}${a.id}`}>
              ↔ {a.icon} {a.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
