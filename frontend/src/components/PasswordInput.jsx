/**
 * Password field with show/hide toggle (accessibility: aria-pressed on toggle button).
 */
import { useState } from "react";

/** Controlled password input with optional label and autocomplete hint. */
export default function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  minLength,
  required = false,
}) {
  const [visible, setVisible] = useState(false);
  const inputId = id || `password-${label?.replace(/\s+/g, "-").toLowerCase() || "field"}`;

  return (
    <label className="field password-field" htmlFor={inputId}>
      {label}
      <span className="password-input-wrap">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          minLength={minLength}
          required={required}
        />
        <button
          type="button"
          className="password-toggle"
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
}
