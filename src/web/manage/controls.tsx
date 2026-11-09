import React from "react"
import { CloseCircleFilled, SearchOutlined } from "@ant-design/icons"

export function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}): React.JSX.Element {
  return (
    <label className="ssm-search">
      <SearchOutlined className="ssm-search-icon" />
      <input
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // 回车收起软键盘，方便直接看结果。
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
      />
      {value && (
        <button
          type="button"
          className="ssm-search-clear"
          aria-label="清除"
          onClick={(e) => {
            e.preventDefault()
            onChange("")
          }}
        >
          <CloseCircleFilled />
        </button>
      )}
    </label>
  )
}

export function Pills<K extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ key: K; label: React.ReactNode }>
  value: K
  onChange: (k: K) => void
}): React.JSX.Element {
  return (
    <div className="ssm-pills" role="tablist">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={o.key === value}
          className={`ssm-pill${o.key === value ? " is-active" : ""}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
