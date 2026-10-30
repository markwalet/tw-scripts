// ui/renderer.js — THE swap point (DESIGN.md §7).
// `@renderer` is aliased at build time (build.mjs --renderer=modern|native|minimal).
// Everything imports the active renderer from here, never from a specific renderers/*.js.
//
// The Renderer contract (all timing logic stays in controllers; renderers only paint
// and report input via handlers):
//
//   mount(rootEl, { t, initialValues:{date,time,ms,remember}, handlers })
//   renderBar({ percent, state, targetPct, clockText })           // state: waiting|ready|idle
//   renderSendTime({ sendText, tooLate })
//   reflectInputs({ date, time, ms, remember })                   // any subset
//   cue({ kind })                                                 // enter-green|send
//   styleIncomingSendCell(cellEl, { sendEndtime })
//   mountSettings(rootEl, { schema, values, onChange })
//   destroy()
//
//   handlers: onArrivalInput({date,time,ms}), onPaste(text, current{date,time,ms}),
//             onRememberToggle(bool), onOpenSettings()

export { Renderer } from '@renderer';
