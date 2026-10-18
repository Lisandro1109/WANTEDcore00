"use client";

import { accountEmailDomain, accountEmailLocal, t } from "@wanted/shared";

export function EmailField({
  value,
  onChange,
}: {
  value: string;
  onChange: (local: string) => void;
}) {
  return (
    <label>
      {t("auth.email")}
      <span className="email-field">
        <input
          value={value}
          onChange={(event) => onChange(accountEmailLocal(event.target.value))}
          autoComplete="username"
          spellCheck={false}
          required
        />
        <span className="email-domain">@{accountEmailDomain}</span>
      </span>
    </label>
  );
}
