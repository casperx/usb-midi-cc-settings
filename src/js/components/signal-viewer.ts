import {formatNum, dom, type TreeFragment} from '../util'

import cssUrl from './signal-viewer.css?url'


const roundTo = (val: number, to: number) => Math.round(val / to) * to

const magicNice = (v: number) => {
  const l = Math.log10(v)
  const p = 10 ** Math.floor(l)
  const r = v / p

  if (r > 7) return p * 10
  if (r > 5) return p * 7
  if (r > 3) return p * 5
  if (r > 2) return p * 3
  if (r > 1) return p * 2

  return p
}


const populate = (): TreeFragment => [
  dom('link', {rel: 'stylesheet', href: cssUrl}),
  dom('canvas')
]


type ChannelProps = {
  lineStyle: string
  pointStyle: string

  exclude: boolean
  hidden: boolean
}

type ChannelSlot = {
  values: Float32Array
  props: ChannelProps
}

class Channel {
  #slot: ChannelSlot

  constructor(slot: ChannelSlot) {
    this.#slot = slot
  }

  addPoint(x: number) {
    // access slot values
    const {values} = this.#slot

    // shift old value out
    values.copyWithin(1, 0)

    // replace old value
    values[0] = x
  }
}


export class SignalViewerElement extends HTMLElement {
  readonly #ctx: CanvasRenderingContext2D

  constructor() {
    super()

    const root = this.attachShadow(
      {mode: 'closed'}
    )

    root.append(
      ... populate()
    )

    const el = root.querySelector('canvas')!
    const ctx = el.getContext('2d')!

    this.#ctx = ctx

    const ob = new ResizeObserver(
      () => {
        const {
          offsetWidth,
          offsetHeight
        } = el

        el.width = offsetWidth * devicePixelRatio
        el.height = offsetHeight * devicePixelRatio

        ctx.scale(devicePixelRatio, devicePixelRatio)

        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'

        ctx.font = '16px monospace'

        this.draw()
      }
    )

    ob.observe(el)
  }

  #capacity = 256

  readonly #channels: Array<ChannelSlot> = []

  get capacity() {
    return this.#capacity
  }

  set capacity(capacity: number) {
    for (const channel of this.#channels) {
      const {values: oldValues} = channel, {length} = oldValues

      if (capacity < length)
        // use old buffer
        oldValues.copyWithin(length - capacity, 0)

      else if (capacity > length) {
        // allocate bigger buffer
        const values = new Float32Array(capacity)

        // copy old values
        values.set(oldValues)

        channel.values = values
      }
    }

    this.#capacity = capacity
  }

  addChannel(init: Partial<ChannelProps>) {
    const values = new Float32Array(this.#capacity)

    const {
      lineStyle = '',
      pointStyle = '',

      exclude = false,
      hidden = false
    } = init

    const props: ChannelProps = {
      lineStyle,
      pointStyle,

      exclude,
      hidden
    }

    const slot: ChannelSlot = {
      values,
      props
    }

    this.#channels.push(slot)

    return new Channel(slot)
  }

  #count = 0

  resetTick() {
    this.#count = 0
  }

  tick() {
    ++this.#count
  }

  lockedMin: number | undefined
  lockedMax: number | undefined

  draw() {
    const ctx = this.#ctx

    const {
      canvas: {
        offsetWidth,
        offsetHeight
      }
    } = ctx

    ctx.clearRect(0, 0, offsetWidth, offsetHeight)

    const channels = this.#channels, capacity = this.#capacity, count = this.#count

    if (count === 0) return

    const len = Math.min(capacity, count)

    const lastCapacity = capacity - 1
    const lastCount = count - 1

    let valMinTemp: number | undefined
    let valMaxTemp: number | undefined

    for (const {values: points, props} of channels) {
      if (props.exclude) continue

      for (let i = 0; i < len; ++i) {
        const val = points[i]

        if (valMinTemp === undefined || val < valMinTemp) valMinTemp = val
        if (valMaxTemp === undefined || val > valMaxTemp) valMaxTemp = val
      }
    }

    const valMinScan = valMinTemp!
    const valMaxScan = valMaxTemp!

    const valRangeScan = valMaxScan - valMinScan

    const valMin = this.lockedMin ?? valMinScan
    const valMax = this.lockedMax ?? valMaxScan

    const valRange = valMax - valMin

    const pxPerVal = offsetHeight / valRange
    const pxPerIndex = offsetWidth / lastCapacity

    const mapX = (index: number) => offsetWidth - pxPerIndex * index
    const mapY = (val: number) => offsetHeight - pxPerVal * (val - valMin)

    const gridStepX = magicNice(40 / pxPerIndex)
    const gridStepY = magicNice(40 / pxPerVal)

    const valMinGrid = roundTo(valMin, gridStepY)
    const valMaxGrid = roundTo(valMax, gridStepY)

    // draw grids
    {
      ctx.lineWidth = 1

      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'

      ctx.fillStyle = 'hsl(0 75 60)'

      const zeroX = mapX(lastCount)
      const zeroY = mapY(0)

      const startX = Math.max(zeroX, 0)

      const gridSizeX = gridStepX * pxPerIndex

      ctx.beginPath()

      for (let x = (zeroX < 0 ? zeroX % gridSizeX : zeroX) + gridSizeX; x < offsetWidth; x += gridSizeX) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, offsetHeight)
      }

      const valMaxGridStop = valMaxGrid + gridStepY / 2

      for (let val = valMinGrid; val < valMaxGridStop; val += gridStepY) {
        const y = mapY(val)

        ctx.moveTo(startX, y)
        ctx.lineTo(offsetWidth, y)

        ctx.fillText(formatNum(val), startX, y)
      }

      ctx.strokeStyle = 'hsl(0 0 30)'
      ctx.stroke()

      ctx.beginPath()

      if (zeroX > 0) {
        ctx.moveTo(zeroX, 0)
        ctx.lineTo(zeroX, offsetHeight)
      }

      if (zeroY > 0 && zeroY < offsetHeight) {
        ctx.moveTo(startX, zeroY)
        ctx.lineTo(offsetWidth, zeroY)
      }

      ctx.strokeStyle = 'hsl(0 0 100)'
      ctx.stroke()
    }

    ctx.lineWidth = 1.5

    const pointSize = 1.5

    // draw values
    for (const channel of channels) {
      const {
        values,
        props
      } = channel

      if (props.hidden) continue

      const {
        lineStyle,
        pointStyle
      } = props

      const lines = new Path2D
      const dots = new Path2D

      let i = 0

      const val = values[i]

      const x = mapX(i)
      const y = mapY(val)

      lines.moveTo(x, y)

      dots.moveTo(x, y)
      dots.arc(x, y, pointSize, -Math.PI, Math.PI)

      for (++i; i < len; ++i) {
        const val = values[i]

        const x = mapX(i)
        const y = mapY(val)

        lines.lineTo(x, y)

        dots.moveTo(x, y)
        dots.arc(x, y, pointSize, -Math.PI, Math.PI)
      }

      if (lineStyle) {
        ctx.strokeStyle = lineStyle
        ctx.stroke(lines)
      }

      if (pointStyle) {
        ctx.fillStyle = pointStyle
        ctx.fill(dots)
      }
    }

    // draw stats
    {
      const valMinDisp = formatNum(valMinScan)
      const valMaxDisp = formatNum(valMaxScan)

      const valRangeDisp = formatNum(valRangeScan)

      const gridStepXDisp = formatNum(gridStepX)
      const gridStepYDisp = formatNum(gridStepY)

      const valMinGridDisp = formatNum(valMinGrid)
      const valMaxGridDisp = formatNum(valMaxGrid)

      ctx.fillStyle = 'hsl(0 0 65)'

      ctx.textAlign = 'start'
      ctx.textBaseline = 'bottom'

      ctx.fillText(`time: ${gridStepXDisp}`, 0, offsetHeight - 20)
      ctx.fillText(`value: ${gridStepYDisp}`, 0, offsetHeight)

      ctx.textAlign = 'end'

      ctx.fillText(`min: ${valMinGridDisp}`, offsetWidth, offsetHeight - 20)
      ctx.fillText(`max: ${valMaxGridDisp}`, offsetWidth, offsetHeight)

      ctx.textBaseline = 'top'

      ctx.fillText(`range: ${valRangeDisp}`, offsetWidth, 0)
      ctx.fillText(`min: ${valMinDisp}`, offsetWidth, 20)
      ctx.fillText(`max: ${valMaxDisp}`, offsetWidth, 40)
    }
  }
}

customElements.define('signal-viewer', SignalViewerElement)
