import { ceilingColour, defaultFloor, neutral, rooms, type Design } from "./design.ts";

const defs = `<defs>
  <linearGradient id="day"><stop stop-color="#fff5d5" stop-opacity=".20"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#3a3529" stop-opacity=".12"/></linearGradient>
  <linearGradient id="oak" x2="1" y2=".65"><stop stop-color="#d6af82"/><stop offset=".5" stop-color="#b9865d"/><stop offset="1" stop-color="#916446"/></linearGradient>
  <linearGradient id="linen" x2=".2" y2="1"><stop stop-color="#eee4d2"/><stop offset=".62" stop-color="#dfd1bb"/><stop offset="1" stop-color="#bea98e"/></linearGradient>
  <linearGradient id="clay" x2=".9" y2=".4"><stop stop-color="#a65e48"/><stop offset=".35" stop-color="#d59471"/><stop offset="1" stop-color="#995940"/></linearGradient>
  <linearGradient id="glass" x2=".3" y2="1"><stop stop-color="#cddbd8"/><stop offset=".52" stop-color="#eff0da"/><stop offset="1" stop-color="#a2af8e"/></linearGradient>
  <pattern id="weave" width="7" height="5" patternUnits="userSpaceOnUse"><path d="M0 1h7M2 0v5" fill="none" stroke="#765f44" stroke-width=".65" opacity=".32"/></pattern>
  <pattern id="reed" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M1 0v4" stroke="#654e35" stroke-width="1"/></pattern>
  <filter id="blur"><feGaussianBlur stdDeviation="5"/></filter>
  <g id="leaf"><path d="M0 0Q-27-9-28-36Q-5-36 0 0" fill="#53694d"/><path d="M0 0l-24-31" stroke="#879276" stroke-width="1"/></g>
  <g id="print"><rect x="2" y="3" width="89" height="113" fill="#685a48" opacity=".3"/><rect width="89" height="113" rx=".8" fill="url(#oak)"/><rect x="4" y="4" width="81" height="105" fill="#f0e4ce"/><svg x="12" y="13" width="65" height="87" viewBox="0 0 65 87"><rect width="65" height="87" fill="#ddcdb0"/><circle cx="46" cy="22" r="13" fill="#b76c4e"/><path d="M-4 80Q17 14 45 50L70 78V90H0" fill="#7e896c"/><path d="M-4 65Q17 45 33 64T70 60V90H0" fill="#475b4b"/></svg></g>
  </defs>`;

const shell = `<path data-surface="ceiling" fill="var(--ceiling)" d="M0 0h840l-101 49H106z"/>
  <path data-surface="wall" fill="var(--wall)" d="M0 0l106 49v241L0 364z"/>
  <path data-surface="feature" fill="var(--feature)" d="M106 49h633v241H106z"/>
  <path data-surface="wall" fill="var(--wall)" d="M739 49L840 0v364l-101-74z"/>
  <path fill="#25291e" opacity=".12" d="M0 0l106 49v241L0 364z"/>
  <path fill="#fffae8" opacity=".16" d="M739 49L840 0v364l-101-74z"/>
  <path pointer-events="none" fill="url(#day)" d="M0 0h840v364l-101-74H106L0 364z"/>
  <path data-surface="floor" fill="var(--floor)" d="M0 364l106-74h633l101 74v66H0z"/>
  <g fill="none" stroke="#000" opacity=".18"><path d="M0 389l210-99M87 430l199-140m-50 140l114-140m36 140l39-140m126 140l-58-140m219 140L557 290m283 119L623 290m217 71l-150-71M72 314h694M36 343h775M0 380h840"/></g>
  <path fill="var(--trim)" d="M0 350l106-70h633l101 70v13l-101-73H106L0 365z"/>
  <path fill="#776953" opacity=".23" d="M0 363l106-74h633l101 73v3l-101-73H106L0 367z"/>
  <g transform="matrix(1 .46 0 1 12 40)"><rect width="76" height="210" fill="#e9e2d0"/><rect x="6" y="6" width="64" height="195" fill="url(#glass)"/><path d="M6 160q18-38 33-8q18-54 31-26v74H6" fill="#adb69a"/><path d="M6 176q15-34 36-12q13-25 28-24v61H6" fill="#8f9e85"/><path d="M38 5v197M4 107h68" stroke="#ece7d6" stroke-width="5"/><path d="M-3 209h83v6H-3" fill="#f1eadb"/></g>
  <path d="M109 67l148 16-101 175h-47z" fill="#fff3c9" opacity=".12"/>`;

const plant = `<g fill="none" stroke="#526047" stroke-width="2.8"><path d="M0 0q-4-78-24-122M1 0q5-68 29-107M-2 0q-16-50-47-76M0 0q19-45 47-61M0 0q-1-90 9-137"/></g>
  <g><use href="#leaf" transform="translate(-18 -97)"/><use href="#leaf" transform="translate(-13 -79) rotate(85)"/><use href="#leaf" transform="translate(17 -77) rotate(25)"/><use href="#leaf" transform="translate(27 -100) rotate(75)"/><use href="#leaf" transform="translate(-38 -68) rotate(-24)"/><use href="#leaf" transform="translate(39 -54) rotate(95)"/><use href="#leaf" transform="translate(7 -125) rotate(28)"/><use href="#leaf" transform="translate(2 -66) rotate(-8)"/><use href="#leaf" transform="translate(-20 -52) rotate(-47)"/></g>
  <ellipse cy="52" rx="30" ry="5" fill="#574435" opacity=".24"/><path d="M-25 0h50l-6 48q-18 10-38 0z" fill="url(#clay)"/><ellipse rx="25" ry="6" fill="#c78f6d"/><ellipse rx="20" ry="3" fill="#6b5845"/>`;

const rug = `<path id="rug" d="M188 312h395l128 90H58z" fill="#d8c8aa"/><use href="#rug" fill="url(#weave)"/><path d="M193 317h387l109 79H83z" fill="none" stroke="#a89574" stroke-width="2"/>`;
const living = `<use href="#print" transform="translate(314 69) scale(1.02)"/>
  <g transform="translate(112 94)"><path d="M34 58v141" stroke="#806140" stroke-width="4"/><ellipse cx="34" cy="199" rx="22" ry="4" fill="#886b4c"/><path d="M20 7h27l18 52H1z" fill="#e8d5ae"/><path d="M21 8l-10 49m16-49l-5 50m14-50v50m6-50l8 50" fill="none" stroke="#c4b28d"/><ellipse cx="33" cy="59" rx="32" ry="4" fill="#d1bc96"/></g>
  ${rug}
  <ellipse cx="354" cy="323" rx="166" ry="11" fill="#5e513e" opacity=".28" filter="url(#blur)"/>
  <g stroke="#ad997c" stroke-width="1.2"><path d="M176 289l12 32h6l2-32m292-4l-5 34h-7l-1-32" fill="#76563b"/>
  <rect x="175" y="194" width="318" height="107" rx="18" fill="url(#linen)"/>
  <rect x="194" y="189" width="136" height="73" rx="14" fill="url(#linen)"/><rect x="330" y="189" width="141" height="73" rx="14" fill="url(#linen)"/>
  <path d="M189 254q1-7 12-8h260q12 0 16 8l4 23H185z" fill="#d4c3a9"/>
  <rect x="187" y="251" width="145" height="28" rx="9" fill="url(#linen)"/><rect x="332" y="251" width="143" height="28" rx="9" fill="url(#linen)"/>
  <rect x="173" y="276" width="316" height="30" rx="9" fill="#caba9e"/><rect x="163" y="229" width="36" height="77" rx="14" fill="url(#linen)"/><rect x="465" y="229" width="36" height="77" rx="14" fill="url(#linen)"/>
  <path d="M201 245l8-43q17 0 49 10l-7 40q-21 4-50-7z" fill="#aa7357" stroke="#97664e"/><path d="M208 240l7-31 35 8-4 28z" fill="url(#weave)" stroke="none"/>
  <path d="M416 244l-9-38 45-8 10 43q-19 10-46 3z" fill="#838d76" stroke="#727d65"/></g>
  <g transform="translate(546 225)"><path d="M4 27l6 55h5l1-55m47 0l-3 50h-5l-3-50" fill="#77563b"/><rect y="18" width="70" height="13" rx="3" fill="url(#oak)"/><rect x="7" y="13" width="32" height="5" fill="#706c53"/><rect x="10" y="9" width="26" height="4" fill="#e7ddc6"/><path d="M50 16q-12-9-3-18l2-6h6l2 6q9 11-2 18z" fill="#b77a5c"/></g>
  <g transform="translate(696 266) scale(.86)">${plant}</g>
  <g transform="translate(346 323)"><ellipse cx="52" cy="42" rx="113" ry="9" opacity=".14" filter="url(#blur)"/><path d="M-21 0l-8 38h7L-5 1m109 2l10 37h-7L87 3m-40 0l-1 24h6l9-24" fill="#785638"/><ellipse cx="45" cy="1" rx="101" ry="24" fill="#906849"/><ellipse cx="45" cy="-4" rx="101" ry="22" fill="url(#oak)"/><path d="M-16-9l33-4 20 8-34 5z" fill="#4e5b50"/><path d="M-14-12l32-4 17 8-32 5z" fill="#e2d6bc"/><path d="M54-13q1 14 16 14t17-14z" fill="#c9aa8b"/><ellipse cx="70" cy="-13" rx="16" ry="4" fill="#987c62"/></g>`;

const bedroom = `<use href="#print" transform="translate(361 64) scale(.85)"/>${rug}
  <path d="M161 264h70v40h-70z" fill="url(#oak)"/><path d="M168 302v12m56-12v12" stroke="#79583c" stroke-width="5"/>
  <path d="M191 232v30m-9 0h18" stroke="#7f6649" stroke-width="3"/><path d="M182 203h18l10 29h-39z" fill="#e3cba2"/>
  <g stroke="#ad9678"><rect x="247" y="174" width="301" height="105" rx="27" fill="url(#oak)"/><rect x="261" y="184" width="273" height="90" rx="20" fill="#cfba98"/><rect x="261" y="184" width="273" height="90" rx="20" fill="url(#reed)" opacity=".58"/>
  <path d="M248 251h295l65 91v15H190v-13z" fill="#916e4f"/><path d="M248 235h295l65 97v15H189v-15z" fill="url(#linen)"/>
  <path d="M270 219q0-7 10-7h92q12 1 16 8l-2 32H255zM412 219q1-8 11-8h86q10 0 13 7l16 33H408z" fill="#eee4d2"/>
  <path d="M224 266h342l42 67v9H189v-9z" fill="#bebaa3"/><path d="M215 282h361l19 30H201z" fill="#89927a"/><path d="M216 286h361m-367 15h377" stroke="#a7ae95" stroke-width="3"/></g>
  <path d="M201 354v15m391-15v15" stroke="#74573e" stroke-width="8"/>
  <g transform="translate(671 262) scale(.85)">${plant}</g>`;

const kitchen = `<g transform="translate(185 84)"><rect y="66" width="184" height="7" fill="url(#oak)"/><path d="M17 73v9m147-9v9" stroke="#84684c" stroke-width="4"/>
  <g fill="#e8deca" stroke="#b5a48b"><path d="M12 46h24v18H12zm24 2q15-3 4 11h-4"/><path d="M44 48h22v16H44zm22 2q12-2 3 9h-3"/>
  <path d="M94 50h35q-3 15-17 16t-18-16z"/></g><path d="M145 66q-15-14-3-28l3-11h10l3 11q14 17-3 28z" fill="url(#clay)"/></g>
  <g stroke="#b5a88c"><path d="M159 204h504v85H159z" fill="#c8c5ad"/><path d="M165 214h78v68h-78zm84 0h78v68h-78zm84 0h85v68h-85zm91 0h105v68H424zm111 0h121v68H535z" fill="#ded7c1"/>
  <path d="M155 199h513v9H155z" fill="#eee5d4"/><path d="M221 226h13m27 0h13m119 0h13m32 0h13m187 0h13" stroke="#8f795d" stroke-width="3"/></g>
  <path d="M424 198v-19q0-17 14-17t14 16" fill="none" stroke="#816c54" stroke-width="4"/><ellipse cx="447" cy="199" rx="28" ry="2.5" fill="#9d9585"/>
  <path d="M596 194q-4-32 4-35h11q8 3 8 35z" fill="#b08b6b"/><path d="M602 159l-9-17m13 17 3-19m2 19 10-15" stroke="#80664a" stroke-width="3"/>
  <path d="M469 47v37m91-37v37" stroke="#645c4f" stroke-width="2"/><g fill="#d4bd91"><path d="M440 107q2-25 29-25t30 25zM531 107q2-25 29-25t30 25z"/></g>
  <ellipse cx="397" cy="356" rx="160" ry="11" opacity=".15" filter="url(#blur)"/>
  <path d="M235 289h320v58H235z" fill="url(#oak)"/><path d="M235 289h320v58H235z" fill="url(#reed)" opacity=".5"/><path d="M225 288l32-22h271l36 22v6H225z" fill="#eadfcb"/>
  <path d="M323 324l-8 44m50-44 9 44m69-44-9 44m51-44 9 44" stroke="#806446" stroke-width="5"/><g fill="#a67e54"><ellipse cx="345" cy="325" rx="29" ry="7"/><ellipse cx="465" cy="325" rx="29" ry="7"/></g>
  <path d="M362 267q3 13 23 13t24-13z" fill="#ae7d58"/><g fill="#999660"><circle cx="372" cy="265" r="6"/><circle cx="385" cy="264" r="7"/><circle cx="398" cy="266" r="6"/></g>`;

const furnishings = { living, bedroom, kitchen };
export function room(d: Design) {
  const feature =
    d.mode === "pair" && d.pair === "feature"
      ? d.colours.feature
      : d.colours.wall;
  return `<svg id="room" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 430" role="img" aria-label="${rooms[d.room]} paint preview" style="--wall:${d.colours.wall};--feature:${feature};--ceiling:${ceilingColour(d)};--trim:${neutral.trim};--floor:${d.floor ?? defaultFloor}">${defs}${shell}${furnishings[d.room]}</svg>`;
}
