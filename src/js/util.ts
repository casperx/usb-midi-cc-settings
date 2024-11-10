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

type DOMAttrs = Record<string, string | Array<string> | Record<string, string>>

type DOMInterface = {
  <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: DOMAttrs, childs?: TreeFragment): HTMLElementTagNameMap[K]
  <K extends keyof SVGElementTagNameMap>(tag: K, attrs?: DOMAttrs, childs?: TreeFragment): SVGElementTagNameMap[K]
  (tag: string, attrs?: DOMAttrs, childs?: TreeFragment): Element
}

export const dom: DOMInterface = (tag: string, attrs?: DOMAttrs, childs?: TreeFragment) => {
  const el = document.createElementNS(svgTagNamesLookup.has(tag) ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', tag)

  if (attrs)
    Object
      .entries(attrs)
      .forEach(
        (e) => {
          const [k, v] = e

          if (k === 'style' && typeof v === 'object') {
            const {style} = el as HTMLElement

            Object
              .entries(v)
              .forEach(
                (e) => {
                  const [k, v] = e

                  style.setProperty(k, v)
                }
              )

            return
          }

          if (k === 'class' && Array.isArray(v)) {
            const {classList} = el as HTMLElement

            v.forEach(
              (v) => classList.add(v)
            )

            return
          }

          if (typeof v !== 'string') throw new Error('invalid attribute value')

          el.setAttribute(k, `${v}`)
        }
      )

  if (childs) el.append(... childs)

  return el
}
