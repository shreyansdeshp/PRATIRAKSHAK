/* faint radar-plot tile under the aircraft */
const S = "stroke='%23e8e4c8' fill='none'";
const TILE =
  "<svg xmlns='http://www.w3.org/2000/svg' width='360' height='360'>" +
  `<g ${S} stroke-opacity='0.07' stroke-width='1'><circle cx='180' cy='180' r='50'/><circle cx='180' cy='180' r='100'/><circle cx='180' cy='180' r='150' stroke-dasharray='3 6'/>` +
  "<path d='M180 20V340M20 180H340'/></g></svg>";
const PATTERN = `url("data:image/svg+xml;utf8,${TILE}")`;

/** Plain surround with a faint radar-plot tile. */
export function Backdrop(_: { stageW?: number }) {
  return <div aria-hidden style={{ position: "absolute", inset: 0, background: "var(--backdrop)", backgroundImage: PATTERN, backgroundSize: "360px 360px" }} />;
}
