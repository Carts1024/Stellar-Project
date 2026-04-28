"use client";

import { useId } from "react";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
};

export function SearchBar({ value, onChange, label = "Search", placeholder }: SearchBarProps) {
  const inputId = useId();

  return (
    <div className="search-wrapper">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <svg
        className="search-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        id={inputId}
        type="text"
        className="search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder ?? "Search..."}
      />
    </div>
  );
}
