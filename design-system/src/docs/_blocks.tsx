/**
 * MDX 문서 페이지에서 쓰는 작은 표시용 블록들.
 *
 * 라이브러리가 아니라 문서를 위한 가구입니다 — `src/components`의 어떤 것도 이걸
 * import하면 안 됩니다. 토큰은 전부 `var()`로 읽기 때문에, 표는 항상 스타일시트가
 * 실제로 해석한 값을 보여주지 복사본을 보여주지 않습니다.
 */
import * as React from "react"

import type { EvidenceRole, Token } from "#lib/tokens"

const cell: React.CSSProperties = {
  padding: "7px 10px",
  borderBottom: "1px solid var(--fm-line)",
  verticalAlign: "top",
  textAlign: "left",
}

const head: React.CSSProperties = {
  ...cell,
  borderBottom: "1px solid var(--fm-line-strong)",
  fontSize: "var(--fm-size-caption)",
  fontWeight: 600,
  color: "var(--fm-text-muted)",
}

const mono: React.CSSProperties = {
  fontFamily: "var(--fm-font-mono)",
  fontSize: "var(--fm-size-caption)",
}

export function Frame({ children, width = 400 }: { children: React.ReactNode; width?: number }) {
  return (
    <div
      className="theme-fathomark"
      style={{
        width,
        maxWidth: "100%",
        background: "var(--fm-shell)",
        color: "var(--fm-text)",
        fontFamily: "var(--fm-font-sans)",
        border: "1px solid var(--fm-line)",
        borderRadius: "var(--fm-radius-panel)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  )
}

/** 토큰 표: 스와치 또는 리터럴, 이름, 그리고 용도. */
export function TokenTable({ tokens, swatch = false }: { tokens: Token[]; swatch?: boolean }) {
  return (
    <div className="theme-fathomark" style={{ background: "var(--fm-shell)", borderRadius: 12, padding: 4 }}>
      <table className="fm-doc-table" style={{ color: "var(--fm-text)" }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...head, width: swatch ? 56 : 92 }}>
              {swatch ? "" : "값"}
            </th>
            <th scope="col" style={{ ...head, width: 190 }}>
              토큰
            </th>
            <th scope="col" style={head}>
              용도
            </th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.name}>
              <td style={cell}>
                {swatch ? (
                  <span
                    aria-hidden="true"
                    style={{
                      display: "block",
                      width: 36,
                      height: 24,
                      borderRadius: 6,
                      background: `var(${t.name})`,
                      border: "1px solid var(--fm-line-strong)",
                    }}
                  />
                ) : (
                  <span style={{ ...mono, color: "var(--fm-text-dim)" }}>{t.value}</span>
                )}
              </td>
              <td style={cell}>
                <span style={{ ...mono, color: "var(--fm-text)" }}>{t.name}</span>
                {swatch && (
                  <div style={{ ...mono, color: "var(--fm-text-muted)", fontSize: "var(--fm-size-micro)" }}>
                    {t.value}
                  </div>
                )}
              </td>
              <td style={{ ...cell, fontSize: "var(--fm-size-note)", color: "var(--fm-text-dim)", lineHeight: 1.5 }}>
                {t.use}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 의미를 지닌 색 하나: 채움, 틴트, 그리고 거기 붙은 규칙. */
export function RoleCard({ role }: { role: EvidenceRole }) {
  return (
    <div
      className="theme-fathomark"
      style={{
        display: "flex",
        gap: 12,
        padding: 12,
        borderRadius: "var(--fm-radius-panel)",
        background: role.tint ? `var(${role.tint})` : "var(--fm-card)",
        border: `1px solid var(${role.tintLine ?? "--fm-line"})`,
        color: "var(--fm-text)",
        fontFamily: "var(--fm-font-sans)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          flexShrink: 0,
          borderRadius: 9,
          background: `var(${role.base})`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: "var(--fm-size-label)", fontWeight: 600 }}>{role.label}</span>
        <span style={{ fontSize: "var(--fm-size-caption)", lineHeight: 1.5, color: "var(--fm-text-dim)" }}>
          {role.meaning} {role.appearsOn}
        </span>
        <span style={{ ...mono, fontSize: "var(--fm-size-micro)", color: "var(--fm-text-muted)" }}>
          {[role.base, role.tint, role.tintLine, role.text].filter(Boolean).join("  ")}
        </span>
      </div>
    </div>
  )
}

/** 해야 할 것 / 하지 말 것. "하지 말 것"은 언제나 이 프로젝트에서 실제로 저지른 실수입니다. */
export function Rule({
  children,
  kind = "do",
  title,
}: {
  children: React.ReactNode
  kind?: "do" | "dont"
  title: string
}) {
  const ok = kind === "do"
  return (
    <div
      className="theme-fathomark"
      style={{
        display: "flex",
        gap: 10,
        padding: "11px 12px",
        borderRadius: "var(--fm-radius-card)",
        background: ok ? "var(--fm-vault-tint)" : "var(--fm-error-tint)",
        border: `1px solid var(${ok ? "--fm-vault-tint-line" : "--fm-error-tint-line"})`,
        fontFamily: "var(--fm-font-sans)",
        marginBottom: 8,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          marginTop: 2,
          width: 6,
          height: 6,
          borderRadius: 3,
          flexShrink: 0,
          background: `var(${ok ? "--fm-vault" : "--fm-error"})`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontSize: "var(--fm-size-label)",
            fontWeight: 600,
            color: `var(${ok ? "--fm-vault" : "--fm-error-text"})`,
          }}
        >
          {title}
        </span>
        <span
          className="fm-doc-prose"
          style={{ fontSize: "var(--fm-size-note)", lineHeight: 1.5, color: "var(--fm-text-dim)" }}
        >
          {children}
        </span>
      </div>
    </div>
  )
}

export { cell as docCell, head as docHead, mono as docMono }
