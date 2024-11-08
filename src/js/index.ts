import {dom, formatNum} from './util'

import type {SignalViewerElement} from './components/signal-viewer'
import type {MappingEditorElement, Mapping} from './components/mapping-editor'

type Pipe = {
  read(len: number): Promise<Uint8Array>
  write(data: Uint8Array): Promise<void>
}

class VendorPipe implements Pipe {
  constructor(
    private readonly dev: USBDevice,
    private readonly epIn: number,
    private readonly epOut: number,
    private buf = new Uint8Array
  ) {}

  async read(len: number): Promise<Uint8Array> {
    let buf = this.buf

    while (buf.length < len) {
      // read data
      const {data} = await this.dev.transferIn(this.epIn, 64)

      if (data === undefined)
        return this.buf = buf

      const {buffer} = data, value = new Uint8Array(buffer)

      // merge with leftover
      const nextBuf = new Uint8Array(buf.length + value.length)

      nextBuf.set(buf, 0)
      nextBuf.set(value, buf.length)

      buf = nextBuf
    }

    // remove read
    this.buf = buf.slice(len)

    return buf.slice(0, len)
  }

  async write(data: Uint8Array) {
    let pend: Array<Promise<USBOutTransferResult>> = []

    let off = 0
    let rem = data.length

    while (rem) {
      const chunk = data.subarray(off, off + 16384)

      // reaches maximum concurrent transfer
      if (pend.length == 4) {
        // get first transfer
        const [first, ... rest] = pend

        // wait for transfer result
        const {status} = await first

        if (status !== 'ok') throw new Error('transfer failed')

        // free transfer slot
        pend = rest
      }

      // init write
      const tf = this.dev.transferOut(this.epOut, chunk)

      pend.push(tf)

      const {length} = chunk

      off += length
      rem -= length
    }

    await Promise.all(pend)
  }
}


const {usb: USB} = navigator

const mappedViewer = document.querySelector<SignalViewerElement>('#mapped-view')!
const mapEditor = document.querySelector<MappingEditorElement>('mapping-editor')!

const inMinSlideEl = document.querySelector<HTMLInputElement>('#in-min-slide')!
const inMaxSlideEl = document.querySelector<HTMLInputElement>('#in-max-slide')!

const outMinSlideEl = document.querySelector<HTMLInputElement>('#out-min-slide')!
const outMaxSlideEl = document.querySelector<HTMLInputElement>('#out-max-slide')!

const inMinTextEl = document.querySelector<HTMLSpanElement>('#in-min-text')!
const inMaxTextEl = document.querySelector<HTMLSpanElement>('#in-max-text')!

const outMinTextEl = document.querySelector<HTMLSpanElement>('#out-min-text')!
const outMaxTextEl = document.querySelector<HTMLSpanElement>('#out-max-text')!

const applyMapBtnEl = document.querySelector<HTMLButtonElement>('#apply-map')!

const midiChanNumEl = document.querySelector<HTMLInputElement>('#midi-chan-num')!
const midiCtrlNumEl = document.querySelector<HTMLInputElement>('#midi-ctrl-num')!

const applyMidiChanBtnEl = document.querySelector<HTMLInputElement>('#apply-midi-chan-num')!
const applyMidiCtrlBtnEl = document.querySelector<HTMLInputElement>('#apply-midi-ctrl-num')!

const connectBtnEl = document.querySelector<HTMLButtonElement>('#connect')!

const saveBtnEl = document.querySelector<HTMLButtonElement>('#save')!

const importBtnEl = document.querySelector<HTMLButtonElement>('#import')!
const exportBtnEl = document.querySelector<HTMLButtonElement>('#export')!

mappedViewer.capacity = 256

mappedViewer.lockedMin = 0
mappedViewer.lockedMax = 127

const mappedChan = mappedViewer.addChannel(
  {
    lineStyle: 'hsl(280 100 75)',
    pointStyle: 'hsl(180 100 75)'
  }
)

const localMappedChan = mappedViewer.addChannel(
  {
    lineStyle: 'hsl(90 75 40)',
    pointStyle: 'hsl(60 100 50)'
  }
)

mapEditor.maps = [
  {input: 0, output: 0},
  {input: 1, output: 1}
]

const onInMinInput = () => inMinTextEl.textContent = formatNum(inMinSlideEl.valueAsNumber)
const onInMaxInput = () => inMaxTextEl.textContent = formatNum(inMaxSlideEl.valueAsNumber)

const onOutMinInput = () => outMinTextEl.textContent = formatNum(outMinSlideEl.valueAsNumber)
const onOutMaxInput = () => outMaxTextEl.textContent = formatNum(outMaxSlideEl.valueAsNumber)

onInMinInput()
onInMaxInput()

onOutMinInput()
onOutMaxInput()

inMinSlideEl.addEventListener('input', onInMinInput)
inMaxSlideEl.addEventListener('input', onInMaxInput)

outMinSlideEl.addEventListener('input', onOutMinInput)
outMaxSlideEl.addEventListener('input', onOutMaxInput)

const disableEls = (state: boolean) => {
  connectBtnEl.disabled = !state

  applyMapBtnEl.disabled = state

  applyMidiChanBtnEl.disabled = state
  applyMidiCtrlBtnEl.disabled = state

  saveBtnEl.disabled = state

  if (state) {
    mapEditor.showIn(undefined)
    mapEditor.showOut(undefined)
  }
}

const enum Request {
  setMap = 1,

  setChannelNum,
  setControllerNum,

  saveConfig,
  getConfig
}

const enum Response {
  dump = 1,

  getConfig
}

let pipe: Pipe

const dispatchPacket = async () => {
  for (;;) {
    const [head] = await pipe.read(1)

    switch (head) {
      case Response.dump: {
        const {buffer} = await pipe.read(5)

        const view = new DataView(buffer)

        const rawVal = view.getInt32(0, true)
        const mappedVal = view.getInt8(4)

        const {valueAsNumber: inMin} = inMinSlideEl
        const {valueAsNumber: inMax} = inMaxSlideEl

        const {valueAsNumber: outMin} = outMinSlideEl
        const {valueAsNumber: outMax} = outMaxSlideEl

        const inRange = inMax - inMin
        const outRange = outMax - outMin

        const normIn = (rawVal - inMin) / inRange, normOut = mapEditor.mapLookup(normIn)

        mapEditor.showIn(normIn)
        mapEditor.showOut(normOut)

        const localMappedVal = outMin + normOut * outRange

        mappedChan.addPoint(mappedVal)
        localMappedChan.addPoint(localMappedVal)

        mappedViewer.tick()
        mappedViewer.draw()

        break
      }
      case Response.getConfig: {
        const {buffer} = await pipe.read(253)

        const view = new DataView(buffer)

        midiChanNumEl.valueAsNumber = view.getUint8(0)
        midiCtrlNumEl.valueAsNumber = view.getUint8(1)

        const entryCount = view.getUint8(2)

        if (entryCount === 0) break

        const entries: Array<Mapping> = []

        for (let i = 0; i < entryCount; ++i) {
          const off = 3 + i * 5

          const input = view.getInt32(off, true)
          const output = view.getUint8(off + 4)

          const entry: Mapping = {
            input,
            output
          }

          entries.push(entry)
        }

        const {input: inMin, output: outMin} = entries[0]
        const {input: inMax, output: outMax} = entries[entryCount - 1]

        const inRange = inMax - inMin
        const outRange = outMax - outMin

        inMinSlideEl.valueAsNumber = inMin
        inMaxSlideEl.valueAsNumber = inMax

        outMinSlideEl.valueAsNumber = outMin
        outMaxSlideEl.valueAsNumber = outMax

        onInMinInput()
        onInMaxInput()

        onOutMinInput()
        onOutMaxInput()

        mapEditor.maps = entries.map(
          (item) => {
            const {input, output} = item

            return {
              input: (input - inMin) / inRange,
              output: (output - outMin) / outRange
            }
          }
        )

        break
      }
    }
  }
}

connectBtnEl.addEventListener(
  'click',
  async () => {
    let dev: USBDevice

    try {
      dev = await USB.requestDevice(
        {
          filters: [
            {
              vendorId: 0xCA52,
              productId: 0x0001
            }
          ]
        }
      )

      await dev.open()
      await dev.reset()
    }
    catch (err) {
      console.error('open dev', err)

      return
    }

    try {
      await dev.claimInterface(2)

      pipe = new VendorPipe(dev, 2, 2)
    }
    catch (err) {
      console.error('port api', err)

      return
    }

    disableEls(false)

    await pipe.write(
      new Uint8Array(
        [Request.getConfig]
      )
    )

    mappedViewer.resetTick()

    try {
      await dispatchPacket()
    }
    catch (err) {
      console.error('dispatch port', err)
    }

    disableEls(true)
  }
)

applyMidiChanBtnEl.addEventListener(
  'click',
  () => pipe.write(
    new Uint8Array(
      [Request.setChannelNum, midiChanNumEl.valueAsNumber]
    )
  )
)

applyMidiCtrlBtnEl.addEventListener(
  'click',
  () => pipe.write(
    new Uint8Array(
      [Request.setControllerNum, midiCtrlNumEl.valueAsNumber]
    )
  )
)

applyMapBtnEl.addEventListener(
  'click',
  async () => {
    const {valueAsNumber: inMin} = inMinSlideEl
    const {valueAsNumber: inMax} = inMaxSlideEl

    const {valueAsNumber: outMin} = outMinSlideEl
    const {valueAsNumber: outMax} = outMaxSlideEl

    const inRange = inMax - inMin
    const outRange = outMax - outMin

    const {maps: nodes} = mapEditor

    const buf = new ArrayBuffer(252)
    const view = new DataView(buf)

    view.setUint8(0, Request.setMap)
    view.setUint8(1, nodes.length)

    for (const [i, item] of nodes.entries()) {
      const {input, output} = item

      const off = 2 + i * 5

      const progIn = Math.round(inMin + input * inRange)
      const progOut = Math.round(outMin + output * outRange)

      view.setInt32(off, progIn, true)
      view.setUint8(off + 4, progOut)
    }

    await pipe.write(
      new Uint8Array(buf)
    )
  }
)

saveBtnEl.addEventListener(
  'click',
  () => pipe.write(
    new Uint8Array(
      [Request.saveConfig]
    )
  )
)

type Config = {
  midi: {
    chanNum: number
    ctrlNum: number
  }

  maps: Array<Mapping>
}

importBtnEl.addEventListener(
  'click',
  () => {
    const inputEl = dom(
      'input', {type: 'file'}
    )

    inputEl.addEventListener(
      'input',
      async () => {
        const [file] = inputEl.files!

        const strData = await file.text()

        const {
          midi: {
            chanNum,
            ctrlNum
          },
          maps: curves
        }: Config = JSON.parse(strData)

        midiChanNumEl.valueAsNumber = chanNum
        midiCtrlNumEl.valueAsNumber = ctrlNum

        const {input: inMin, output: outMin} = curves[0]
        const {input: inMax, output: outMax} = curves[curves.length - 1]

        const inRange = inMax - inMin
        const outRange = outMax - outMin

        inMinSlideEl.valueAsNumber = inMin
        inMaxSlideEl.valueAsNumber = inMax

        outMinSlideEl.valueAsNumber = outMin
        outMaxSlideEl.valueAsNumber = outMax

        onInMinInput()
        onInMaxInput()

        onOutMinInput()
        onOutMaxInput()

        mapEditor.maps = curves.map(
          (item): Mapping => {
            const {input, output} = item

            return {
              input: (input - inMin) / inRange,
              output: (output - outMin) / outRange
            }
          }
        )
      }
    )

    inputEl.click()
  }
)

exportBtnEl.addEventListener(
  'click',
  () => {
    const {valueAsNumber: inMin} = inMinSlideEl
    const {valueAsNumber: inMax} = inMaxSlideEl

    const {valueAsNumber: outMin} = outMinSlideEl
    const {valueAsNumber: outMax} = outMaxSlideEl

    const inRange = inMax - inMin
    const outRange = outMax - outMin

    const {maps: nodes} = mapEditor

    const data: Config = {
      midi: {
        chanNum: midiChanNumEl.valueAsNumber,
        ctrlNum: midiCtrlNumEl.valueAsNumber
      },
      maps: nodes.map(
        (item): Mapping => {
          const {input, output} = item

          return {
            input: inMin + input * inRange,
            output: outMin + output * outRange
          }
        }
      )
    }

    const jsonStr = JSON.stringify(data)
    const blobData = new Blob(
      [jsonStr],
      {type: 'application/json'}
    )

    const href = URL.createObjectURL(blobData)

    const linkEl = dom(
      'a', {
        href,
        download: 'config.json'
      }
    )

    linkEl.click()

    URL.revokeObjectURL(href)
  }
)
