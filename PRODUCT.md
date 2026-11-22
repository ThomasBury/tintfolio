# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Tintfolio serves two audiences equally. People choosing paint want to see how colours work together in a room. People choosing website colours want to see how text, backgrounds, and buttons work together on a page.

## Product Purpose

Tintfolio helps people explore colour combinations in context and take a usable palette away. A session can start with a colour the person already has or with a palette from the collection.

## Operating Context

- **Wall paint** lets people try a single colour or a pair in an illustrated room. They can switch rooms, choose where the second colour goes, and set an existing floor colour independently. The preview helps compare combinations. Lighting, materials, and the actual paint finish still need to be judged in the room.
- **Website colours** starts with a text and background pair and can expand to a palette with a button and its label. It previews the colours on a dashboard in light and dark themes and checks text, borders and icons.

## Capabilities and Constraints

- Both editors run in the browser. Each remembers the last valid design for that tab’s session. A valid shared link opens its own design ahead of the saved session.
- Both editors share designs by URL and can save four designs per editor for comparison. Wall paint prints a surface and floor spec sheet and tints a local photo in memory. Website colours exports the active theme as CSS, Tailwind or Figma Variables JSON.
- Website contrast checks AA and AAA for body text and large headings and AA for required borders and icons. Pass or fail uses the full-precision result, even when the displayed ratio rounds to the threshold.

## Evidence on Hand

- [Starting palettes and rationales](src/examples.json)
- [Wada combinations](public/wada-combinations.json) and [licence notice](public/wada-license.txt)
- [Editor browser tests](tests/browser/editors.spec.ts) and [mobile browser tests](tests/browser/mobile.spec.ts)

## Product Principles

- Give both editing jobs equal priority.
- Let people judge a colour combination where they plan to use it.
- Give the preview and the colours being tested more visual weight than the surrounding interface.
- Show a readable contrast result alongside the preview.
- Let people carry the palette into their next step through sharing or export.
