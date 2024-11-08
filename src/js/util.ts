const valFmtter = new Intl.NumberFormat(
  undefined,
  {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  }
)

export const formatNum = (val: number) => valFmtter.format(val)

export type TreeNode =
  | string
  | Element

export type TreeFragment = Array<TreeNode>

const svgTagNamesLookup = new Set(
  ['svg', 'g', 'defs', 'use', 'line', 'circle']
)

type DOMInterface = {
  <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string> | null, childs?: TreeFragment | null): HTMLElementTagNameMap[K]
  <K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, string> | null, childs?: TreeFragment | null): SVGElementTagNameMap[K]
  (tag: string, attrs?: Record<string, string> | null, childs?: TreeFragment | null): Element
}

export const dom: DOMInterface = (tag: string, attrs: Record<string, string> | null = null, childs: TreeFragment | null = null) => {
  const el = document.createElementNS(svgTagNamesLookup.has(tag) ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', tag)

  if (attrs)
    Object
      .entries(attrs)
      .forEach(
        (e) => {
          const [k, v] = e
          el.setAttribute(k, v)
        }
      )

  if (childs) el.append(... childs)

  return el
}
