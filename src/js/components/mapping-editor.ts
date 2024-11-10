import {dom, type TreeFragment} from '../util'

import cssUrl from './mapping-editor.css?url'

export type Mapping = {
  input: number
  output: number
}


const bisect = <T>(arr: ArrayLike<T>, dirPred: (x: T) => boolean) => {
  let start = 0, end = arr.length

  while (start < end) {
    const midDec = (end - start) / 2, mid = start + Math.floor(midDec)

    const val = arr[mid]
    const res = dirPred(val)

    if (res)
      start = mid + 1
    else
      end = mid
  }

  return start
}

const clamp = (min: number, max: number, val: number) => {
  if (val > max) return max
  if (val < min) return min

  return val
}


const populate = (): TreeFragment => [
  dom('link', {rel: 'stylesheet', href: cssUrl}),
  dom(
    'svg', void 0, [
      dom(
        'defs', void 0, [
          dom(
            'g', {id: 'dot'}, [
              dom('circle', {cx: '0', cy: '0', r: '20', fill: 'transparent'}),
              dom('circle', {cx: '0', cy: '0', r: '5'})
            ]
          ),
          dom('g', {id: 'lines'})
        ]
      ),
      dom(
        'g', {class: 'grid'}, [
          dom('line', {x1: '0', y1: '10%', x2: '100%', y2: '10%'}),
          dom('line', {x1: '0', y1: '20%', x2: '100%', y2: '20%'}),
          dom('line', {x1: '0', y1: '30%', x2: '100%', y2: '30%'}),
          dom('line', {x1: '0', y1: '40%', x2: '100%', y2: '40%'}),
          dom('line', {x1: '0', y1: '50%', x2: '100%', y2: '50%'}),
          dom('line', {x1: '0', y1: '60%', x2: '100%', y2: '60%'}),
          dom('line', {x1: '0', y1: '70%', x2: '100%', y2: '70%'}),
          dom('line', {x1: '0', y1: '80%', x2: '100%', y2: '80%'}),
          dom('line', {x1: '0', y1: '90%', x2: '100%', y2: '90%'}),
          dom('line', {x1: '10%', y1: '0', x2: '10%', y2: '100%'}),
          dom('line', {x1: '20%', y1: '0', x2: '20%', y2: '100%'}),
          dom('line', {x1: '30%', y1: '0', x2: '30%', y2: '100%'}),
          dom('line', {x1: '40%', y1: '0', x2: '40%', y2: '100%'}),
          dom('line', {x1: '50%', y1: '0', x2: '50%', y2: '100%'}),
          dom('line', {x1: '60%', y1: '0', x2: '60%', y2: '100%'}),
          dom('line', {x1: '70%', y1: '0', x2: '70%', y2: '100%'}),
          dom('line', {x1: '80%', y1: '0', x2: '80%', y2: '100%'}),
          dom('line', {x1: '90%', y1: '0', x2: '90%', y2: '100%'})
        ]
      ),
      dom(
        'g', {
          class: 'graph',
          style: {
            '--line-color': 'hsl(90 75 40)',
            '--dot-color': 'hsl(60 75 50)'
          }
        }, [
          dom(
            'g', {class: 'shows'}, [
              dom('line', {class: 'in'}),
              dom('line', {class: 'out'})
            ]
          ),
          dom(
            'g', {class: 'lines'}, [
              dom('use', {href: '#lines', 'stroke-width': '10', stroke: 'transparent'}),
              dom('use', {href: '#lines', 'stroke-width': '1'})
            ]
          ),
          dom('g', {class: 'dots'})
        ]
      )
    ]
  )
]


const createLine = (x1: string, y1: string, x2: string, y2: string) => dom(
  'line', {
    x1,
    y1,
    x2,
    y2
  }
)

const createDot = (x: string, y: string) => dom(
  'use', {
    href: '#dot',
    x,
    y
  }
)

const mapPercent = (map: Mapping) => {
  const inputTrunc = Math.round(map.input * 1e4) / 1e2
  const outputTrunc = Math.round(map.output * 1e4) / 1e2

  return {
    x: `${inputTrunc}%`,
    y: `${outputTrunc}%`
  }
}


export class MappingEditorElement extends HTMLElement {
  #svgEl: SVGSVGElement

  #graphEl: SVGGElement

  #linesEl: SVGGElement
  #dotsEl: SVGGElement

  #showInEl: SVGLineElement
  #showOutEl: SVGLineElement

  #toMapping(pos: DOMPoint): Mapping {
    const mat = this.#graphEl.getCTM()!

    const {x, y} = pos.matrixTransform(
      mat.inverse()
    )

    const {width, height} = this.#svgEl.getBoundingClientRect()

    return {
      input: x / width,
      output: y / height
    }
  }

  constructor() {
    super()

    const root = this.attachShadow(
      {mode: 'closed'}
    )

    root.append(
      ... populate()
    )

    const svgEl = root.querySelector('svg')!

    svgEl.addEventListener(
      'contextmenu', (e: Event) => e.preventDefault()
    )

    this.#svgEl = svgEl

    this.#graphEl = svgEl.querySelector('.graph')!

    this.#linesEl = svgEl.querySelector('#lines')!
    this.#dotsEl = svgEl.querySelector('.dots')!

    this.#showInEl = svgEl.querySelector('.in')!
    this.#showOutEl = svgEl.querySelector('.out')!

    const linesEl = svgEl.querySelector<SVGGElement>('.lines')!

    linesEl.addEventListener(
      'pointerdown',
      (e) => {
        const {
          buttons,

          offsetX,
          offsetY
        } = e

        if (
          (buttons & 1) == 0
        ) return

        const {
          input,
          output
        } = this.#toMapping(
          new DOMPoint(offsetX, offsetY)
        )

        const maps = this.#maps

        // find insert index
        const index = bisect(maps, (item) => item.input < input)

        // clamp value between adjacent maps
        const {
          input: prevIn,
          output: prevOut
        } = maps[index - 1]

        const {
          input: nextIn,
          output: nextOut
        } = maps[index]

        const map: Mapping = {
          input: clamp(prevIn, nextIn, input),
          output: clamp(prevOut, nextOut, output)
        }

        // insert map
        maps.splice(index, 0, map)

        // sync DOM
        this.#render()
      }
    )
  }

  get lineColor() {
    const {style} = this.#graphEl

    return style.getPropertyValue('--line-color')
  }

  set lineColor(color: string) {
    const {style} = this.#graphEl

    style.setProperty('--line-color', color)
  }

  get dotColor() {
    const {style} = this.#graphEl

    return style.getPropertyValue('--dot-color')
  }

  set dotColor(color: string) {
    const {style} = this.#graphEl

    style.setProperty('--dot-color', color)
  }


  #maps: Array<Mapping> = []

  mapLookup(input: number) {
    const maps = this.#maps

    const
      first = maps[0],
      last = maps[maps.length - 1]

    if (
      input < first.input ||
      input === first.input
    ) return first.output

    if (input > last.input) return last.output

    const res = bisect(maps, (item) => item.input < input)

    const {
      input: prevIn,
      output: prevOut
    } = maps[res - 1]

    const {
      input: curIn,
      output: curOut
    } = maps[res]

    return prevOut + (input - prevIn) / (curIn - prevIn) * (curOut - prevOut)
  }


  get maps() {
    return this.#maps
  }

  set maps(val: Array<Mapping>) {
    this.#maps = val

    // refresh DOM
    this.#render()
  }


  #render() {
    const maps = this.#maps, {length} = maps, last = length - 1

    let i = 0

    const dots: Array<SVGGElement> = []
    const lines: Array<SVGLineElement> = []

    const {x, y} = mapPercent(
      maps[i]
    )

    dots.push(
      createDot(x, y)
    )

    for (i = 1; i < length; ++i) {
      const {
        x: prevX,
        y: prevY
      } = mapPercent(
        maps[i - 1]
      )

      const {x, y} = mapPercent(
        maps[i]
      )

      dots.push(
        createDot(x, y)
      )

      lines.push(
        createLine(prevX, prevY, x, y)
      )
    }

    for (i = 1; i < last; ++i) {
      const s = i

      const dot = dots[i]

      const prevLine = lines[i - 1]
      const nextLine = lines[i]

      const map = maps[i]

      const prevMap = maps[i - 1]
      const nextMap = maps[i + 1]

      dot
        .classList
        .add('edit')

      dot.addEventListener(
        'pointerdown',
        (e) => {
          const {buttons} = e

          if (
            (buttons & 2) == 0
          ) return

          // remove map
          maps.splice(s, 1)

          // sync DOM
          this.#render()
        }
      )

      dot.addEventListener(
        'pointermove',
        (e) => {
          const {
            buttons,

            offsetX,
            offsetY
          } = e

          if (
            (buttons & 1) == 0
          ) return

          const {
            input,
            output
          } = this.#toMapping(
            new DOMPoint(offsetX, offsetY)
          )

          const {
            input: prevIn,
            output: prevOut
          } = prevMap

          const {
            input: nextIn,
            output: nextOut
          } = nextMap

          // update map
          map.input = clamp(prevIn, nextIn, input)
          map.output = clamp(prevOut, nextOut, output)

          // sync DOM
          const {x, y} = mapPercent(map)

          dot.setAttribute('x', x)
          dot.setAttribute('y', y)

          prevLine.setAttribute('x2', x)
          prevLine.setAttribute('y2', y)

          nextLine.setAttribute('x1', x)
          nextLine.setAttribute('y1', y)
        }
      )
    }

    // refresh DOM
    this.#dotsEl.replaceChildren(... dots)
    this.#linesEl.replaceChildren(... lines)
  }


  showIn(val: number | undefined) {
    const showInEl = this.#showInEl

    if (val === undefined) {
      showInEl.removeAttribute('x1')
      showInEl.removeAttribute('y1')

      showInEl.removeAttribute('x2')
      showInEl.removeAttribute('y2')

      return
    }

    const {x} = mapPercent(
      {
        input: val,
        output: 0
      }
    )

    showInEl.setAttribute('x1', x)
    showInEl.setAttribute('y1', '0')

    showInEl.setAttribute('x2', x)
    showInEl.setAttribute('y2', '100%')
  }

  showOut(val: number | undefined) {
    const showOutEl = this.#showOutEl

    if (val === undefined) {
      showOutEl.removeAttribute('x1')
      showOutEl.removeAttribute('y1')

      showOutEl.removeAttribute('x2')
      showOutEl.removeAttribute('y2')

      return
    }

    const {y} = mapPercent(
      {
        input: 0,
        output: val
      }
    )

    showOutEl.setAttribute('x1', '0')
    showOutEl.setAttribute('y1', y)

    showOutEl.setAttribute('x2', '100%')
    showOutEl.setAttribute('y2', y)
  }
}

customElements.define('mapping-editor', MappingEditorElement)
